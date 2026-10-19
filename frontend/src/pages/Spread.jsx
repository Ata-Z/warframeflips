import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "../supabase";

const RANGES = {
  "24h": { hours: 24, bucket: 30 },
  "7d": { hours: 24 * 7, bucket: 180 },
  "30d": { hours: 24 * 30, bucket: 720 },
};
const COLORS = { gain: "#17795A", loss: "#B23A2B", grid: "#C9D1D8", axis: "#5B6A77" };
const fmt = (v) => (v === null || v === undefined ? "—" : `${v}p`);

function SpreadTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
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
      <div>Buy at: {fmt(p.seller)}</div>
      <div>Sell at: {fmt(p.buyer)}</div>
      <div>Profit: {fmt(p.profit)}</div>
      <div className="muted">{p.samples} samples</div>
    </div>
  );
}

export default function Spread() {
  const [params, setParams] = useSearchParams();
  const mod = params.get("mod") || "";
  const range = RANGES[params.get("range")] ? params.get("range") : "24h";

  const [allMods, setAllMods] = useState([]);
  const [text, setText] = useState(mod.replaceAll("_", " "));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.from("mod_prices").select("mod").order("mod")
      .then(({ data }) => setAllMods((data || []).map((r) => r.mod)));
  }, []);

  useEffect(() => {
    if (!mod) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    const { hours, bucket } = RANGES[range];
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    supabase
      .rpc("mod_spread_history", { p_mod: mod, p_since: since, p_bucket_minutes: bucket })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setRows(data);
      });
    return () => { cancelled = true; };
  }, [mod, range]);

  function onSearch(value) {
    setText(value);
    const slug = value.trim().toLowerCase().replaceAll(" ", "_");
    if (allMods.includes(slug)) setParams({ mod: slug, range });
  }

  function changeRange(r) {
    setParams(mod ? { mod, range: r } : { range: r });
  }

  const { chartData, ticks, formatTick } = useMemo(() => {
    const { hours, bucket } = RANGES[range];
    const bucketMs = bucket * 60_000;
    const end = Math.floor(Date.now() / bucketMs) * bucketMs;
    const start = Math.floor((Date.now() - hours * 3_600_000) / bucketMs) * bucketMs;
    const byTime = new Map((rows || []).map((r) => [new Date(r.bucket).getTime(), r]));

    // one slot per bucket, so missing data shows up as a gap
    const data = [];
    for (let t = start; t <= end; t += bucketMs) {
      const r = byTime.get(t);
      data.push({
        t,
        full: new Date(t).toLocaleString(),
        profit: r ? r.avg_profit : null,
        seller: r ? r.avg_seller_price : null,
        buyer: r ? r.avg_buyer_price : null,
        samples: r ? r.samples : 0,
      });
    }

    // label the first bucket of each evenly sized step, in local time
    const stepMs =
      range === "24h" ? 3 * 3_600_000 : range === "7d" ? 24 * 3_600_000 : 5 * 24 * 3_600_000;
    const localStep = (t) =>
      Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / stepMs);
    const tickList = data
      .filter((d, i) => i > 0 && localStep(d.t) !== localStep(data[i - 1].t))
      .map((d) => d.t);

    const opts =
      range === "24h" ? { hour: "2-digit", minute: "2-digit" }
      : range === "7d" ? { weekday: "short", day: "numeric" }
      : { month: "short", day: "numeric" };
    const formatTick = (t) => new Date(t).toLocaleString([], opts);

    return { chartData: data, ticks: tickList, formatTick };
  }, [rows, range]);

  const hasData = chartData.some((d) => d.profit !== null);

  return (
    <main>
      <h1>Spread history</h1>
      <p className="lede">
        Average best-case profit per time bucket: the cheapest online sell against the highest
        online buy. Hover a bar for the prices behind it.
      </p>

      <div className="controls">
        <input className="search" type="text" list="mod-list" placeholder="Search a mod"
          value={text} onChange={(e) => onSearch(e.target.value)} aria-label="Search a mod" />
        <datalist id="mod-list">
          {allMods.map((m) => <option key={m} value={m.replaceAll("_", " ")} />)}
        </datalist>
        <div className="seg" role="group" aria-label="Time range">
          {Object.keys(RANGES).map((r) => (
            <button key={r} type="button" aria-pressed={r === range} onClick={() => changeRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {!mod && <p className="note">Pick a mod to see how its spread has moved.</p>}
      {error && <p className="note">Couldn't load history: {error}. Check that the mod_spread_history function exists in Supabase.</p>}
      {mod && !error && !rows && <p className="note">Loading history…</p>}
      {rows && !hasData && (
        <p className="note">No profit data for this mod in this range. History only exists from when the scraper started running.</p>
      )}

      {hasData && (
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis dataKey="t" ticks={ticks} tickFormatter={formatTick} interval={0} stroke={COLORS.axis} />
              <YAxis stroke={COLORS.axis} unit="p" />
              <ReferenceLine y={0} stroke={COLORS.axis} />
              <Tooltip content={<SpreadTooltip />} cursor={{ fill: "rgba(19,32,43,0.06)" }} />
              <Bar dataKey="profit">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.profit >= 0 ? COLORS.gain : COLORS.loss} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </main>
  );
}