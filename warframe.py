import asyncio
import time
from datetime import datetime, timedelta, timezone

from market import RateLimiter, check, get, market_client, supabase_client

mods = [
    'primed_continuity', 'transient_fortitude', 'primed_flow', 'blind_rage', 'primed_ravage',
    'primed_ammo_stock', 'primed_bane_of_corpus', 'primed_bane_of_grineer', 'primed_bane_of_infested',
    'primed_bane_of_corrupted', 'primed_animal_instinct', 'primed_redirection', 'primed_reach',
    'primed_regen', 'primed_rubedo_lined_barrel', 'primed_charged_shell', 'primed_chilling_grasp',
    'primed_cleanse_corpus', 'primed_cleanse_grineer', 'primed_cleanse_infested', 'primed_cleanse_corrupted',
    'primed_convulsion', 'primed_cryo_rounds', 'primed_deadly_efficiency', 'primed_dual_rounds',
    'primed_expel_corpus', 'primed_expel_grineer', 'primed_expel_infested', 'primed_expel_corrupted',
    'primed_fast_hands', 'primed_fever_strike', 'primed_firestorm', 'primed_fulmination',
    'primed_heated_charge', 'primed_heavy_trauma', 'primed_magazine_warp', 'primed_morphic_transformer',
    'primed_pack_leader', 'primed_pistol_ammo_mutation', 'primed_pistol_gambit', 'primed_point_blank',
    'primed_pressure_point', 'primed_quickdraw', 'primed_rifle_ammo_mutation', 'primed_shotgun_ammo_mutation',
    'primed_slip_magazine', 'primed_smite_corpus', 'primed_smite_grineer', 'primed_smite_infested',
    'primed_smite_corrupted', 'primed_sniper_ammo_mutation', 'primed_tactical_pump', 'primed_target_cracker',
    'galvanized_aptitude', 'galvanized_acceleration', 'galvanized_chamber', 'galvanized_crosshairs',
    'galvanized_diffusion', 'galvanized_hell',
]

REQUESTS_PER_SECOND = 3          # documented API limit
ONLINE_STATUSES = {"ingame", "online"}   # ignore offline sellers/buyers
RANK = None                      # None = any rank, 0 = unranked only, 10 = max rank, etc.
HISTORY_RETENTION_DAYS = 90      # older history rows are deleted each run


async def scrape_mod(mod, client, limiter):
    orders = await get(client, limiter, f"/orders/item/{mod}")
    if orders is None:
        return None

    def usable(o):
        if (o.get("user") or {}).get("status") not in ONLINE_STATUSES:
            return False
        return RANK is None or o.get("rank", 0) == RANK

    sells = [o["platinum"] for o in orders if o.get("type") == "sell" and usable(o)]
    buys = [o["platinum"] for o in orders if o.get("type") == "buy" and usable(o)]

    seller_price = min(sells) if sells else None
    buyer_price = max(buys) if buys else None
    profit = buyer_price - seller_price if sells and buys else None

    print(f"[{datetime.now()}] {mod}: sellers={len(sells)} buyers={len(buys)} "
          f"seller_price={seller_price} buyer_price={buyer_price} profit={profit}")
    return {
        "mod": mod,
        "seller_price": seller_price,
        "buyer_price": buyer_price,
        "profit": profit,
        "seller_count": len(sells),
        "buyer_count": len(buys),
    }


async def upload(results):
    now = datetime.now(timezone.utc)
    rows = [{**r, "updated_at": now.isoformat()} for r in results]
    history = [{**r, "recorded_at": now.isoformat()} for r in results]
    cutoff = (now - timedelta(days=HISTORY_RETENTION_DAYS)).isoformat()

    async with supabase_client() as client:
        # 1. upsert latest snapshot (one row per mod)
        r = await client.post(
            "/mod_prices?on_conflict=mod",
            json=rows,
            headers={"Prefer": "resolution=merge-duplicates"},
        )
        check(r, "snapshot upsert")

        # 2. append to history
        r = await client.post("/mod_price_history", json=history)
        check(r, "history insert")

        # 3. prune old history so the database never fills up
        r = await client.delete(
            "/mod_price_history",
            params={"recorded_at": f"lt.{cutoff}"},
        )
        check(r, "history prune")


async def main():
    start = time.time()
    limiter = RateLimiter(REQUESTS_PER_SECOND)

    async with market_client() as client:
        responses = await asyncio.gather(*(scrape_mod(m, client, limiter) for m in mods))

    results = sorted(
        (r for r in responses if r),
        key=lambda r: (r["profit"] is not None, r["profit"] or 0),
        reverse=True,
    )
    failed = sum(1 for r in responses if r is None)

    print("\nFinal Results:")
    for r in results:
        profit = f"{r['profit']}p" if r["profit"] is not None else "n/a"
        print(f"Mod: {r['mod']}, Sellers: {r['seller_count']}, Buyers: {r['buyer_count']}, Profit: {profit}")

    if results:
        await upload(results)
    else:
        print("No results to upload.")

    print(f"\nCompleted in {time.time() - start:.2f} seconds")
    print(f"Failed requests: {failed}")


if __name__ == "__main__":
    asyncio.run(main())