import asyncio
import os
import time
from datetime import datetime

import httpx

BASE_URL = "https://api.warframe.market/v2"
HEADERS = {"Accept": "application/json", "Language": "en", "Platform": "pc"}
MAX_RETRIES = 3
TIMEOUT = 15.0


class RateLimiter:
    def __init__(self, per_second):
        self.interval = 1.0 / per_second
        self._next = 0.0
        self._lock = asyncio.Lock()

    async def wait(self):
        async with self._lock: # when a request receives this lock, it'll enter the code below
            now = time.monotonic()
            delay = self._next - now
            if delay > 0: # the first request will have negative value, so it'll skip the delay
                await asyncio.sleep(delay)
                now = time.monotonic()
            self._next = now + self.interval

    async def penalize(self, seconds):
        # This will change _next to whichever's larger, the current delay time, or the backoff period received by the server
        async with self._lock:
            self._next = max(self._next, time.monotonic() + seconds)


def market_client():
    return httpx.AsyncClient(headers=HEADERS, timeout=TIMEOUT, http2=False)


async def get(client, limiter, path):
    for attempt in range(1, MAX_RETRIES + 1):
        await limiter.wait()
        try:
            resp = await client.get(BASE_URL + path)

            # these will provide additional info than the standard error from raise_for_status
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", 2))
                print(f"[{datetime.now()}] Rate limited on {path}, backing off {retry_after}s")
                await limiter.penalize(retry_after)
                continue
            if resp.status_code == 404:
                print(f"[{datetime.now()}] {path}: not found (bad slug?)")
                return None

            resp.raise_for_status()
            return resp.json().get("data")

        except (httpx.HTTPError, ValueError) as e:
            print(f"[{datetime.now()}] Error on {path} (attempt {attempt}/{MAX_RETRIES}): {e!r}") #!r makes it a more explicit representation of the object, which can be useful
            await asyncio.sleep(0.5 * attempt)

    print(f"[{datetime.now()}] Giving up on {path}")
    return None


def supabase_client():
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_KEY"]
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    return httpx.AsyncClient(base_url=f"{base}/rest/v1", headers=headers, timeout=30)


def check(resp, label):
    if resp.is_error:
        print(f"Supabase error during {label}: {resp.status_code} {resp.text}")
    resp.raise_for_status()
