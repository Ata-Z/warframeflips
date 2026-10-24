import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { ProfitCell, SortTh, show, sortRows, useSort } from "../ui";

const MODES = {
  build: { label: "Buy parts, sell set", pay: "parts_sell_total", get: "set_buy", profit: "assemble_profit" },
  break: { label: "Buy set, sell parts", pay: "set_sell", get: "parts_buy_total", profit: "break_profit" },
};

export default function Sets() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("build");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const { sortKey, sortDir, onSort } = useSort("profit");

  useEffect(() => {
    let cancelled = false;
    supabase.from("set_prices").select("*").then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data);
    });
    return () => { cancelled = true; };
  }, []);

  const m = MODES[mode];

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const mapped = rows
      .filter((r) => r.set_name.toLowerCase().includes(q))
      .map((r) => ({ ...r, pay: r[m.pay], get: r[m.get], profit: r[m.profit] }));
    return sortRows(mapped, sortKey, sortDir);
  }, [rows, search, m, sortKey, sortDir]);

  if (error) {
    return <main><p className="note">Couldn't load sets: {error}. Check that set_prices exists and has a public read policy.</p></main>;
  }
  if (!rows) return <main><p className="note">Loading sets…</p></main>;
  if (rows.length === 0) {
    return <main><p className="note">No set data yet. Run sets.py once to fill the table.</p></main>;
  }

  const max = Math.max(0, ...visible.map((r) => Math.abs(r.profit ?? 0)));
  const updated = rows.reduce((mx, r) => (r.updated_at > mx ? r.updated_at : mx), "");
  const sort = { sortKey, sortDir, onSort };

  return (
    <main>
      <h1>Sets vs parts</h1>
      <p className="lede">
        Compare a set's price with its parts added together. You pay the cheapest online sell price
        and receive the highest online buy price.
        Updated {new Date(updated).toLocaleString()}.
      </p>

      <div className="controls">
        <div className="seg" role="group" aria-label="Trade direction">
          {Object.entries(MODES).map(([key, v]) => (
            <button key={key} type="button" aria-pressed={mode === key} onClick={() => setMode(key)}>
              {v.label}
            </button>
          ))}
        </div>
        <input className="search" type="text" placeholder="Search sets" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search sets" />
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <SortTh label="Set" field="set_name" {...sort} />
              <SortTh label="You pay" field="pay" numeric {...sort} />
              <SortTh label="You get" field="get" numeric {...sort} />
              <SortTh label="Profit" field="profit" numeric {...sort} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={4} className="note">No sets match your search.</td></tr>
            )}
            {visible.map((r) => (
              <Fragment key={r.set_slug}>
                <tr>
                  <td className="name">
                    <button type="button" className="link" aria-expanded={open === r.set_slug}
                      onClick={() => setOpen(open === r.set_slug ? null : r.set_slug)}>
                      {r.set_name}
                    </button>
                  </td>
                  <td className="num">{show(r.pay)}</td>
                  <td className="num">{show(r.get)}</td>
                  <ProfitCell value={r.profit} max={max} />
                </tr>
                {open === r.set_slug && (
                  <tr className="detail">
                    <td colSpan={4}>
                      <table className="parts">
                        <thead>
                          <tr>
                            <th>Part</th>
                            <th className="num">Qty</th>
                            <th className="num">Cheapest sell</th>
                            <th className="num">Highest buy</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.parts.map((p) => (
                            <tr key={p.slug}>
                              <td>{p.name}</td>
                              <td className="num">{p.qty}</td>
                              <td className="num">{show(p.sell)}</td>
                              <td className="num">{show(p.buy)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <a className="detail-link" href={`https://warframe.market/items/${r.set_slug}`}
                        target="_blank" rel="noreferrer">
                        View set on warframe.market
                      </a>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}