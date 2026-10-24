import { useState } from "react";

export const show = (v) => (v === null || v === undefined ? "—" : v);

const TEXT_KEYS = ["mod", "set_name", "arcane_name"]; // these sort A→Z first; numbers sort high→low first

export function useSort(initialKey) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState("desc");
  function onSort(key) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(TEXT_KEYS.includes(key) ? "asc" : "desc");
    }
  }
  return { sortKey, sortDir, onSort };
}

// nulls always sort last, whichever direction is chosen
export function sortRows(rows, key, dir) {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const diff = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return dir === "asc" ? diff : -diff;
  });
}

export function SortTh({ label, field, sortKey, sortDir, onSort, numeric, className = "" }) {
  const active = sortKey === field;
  const aria = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className={`${numeric ? "num" : ""} ${className}`} aria-sort={aria}>
      <button type="button" className="sort" onClick={() => onSort(field)}>
        {label}
        <span className="arrow" aria-hidden="true">
          {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </th>
  );
}

// A number with a bar behind it, sized relative to the largest value on screen
export function ProfitCell({ value, max }) {
  if (value === null || value === undefined) return <td className="num muted">—</td>;
  const width = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  const tone = value >= 0 ? "gain" : "loss";
  return (
    <td className="num profit">
      <span className={`bar ${tone}`} style={{ width: `${width}%` }} />
      <span className={`val ${tone}`}>{value}</span>
    </td>
  );
}
export function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
