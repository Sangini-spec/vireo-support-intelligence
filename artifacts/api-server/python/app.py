"""Private FastAPI service. Express is the public /api gateway."""
from pathlib import Path

import jsonschema
import yaml
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

import ai
import reports
from engine import ROOT, get_dataset, normalize_filters, public_ticket

app = FastAPI(title="Vireo analytics", docs_url=None, redoc_url=None, openapi_url=None)
SPEC = yaml.safe_load((ROOT / "lib/api-spec/openapi.yaml").read_text())
RESOLVER = jsonschema.RefResolver.from_schema(SPEC)


def body_check(name, data):
    jsonschema.Draft202012Validator(SPEC["components"]["schemas"][name], resolver=RESOLVER,
                                  format_checker=jsonschema.FormatChecker()).validate(data)
    if "filters" in data:
        data["filters"] = normalize_filters(data["filters"])
    return data


@app.exception_handler(ValueError)
async def value_error(_request, exc):
    return JSONResponse(status_code=400, content={"error": str(exc)[:400]})


@app.exception_handler(jsonschema.ValidationError)
async def validation_error(_request, exc):
    return JSONResponse(status_code=400, content={"error": f"Invalid request: {exc.message[:300]}"})


@app.get("/internal/health")
def health():
    ds = get_dataset()
    return {"status": "ok", "dataset_version": ds.version}


@app.get("/api/vireo/meta")
def meta():
    return get_dataset().metadata(ai.available(), ai.MODEL)


@app.get("/api/vireo/dashboard")
def dashboard(request: Request):
    return get_dataset().dashboard(dict(request.query_params))


@app.get("/api/vireo/weeks")
def weeks(request: Request):
    return get_dataset().weeks(normalize_filters(dict(request.query_params)))


def pagination(params):
    page, size = int(params.get("page", 1)), int(params.get("page_size", 25))
    if page < 1 or size < 1 or size > 100:
        raise ValueError("page must be positive; page_size must be 1–100.")
    return page, size


@app.get("/api/vireo/tickets")
def tickets(request: Request):
    ds = get_dataset()
    params = dict(request.query_params)
    filters = normalize_filters(params)
    rows = ds.select(filters)
    query = params.get("search", "").strip().lower()
    if len(query) > 200:
        raise ValueError("Search is too long.")
    if query:
        rows = [r for r in rows if query in " ".join((r["ticket_id"], r["agent_name"], r["category"],
                  ds.by_id[r["ticket_id"]]["customer_message"], ds.by_id[r["ticket_id"]]["agent_notes"])).lower()]
    breach = params.get("breach", "all")
    if breach not in ["all", "breached", "within", "unknown"]:
        raise ValueError("Invalid breach filter.")
    if breach != "all":
        target = {"breached": True, "within": False, "unknown": None}[breach]
        rows = [r for r in rows if r["breached"] is target]
    rows = sorted(rows, key=lambda r: (r["created_at"], r["ticket_id"]), reverse=True)
    page, size = pagination(params)
    return {"items": [public_ticket(r) for r in rows[(page - 1) * size:page * size]],
            "total": len(rows), "page": page, "page_size": size, "dataset_version": ds.version}


@app.get("/api/vireo/tickets/{ticket_id}")
def ticket(ticket_id: str):
    ds = get_dataset()
    try:
        result = ds.ticket(ticket_id)
    except KeyError:
        return JSONResponse(status_code=404, content={"error": "Canonical ticket not found; it may be quarantined."})
    result["classifications"] = ai.get_classifications(ds, ticket_id)
    return result


@app.get("/api/vireo/validation")
def validation(request: Request):
    ds = get_dataset()
    result = ds.validation(dict(request.query_params))
    result["ai_evaluation_status"] = ai.evaluation(ds)["status"]
    return result


@app.get("/api/vireo/duplicates")
def duplicates(request: Request):
    params = dict(request.query_params)
    page, size = pagination(params)
    values = get_dataset().duplicates
    if params.get("conflicts_only", "false") not in ("true", "false"):
        raise ValueError("conflicts_only must be true or false.")
    if params.get("conflicts_only") == "true":
        values = [v for v in values if v["quarantined"]]
    return {"items": values[(page - 1) * size:page * size], "total": len(values), "page": page, "page_size": size}


@app.get("/api/vireo/insights")
def insights(request: Request):
    return ai.get_insights(get_dataset(), dict(request.query_params))


@app.get("/api/vireo/evaluations")
def evaluation():
    return ai.evaluation(get_dataset())


@app.post("/api/vireo/insights")
async def generate_insights(request: Request):
    values = body_check("AnalysisInput", await request.json())
    return await run_in_threadpool(ai.generate_insights, get_dataset(), values)


@app.post("/api/vireo/classifications")
async def classify(request: Request):
    values = body_check("ClassificationInput", await request.json())
    return await run_in_threadpool(ai.classify, get_dataset(), values)


@app.post("/api/vireo/evaluations")
async def review(request: Request):
    values = body_check("EvaluationInput", await request.json())
    if not values["reviewer"].strip():
        raise ValueError("Reviewer name is required.")
    return await run_in_threadpool(ai.review, get_dataset(), values)


@app.post("/api/vireo/ask")
async def ask(request: Request):
    values = body_check("QuestionInput", await request.json())
    if not values["question"].strip():
        raise ValueError("Question is required.")
    return await run_in_threadpool(ai.ask, get_dataset(), values)


@app.post("/api/vireo/brief")
async def brief(request: Request):
    values = body_check("BriefInput", await request.json())
    return await run_in_threadpool(reports.brief, get_dataset(), values)