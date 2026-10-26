import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { CSSProperties } from "react";
import type { TooltipContentProps } from "recharts";
import { supabase } from "../supabase";
import type { HistoryBucket } from "../types";

type Range = "24h" | "7d" | "30d";
const RANGES: Record<Range, { hours: number; bucket: number }> = {
  "24h": { hours: 24, bucket: 30 },
  "7d": { hours: 24 * 7, bucket: 180 },
  "30d": { hours: 24 * 30, bucket: 720 },
};
const isRange = (r: string | null): r is Range => r !== null && r in RANGES;
const COLORS = { gain: "#5DDC7A", loss: "#FF6B6B", grid: "#263238", axis: "#8A9AA3" };

// Each unit has its own scale. Platinum sits on the left; the first other unit that's
// switched on gets the right-hand axis, and any further ones keep their own hidden scale.
type AxisId = "plat" | "ratio" | "count";
const AXES: Record<AxisId, { unit: string }> = {
  plat: { unit: "p" },
  ratio: { unit: "×" },
  count: { unit: "" },
};

type SeriesKey = "profit" | "range" | "ratio" | "seller" | "buyer" | "sellers" | "buyers";
interface Series {
  key: SeriesKey;
  label: string;
  axis: AxisId;
  kind: "bar" | "area" | "line";
  color: string;
  extended?: boolean;
}

// One chart slot per time bucket; values are null where the bucket had no data
interface Point {
  t: number;
  full: string;
  profit: number | null;
  minProfit: number | null;
  maxProfit: number | null;
  range: [number, number] | null;
  seller: number | null;
  buyer: number | null;
  sellers: number | null;
  buyers: number | null;
  ratio: number | null;
  samples: number;
}

// "extended" statistics need the mod_stats_history function in Supabase
const SERIES: Series[] = [
  { key: "profit", label: "Profit", axis: "plat", kind: "bar", color: COLORS.gain },
  { key: "range", label: "Profit range", axis: "plat", kind: "area", color: COLORS.gain, extended: true },
  { key: "ratio", label: "Buyers per seller", axis: "ratio", kind: "line", color: "#4FD1C5", extended: true },
  { key: "seller", label: "Buy at", axis: "plat", kind: "line", color: "#7CC4FF" },
  { key: "buyer", label: "Sell at", axis: "plat", kind: "line", color: "#F5B85C" },
  { key: "sellers", label: "Sellers online", axis: "count", kind: "line", color: "#B48CFF", extended: true },
  { key: "buyers", label: "Buyers online", axis: "count", kind: "line", color: "#9AA8B1", extended: true },
];
const DEFAULT_ON: SeriesKey[] = ["profit", "seller", "buyer"];

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
function round(v: number, digits?: number): number;
function round(v: number | null, digits?: number): number | null;
function round(v: number | null, digits = 0) {
  return v === null ? null : Number(v.toFixed(digits));
}

function formatValue(s: Series, p: Point) {
  if (s.key === "range") {
    return p.minProfit === null ? "—" : `${p.minProfit} to ${p.maxProfit}p`;
  }
  const v = p[s.key];
  return v === null || v === undefined ? "—" : `${v}${AXES[s.axis].unit}`;
}

function StatsTooltip({ active, payload, series }: Partial<TooltipContentProps<number, string>> & { series: Series[] }) {
  if (!active || !payload?.length) return null;
  const p: Point = payload[0].payload;
  if (!p.samples) {
    return (
      <div className="tooltip">
        <strong>{p.full}</strong>
        <div className="muted">No data in this period</div>
      </div>
    );
  }
  return (
    <div className="tooltip">
      <strong>{p.full}</strong>
      {series.map((s) => (
        <div key={s.key} className="tooltip-row">
          <span className="tooltip-swatch" style={{ background: s.color }} aria-hidden="true" />
          {s.label}: {formatValue(s, p)}
        </div>
      ))}
      <div className="muted">{p.samples} samples</div>
    </div>
  );
}

async function loadHistory(mod: string, since: string, bucket: number) {
  const args = { p_mod: mod, p_since: since, p_bucket_minutes: bucket };
  const full = await supabase.rpc("mod_stats_history", args);
  if (!full.error) return { data: full.data as HistoryBucket[], error: null, extended: true };
  // the extended function hasn't been created yet: fall back to price-only history
  const basic = await supabase.rpc("mod_spread_history", args);
  return { data: basic.data as HistoryBucket[] | null, error: basic.error, extended: false };
}

