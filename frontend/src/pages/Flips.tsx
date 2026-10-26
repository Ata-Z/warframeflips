import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { ProfitCell, SortTh, show, sortRows, useSort } from "../ui";
import type { ModPrice } from "../types";

export default function Flips() {
  const [rows, setRows] = useState<ModPrice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, onSort } = useSort("profit");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("mod_prices").select("*");
    if (error) setError(error.message);
    else { setRows(data); setError(null); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase().replaceAll(" ", "_");
    return sortRows(rows.filter((r) => r.mod.includes(q)), sortKey, sortDir);
  }, [rows, search, sortKey, sortDir]);

  if (error) {
    return <main><p className="note">Couldn't load prices: {error}. Check the Supabase keys and the read policy on mod_prices.</p></main>;
  }
  if (!rows) return <main><p className="note">Loading prices…</p></main>;

  const max = Math.max(0, ...visible.map((r) => Math.abs(r.profit ?? 0)));
  const updated = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), "");
  const sort = { sortKey, sortDir, onSort };

  return (
    <main>
      <h1>Mods</h1>
      <p className="lede">
        Buy at the cheapest online sell order, sell to the highest online buy order. Prices are platinum. <br></br>
        {updated && <> Updated {new Date(updated).toLocaleString()}.</>}
      </p>

      <div className="controls">
        <input className="search" type="text" placeholder="Search mods" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search mods" />
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <SortTh label="Mod" field="mod" {...sort} />
              <SortTh label="Buy at" field="seller_price" numeric {...sort} />
              <SortTh label="Sell at" field="buyer_price" numeric {...sort} />
              <SortTh label="Profit" field="profit" numeric {...sort} />
              <SortTh label="Sellers" field="seller_count" numeric className="hide-sm" {...sort} />
              <SortTh label="Buyers" field="buyer_count" numeric className="hide-sm" {...sort} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={6} className="note">No mods match your search.</td></tr>
            )}
            {visible.map((r) => (
              <tr key={r.mod}>
                <td className="name">
                  <a href={`https://warframe.market/items/${r.mod}`} target="_blank" rel="noreferrer">
                    {r.mod.replaceAll("_", " ")}
                  </a>
                </td>
                <td className="num">{show(r.seller_price)}</td>
                <td className="num">{show(r.buyer_price)}</td>
                <ProfitCell value={r.profit} max={max} />
                <td className="num hide-sm">{r.seller_count}</td>
                <td className="num hide-sm">{r.buyer_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}