import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGetVireoMeta, type Filters, type Metadata } from "@workspace/api-client-react";

type FilterKey = keyof Filters;

interface Ctx {
  filters: Filters;
  params: Filters;
  meta: Metadata | undefined;
  metaLoading: boolean;
  metaError: boolean;
  refetchMeta: () => void;
  set: <K extends FilterKey>(key: K, value: Filters[K] | undefined) => void;
  patch: (p: Partial<Filters>) => void;
  reset: () => void;
}

const FilterCtx = createContext<Ctx | null>(null);
const STORAGE = "vireo.filters.session.v3";
const STALE = ["vireo.filters.v1", "vireo.filters.v2"];

function clean(f: Filters): Filters {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== "") out[k] = String(v);
  return out as Filters;
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const metaQ = useGetVireoMeta();
  const [hadSession] = useState(() => {
    try { return sessionStorage.getItem(STORAGE) != null; } catch { return false; }
  });
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      STALE.forEach((k) => localStorage.removeItem(k));
      const raw = sessionStorage.getItem(STORAGE);
      if (raw) return JSON.parse(raw) as Filters;
    } catch {
      /* ignore */
    }
    return { scope: "policy" };
  });
  const defaultWeek = metaQ.data?.default_week;
  const seeded = useRef(hadSession);
  useEffect(() => {
    if (seeded.current || !defaultWeek) return;
    seeded.current = true;
    setFilters((f) => (f.week || f.start_date || f.end_date ? f : { ...f, week: defaultWeek }));
  }, [defaultWeek]);
  useEffect(() => {
    sessionStorage.setItem(STORAGE, JSON.stringify(filters));
  }, [filters]);

  const set = useCallback(<K extends FilterKey>(key: K, value: Filters[K] | undefined) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);
  const patch = useCallback((p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p })), []);
  const reset = useCallback(() => setFilters({ scope: "policy", week: defaultWeek }), [defaultWeek]);
  const params = useMemo(() => clean({ scope: "policy", ...filters }), [filters]);

  return (
    <FilterCtx.Provider
      value={{
        filters,
        params,
        meta: metaQ.data,
        metaLoading: metaQ.isLoading,
        metaError: metaQ.isError,
        refetchMeta: () => void metaQ.refetch(),
        set,
        patch,
        reset,
      }}
    >
      {children}
    </FilterCtx.Provider>
  );
}

export function useFilters() {
  const c = useContext(FilterCtx);
  if (!c) throw new Error("FilterProvider missing");
  return c;
}

export const FILTER_LABELS: Record<FilterKey, string> = {
  scope: "Scope",
  week: "Week",
  start_date: "From",
  end_date: "To",
  channel: "Channel",
  shift: "Resolving shift",
  arrival_shift: "Arrival shift",
  agent: "Agent",
  team: "Roster team",
  roster_event: "Roster date",
  tier: "Tier",
};