// How far the buy price typically strays from its average, as a % of that average
// (sample-weighted standard deviation over mean). Under 5% barely moves; over 15% swings hard.
function priceStability(filled: Point[]) {
  const valid = filled.filter((d): d is Point & { seller: number } => d.seller !== null);
  const total = valid.reduce((n, d) => n + d.samples, 0);
  if (valid.length < 2 || !total) return null;
  const mean = valid.reduce((sum, d) => sum + d.seller * d.samples, 0) / total;
  const variance = valid.reduce((sum, d) => sum + (d.seller - mean) ** 2 * d.samples, 0) / total;
  const swing = mean ? (Math.sqrt(variance) / mean) * 100 : 0;
  const label = swing < 5 ? "Stable" : swing < 15 ? "Some movement" : "Volatile";
  return { swing: round(swing, 1), label, level: label === "Stable" ? "gain" : label === "Volatile" ? "loss" : "", mean: round(mean) };
}

// Headline numbers for the whole selected range, weighted by how many samples each bucket has
function summarize(data: Point[]) {
  const filled = data.filter((d): d is Point & { profit: number } => d.samples > 0 && d.profit !== null);
  if (!filled.length) return null;
  const weighted = (key: "profit" | "ratio") => {
    const valid = filled.filter((d) => d[key] !== null);
    const total = valid.reduce((n, d) => n + d.samples, 0);
    return total ? valid.reduce((sum, d) => sum + d[key]! * d.samples, 0) / total : null;
  };
  const best = filled.reduce((a, b) => ((b.maxProfit ?? b.profit) > (a.maxProfit ?? a.profit) ? b : a));
  return {
    avgProfit: round(weighted("profit")),
    peak: best.maxProfit ?? best.profit,
    peakAt: best.full,
    ratio: round(weighted("ratio"), 2),
    stability: priceStability(filled),
  };
}

