import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Private Python analytics child is supervised by start.mjs in this same workflow.
app.use("/api/vireo", async (req, res) => {
  try {
    const upstream = process.env.VIREO_ANALYTICS_URL || "http://127.0.0.1:18765";
    const response = await fetch(upstream + req.originalUrl, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(180_000),
    });
    res.status(response.status).type("application/json").send(await response.text());
  } catch (err) {
    req.log.error({ err }, "Analytics service unavailable");
    res.status(503).json({ error: "Analytics service is starting or unavailable. Source files are unchanged; retry shortly." });
  }
});

app.use("/api", router);

export default app;
