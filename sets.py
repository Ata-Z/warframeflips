import asyncio
import time
from datetime import datetime, timezone

from market import RateLimiter, check, get, market_client, supabase_client

REQUESTS_PER_SECOND = 7
SET_TAGS = {"set", "prime"}     # an item must have all of these tags to count
MAX_SETS = None                 # use a small number like 3 while testing


async def best_prices(client, limiter, slug):
    data = await get(client, limiter, f"/orders/item/{slug}/top") or {}
    sells = [o["platinum"] for o in data.get("sell") or []]
    buys = [o["platinum"] for o in data.get("buy") or []]
    return (min(sells) if sells else None, max(buys) if buys else None)


def total(parts, key):
    if any(p[key] is None for p in parts):
        return None
    return sum(p[key] * p["qty"] for p in parts)


def name_of(item):
    return ((item.get("i18n") or {}).get("en") or {}).get("name") or item["slug"]


async def upload(rows):
    async with supabase_client() as client:
        r = await client.post("/set_prices?on_conflict=set_slug", json=rows,
                              headers={"Prefer": "resolution=merge-duplicates"})
        check(r, "set upsert")


async def main():
    started = time.time()
    limiter = RateLimiter(REQUESTS_PER_SECOND)
    async with market_client() as client:
        items = await get(client, limiter, "/items")
        if not items:
            raise SystemExit("Could not load the item list.")

        sets = [i for i in items if SET_TAGS <= set(i.get("tags") or [])]
        if MAX_SETS:
            sets = sets[:MAX_SETS]
        if not sets:
            raise SystemExit("No sets found. Check SET_TAGS against the tags in /items.")

        est = len(sets) * 7
        print(f"{len(sets)} sets, roughly {est} requests (~{est / REQUESTS_PER_SECOND / 60:.0f} min)")

        now = datetime.now(timezone.utc).isoformat()
        rows = []
        for s in sets:
            members = (await get(client, limiter, f"/item/{s['slug']}/set") or {}).get("items") or []
            part_items = [m for m in members if not m.get("setRoot") and m["slug"] != s["slug"]]
            if not part_items:
                print(f"{s['slug']}: no parts found, skipping")
                continue

            (set_sell, set_buy), *part_prices = await asyncio.gather(
                best_prices(client, limiter, s["slug"]),
                *(best_prices(client, limiter, p["slug"]) for p in part_items),
            )
            parts = [{"slug": p["slug"], "name": name_of(p),
                      "qty": p.get("quantityInSet") or 1, "sell": sell, "buy": buy}
                     for p, (sell, buy) in zip(part_items, part_prices)]

            parts_sell_total = total(parts, "sell")
            parts_buy_total = total(parts, "buy")
            assemble = (set_buy - parts_sell_total
                        if set_buy is not None and parts_sell_total is not None else None)
            breakup = (parts_buy_total - set_sell
                       if set_sell is not None and parts_buy_total is not None else None)

            rows.append({
                "set_slug": s["slug"], "set_name": name_of(s),
                "set_sell": set_sell, "set_buy": set_buy,
                "parts_sell_total": parts_sell_total, "parts_buy_total": parts_buy_total,
                "assemble_profit": assemble, "break_profit": breakup,
                "parts": parts, "updated_at": now,
            })
            print(f"{s['slug']}: build={assemble} break={breakup}")

    if rows:
        await upload(rows)
    print(f"Done: {len(rows)} sets in {time.time() - started:.0f}s")


if __name__ == "__main__":
    asyncio.run(main())
