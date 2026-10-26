import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { ProfitCell, SortTh, show, sortRows, useSort } from "../ui";
import type { ArcanePrice } from "../types";

const rankLabel = (r: number | null | undefined) => (r === null || r === undefined ? "—" : `R${r}`);

export default function Arcanes() {
  const [rows, setRows] = useState<ArcanePrice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { sortKey, sortDir, onSort } = useSort("profit");

  useEffect(() => {
    let cancelled = false;
    supabase.from("arcane_prices").select("*").then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data);
    });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return sortRows(rows.filter((r) => r.arcane_name.toLowerCase().includes(q)), sortKey, sortDir);
  }, [rows, search, sortKey, sortDir]);

  if (error) {
    return <main><p className="note">Couldn't load arcanes: {error}. Check that arcane_prices exists and has a public read policy.</p></main>;
  }
  if (!rows) return <main><p className="note">Loading arcanes…</p></main>;
  if (rows.length === 0) {
    return <main><p className="note">No arcane data yet. Run arcanes.py once to fill the table.</p></main>;
  }

  const max = Math.max(0, ...visible.map((r) => Math.abs(r.profit ?? 0)));
  const updated = rows.reduce((mx, r) => (r.updated_at > mx ? r.updated_at : mx), "");
  const sort = { sortKey, sortDir, onSort };

  return (
    <main>
      <h1>Arcane builds</h1>
      <p className="lede">
        The cheapest mix of arcanes at different ranks combined <br></br>
        Updated {new Date(updated).toLocaleString()}.
      </p>

      <div className="controls">
        <input className="search" type="text" placeholder="Search arcanes" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search arcanes" />
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <SortTh label="Arcane" field="arcane_name" {...sort} />
              <SortTh label="Sell as" field="target_rank" numeric {...sort} />
              <SortTh label="You pay" field="buy_cost" numeric {...sort} />
              <SortTh label="You get" field="sell_price" numeric {...sort} />
              <SortTh label="Profit" field="profit" numeric {...sort} />
              <SortTh label="Trades" field="trades" numeric {...sort} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={6} className="note">No arcanes match your search.</td></tr>
            )}
            {visible.map((r) => (
              <Fragment key={r.arcane_slug}>
                <tr>
                  <td className="name">
                    <button type="button" className="link" aria-expanded={open === r.arcane_slug}
                      onClick={() => setOpen(open === r.arcane_slug ? null : r.arcane_slug)}>
                      {r.arcane_name}
                    </button>
                  </td>
                  <td className="num">{rankLabel(r.target_rank)}</td>
                  <td className="num">{show(r.buy_cost)}</td>
                  <td className="num">{show(r.sell_price)}</td>
                  <ProfitCell value={r.profit} max={max} />
                  <td className="num">{show(r.trades)}</td>
                </tr>
                {open === r.arcane_slug && (
                  <tr className="detail">
                    <td colSpan={6}>
                      {r.plan && (
                        <table className="parts">
                          <thead>
                            <tr>
                              <th>Buy from</th>
                              <th className="num">Rank</th>
                              <th className="num">Qty</th>
                              <th className="num">Each</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.plan.map((p) => (
                              <tr key={`${p.seller}-${p.rank}-${p.platinum}`}>
                                <td>{p.seller}</td>
                                <td className="num">{rankLabel(p.rank)}</td>
                                <td className="num">{p.qty}</td>
                                <td className="num">{p.platinum}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <table className="parts">
                        <thead>
                          <tr>
                            <th>Sell as</th>
                            <th className="num">Cheapest build</th>
                            <th className="num">Best buy order</th>
                            <th className="num">Buyers</th>
                            <th className="num">Profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(r.ranks || []).map((x) => (
                            <tr key={x.rank}>
                              <td>{rankLabel(x.rank)}</td>
                              <td className="num">{show(x.buy_cost)}</td>
                              <td className="num">{show(x.sell_price)}</td>
                              <td className="num">{x.buyers}</td>
                              <td className="num">{show(x.profit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <a className="detail-link" href={`https://warframe.market/items/${r.arcane_slug}`}
                        target="_blank" rel="noreferrer">
                        View on warframe.market
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
