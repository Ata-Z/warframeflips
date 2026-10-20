import asyncio
import math
import os
import time
from collections import defaultdict
from datetime import datetime, timezone

from market import RateLimiter, check, get, market_client, supabase_client

REQUESTS_PER_SECOND = 5
ARCANE_TAG = "arcane_enhancement"
MAX_ARCANES = None              # use a small number like 5 while testing
TRADABLE_STATUSES = {"ingame"}  # only count orders from people you can trade with right now
ITEMS_PER_TRADE = 6             # Warframe's trade window limit


def copies(rank):
    # a rank r arcane is made of (r+1)(r+2)/2 rank 0 copies: 1, 3, 6, 10, 15, 21
    return (rank + 1) * (rank + 2) // 2


def name_of(item):
    return ((item.get("i18n") or {}).get("en") or {}).get("name") or item["slug"]


async def fetch_orders(client, limiter, slug):
    data = await get(client, limiter, f"/orders/item/{slug}") or []
    live = [o for o in data if o.get("visible", True)
            and (o.get("user") or {}).get("status") in TRADABLE_STATUSES]
    for o in live:
        o["rank"] = o.get("rank") or 0
    return ([o for o in live if o["type"] == "sell"],
            [o for o in live if o["type"] == "buy"])


def realistic_buys(sells, buys, max_rank):
    # A buy order above the cheapest sell at the same or a higher rank can't be real:
    # anyone could fill it instantly from that sell, so it's a typo or bait (e.g. 1110 vs 230).
    cheapest = {}
    for o in sells:
        cheapest[o["rank"]] = min(cheapest.get(o["rank"], math.inf), o["platinum"])
    best = {}
    for rank in range(max_rank + 1):
        cap = min((cheapest[r] for r in range(rank, max_rank + 1) if r in cheapest), default=math.inf)
        prices = [o["platinum"] for o in buys if o["rank"] == rank and o["platinum"] <= cap]
        if prices:
            best[rank] = {"price": max(prices), "buyers": len(prices)}
    return best


def cheapest_build(sells, target):
    # Cheapest mix of sell orders (any ranks up to target) whose copies add up to exactly the target rank.
    need = copies(target)
    units = []  # one entry per single arcane we could buy
    for rank in range(target + 1):
        limit = need // copies(rank)
        for o in sorted((o for o in sells if o["rank"] == rank), key=lambda o: o["platinum"]):
            take = min(o["quantity"], limit)
            units += [o] * take
            limit -= take
            if limit == 0:
                break

    dp = [None] * (need + 1)  # dp[c] = (cost, picks) for exactly c copies
    dp[0] = (0, [])
    for o in units:
        w = copies(o["rank"])
        for c in range(need, w - 1, -1):
            prev = dp[c - w]
            if prev is not None and (dp[c] is None or prev[0] + o["platinum"] < dp[c][0]):
                dp[c] = (prev[0] + o["platinum"], prev[1] + [o])
    return dp[need]


def summarize(picks):
    by_order = {}
    for o in picks:
        entry = by_order.setdefault(o["id"], {"rank": o["rank"], "platinum": o["platinum"],
                                              "qty": 0, "seller": o["user"]["ingameName"]})
        entry["qty"] += 1
    plan = sorted(by_order.values(), key=lambda e: (-e["rank"], e["platinum"]))
    per_seller = defaultdict(int)
    for e in plan:
        per_seller[e["seller"]] += e["qty"]
    trades = sum(math.ceil(n / ITEMS_PER_TRADE) for n in per_seller.values())
    return plan, trades


async def scrape_arcane(item, client, limiter):
    max_rank = item.get("maxRank") or 0
    sells, buys = await fetch_orders(client, limiter, item["slug"])
    sell_to = realistic_buys(sells, buys, max_rank)

    ranks, best = [], None
    for target in range(max_rank + 1):
        build = cheapest_build(sells, target)
        buyer = sell_to.get(target)
        profit = buyer["price"] - build[0] if build and buyer else None
        ranks.append({"rank": target, "buy_cost": build[0] if build else None,
                      "sell_price": buyer["price"] if buyer else None,
                      "buyers": buyer["buyers"] if buyer else 0, "profit": profit})
        if profit is not None and (best is None or profit > best[0]):
            best = (profit, target, build, buyer)

    row = {"arcane_slug": item["slug"], "arcane_name": name_of(item), "max_rank": max_rank,
           "target_rank": None, "buy_cost": None, "sell_price": None, "profit": None,
           "trades": None, "plan": None, "ranks": ranks}
    if best:
        profit, target, (cost, picks), buyer = best
        plan, trades = summarize(picks)
        row.update(target_rank=target, buy_cost=cost, sell_price=buyer["price"],
                   profit=profit, trades=trades, plan=plan)
    return row


def describe(plan):
    return " + ".join(f"{e['qty']}x r{e['rank']}@{e['platinum']}" for e in plan)


async def upload(rows):
    async with supabase_client() as client:
        r = await client.post("/arcane_prices?on_conflict=arcane_slug", json=rows,
                              headers={"Prefer": "resolution=merge-duplicates"})
        check(r, "arcane upsert")


async def main():
    started = time.time()
    limiter = RateLimiter(REQUESTS_PER_SECOND)
    async with market_client() as client:
        items = await get(client, limiter, "/items")
        if not items:
            raise SystemExit("Could not load the item list.")

        arcanes = [i for i in items if ARCANE_TAG in (i.get("tags") or [])]
        if MAX_ARCANES:
            arcanes = arcanes[:MAX_ARCANES]
        if not arcanes:
            raise SystemExit("No arcanes found. Check ARCANE_TAG against the tags in /items.")

        print(f"{len(arcanes)} arcanes, {len(arcanes)} requests (~{len(arcanes) / REQUESTS_PER_SECOND:.0f}s)")
        rows = await asyncio.gather(*(scrape_arcane(a, client, limiter) for a in arcanes))

    now = datetime.now(timezone.utc).isoformat()
    rows = [{**r, "updated_at": now} for r in rows
            if any(x["buy_cost"] is not None or x["sell_price"] is not None for x in r["ranks"])]
    rows.sort(key=lambda r: (r["profit"] is not None, r["profit"] or 0), reverse=True)

    print("\nTop arcanes:")
    for r in rows[:15]:
        if r["profit"] is None:
            break
        print(f"{r['arcane_name']}: buy {describe(r['plan'])} = {r['buy_cost']}p, "
              f"sell r{r['target_rank']} @ {r['sell_price']}p -> {r['profit']:+}p ({r['trades']} trades)")

    if not rows:
        print("No results to upload.")
    elif "SUPABASE_URL" not in os.environ:
        print("SUPABASE_URL not set, skipping upload.")
    else:
        await upload(rows)
    print(f"Done: {len(rows)} arcanes in {time.time() - started:.0f}s")


if __name__ == "__main__":
    asyncio.run(main())