export default function Spread() {
  const [params, setParams] = useSearchParams();
  const mod = params.get("mod") || "";
  const rangeParam = params.get("range");
  const range: Range = isRange(rangeParam) ? rangeParam : "24h";

  const [allMods, setAllMods] = useState<string[]>([]);
  const [text, setText] = useState(mod.replaceAll("_", " "));
  const [rows, setRows] = useState<HistoryBucket[] | null>(null);
  const [extended, setExtended] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(() => new Set<SeriesKey>(DEFAULT_ON));

  useEffect(() => {
    supabase.from("mod_prices").select("mod").order("mod")
      .then(({ data }) => setAllMods((data || []).map((r: { mod: string }) => r.mod)));
  }, []);

  useEffect(() => {
    if (!mod) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    const { hours, bucket } = RANGES[range];
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    loadHistory(mod, since, bucket).then(({ data, error, extended }) => {
      if (cancelled) return;
      setExtended(extended);
      if (error) setError(error.message);
      else setRows(data);
    });
    return () => { cancelled = true; };
  }, [mod, range]);

  function onSearch(value: string) {
    setText(value);
    const slug = value.trim().toLowerCase().replaceAll(" ", "_");
    if (allMods.includes(slug)) setParams({ mod: slug, range });
  }

  function changeRange(r: Range) {
    setParams(mod ? { mod, range: r } : { range: r });
  }

  function toggle(key: SeriesKey) {
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const { chartData, ticks, formatTick } = useMemo(() => {
    const { hours, bucket } = RANGES[range];
    const bucketMs = bucket * 60_000;
    const end = Math.floor(Date.now() / bucketMs) * bucketMs;
    const start = Math.floor((Date.now() - hours * 3_600_000) / bucketMs) * bucketMs;
    const byTime = new Map((rows || []).map((r) => [new Date(r.bucket).getTime(), r]));

    // one slot per bucket, so missing data shows up as a gap
    const data: Point[] = [];
    for (let t = start; t <= end; t += bucketMs) {
      const r = byTime.get(t);
      const profit = num(r?.avg_profit);
      const seller = num(r?.avg_seller_price);
      const sellers = num(r?.avg_seller_count);
      const buyers = num(r?.avg_buyer_count);
      const minProfit = num(r?.min_profit);
      const maxProfit = num(r?.max_profit);
      data.push({
        t,
        full: new Date(t).toLocaleString(),
        profit,
        minProfit,
        maxProfit,
        range: minProfit !== null && maxProfit !== null ? [minProfit, maxProfit] : null,
        seller,
        buyer: num(r?.avg_buyer_price),
        sellers,
        buyers,
        ratio: buyers !== null && sellers ? round(buyers / sellers, 2) : null,
        samples: r ? r.samples : 0,
      });
    }

    // label the first bucket of each evenly sized step, in local time
    const stepMs =
      range === "24h" ? 3 * 3_600_000 : range === "7d" ? 24 * 3_600_000 : 5 * 24 * 3_600_000;
    const localStep = (t: number) =>
      Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / stepMs);
    const tickList = data
      .filter((d, i) => i > 0 && localStep(d.t) !== localStep(data[i - 1].t))
      .map((d) => d.t);

    const opts: Intl.DateTimeFormatOptions =
      range === "24h" ? { hour: "2-digit", minute: "2-digit" }
      : range === "7d" ? { weekday: "short", day: "numeric" }
      : { month: "short", day: "numeric" };
    const formatTick = (t: number) => new Date(t).toLocaleString([], opts);

    return { chartData: data, ticks: tickList, formatTick };
  }, [rows, range]);

  const summary = useMemo(() => summarize(chartData), [chartData]);
  const available = SERIES.filter((s) => extended || !s.extended);
  const active = available.filter((s) => shown.has(s.key));
  const hasData = chartData.some((d) => d.samples > 0);
  const rightAxis = active.find((s) => s.axis !== "plat")?.axis;
  const showPlat = active.some((s) => s.axis === "plat");

  return (
    <main>
      <h1>Analytics</h1>
      <p className="lede">
        How a mod's profit, return, and demand have moved over time. Each point is an average over
        its time bucket
      </p>

      <div className="controls">
        <input className="search" type="text" list="mod-list" placeholder="Search a mod"
          value={text} onChange={(e) => onSearch(e.target.value)} aria-label="Search a mod" />
        <datalist id="mod-list">
          {allMods.map((m) => <option key={m} value={m.replaceAll("_", " ")} />)}
        </datalist>
        <div className="seg" role="group" aria-label="Time range">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <button key={r} type="button" aria-pressed={r === range} onClick={() => changeRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {!mod && <p className="note">Pick a mod to see how it has moved.</p>}
      {error && <p className="note">Couldn't load history: {error}. Check that the mod_stats_history function exists in Supabase.</p>}
      {mod && !error && !rows && <p className="note">Loading history…</p>}
      {rows && !hasData && (
        <p className="note">No data for this mod in this range. We might have a server issue...</p>
      )}

      {hasData && (
        <>
          {summary && (
            <dl className="stat-tiles">
              <div>
                <dt>Average profit</dt>
                <dd>{summary.avgProfit}p</dd>
              </div>
              <div>
                <dt>Peak profit</dt>
                <dd>{summary.peak}p<span className="stat-sub">{summary.peakAt}</span></dd>
              </div>
              {summary.stability && (
                <div>
                  <dt>Price stability</dt>
                  <dd className={summary.stability.level}>
                    {summary.stability.label}
                    <span className="stat-sub">
                      Buy price swings ±{summary.stability.swing}% around {summary.stability.mean}p
                    </span>
                  </dd>
                </div>
              )}
              {summary.ratio !== null && (
                <div>
                  <dt>Buyers per seller</dt>
                  <dd>{summary.ratio}×</dd>
                </div>
              )}
            </dl>
          )}

          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="t" ticks={ticks} tickFormatter={formatTick} interval="preserveStart"
                  minTickGap={12} stroke={COLORS.axis} />
                {(Object.entries(AXES) as [AxisId, { unit: string }][]).map(([id, a]) => {
                  const hidden = id === "plat" ? !showPlat : id !== rightAxis;
                  // hidden axes still reserve their width, so shrink them to nothing
                  return (
                    <YAxis key={id} yAxisId={id} orientation={id === "plat" ? "left" : "right"}
                      unit={a.unit} width={hidden ? 0 : 52} hide={hidden} stroke={COLORS.axis}
                      allowDecimals={id === "ratio"} />
                  );
                })}
                {showPlat && <ReferenceLine yAxisId="plat" y={0} stroke={COLORS.axis} />}
                <Tooltip content={<StatsTooltip series={active} />} isAnimationActive={false}
                  cursor={{ fill: "rgba(124, 196, 255, 0.06)" }} />
                {active.map((s) => {
                  if (s.kind === "bar") {
                    return (
                      <Bar key={s.key} yAxisId={s.axis} dataKey={s.key} isAnimationActive={false}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={(d.profit ?? 0) >= 0 ? COLORS.gain : COLORS.loss} fillOpacity={0.55} />
                        ))}
                      </Bar>
                    );
                  }
                  if (s.kind === "area") {
                    return (
                      <Area key={s.key} yAxisId={s.axis} dataKey={s.key} type="linear" stroke="none"
                        fill={s.color} fillOpacity={0.15} connectNulls isAnimationActive={false} />
                    );
                  }
                  return (
                    <Line key={s.key} yAxisId={s.axis} dataKey={s.key} type="linear" stroke={s.color}
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }} activeDot={{ r: 4 }}
                      connectNulls isAnimationActive={false} />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="series-toggles" role="group" aria-label="Statistics shown">
            {available.map((s) => (
              <button key={s.key} type="button" className="series-toggle" aria-pressed={shown.has(s.key)}
                onClick={() => toggle(s.key)} style={{ "--swatch": s.color } as CSSProperties}>
                <span className={`swatch ${s.kind}`} aria-hidden="true" />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
