from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

API_BASE = "https://data.elexon.co.uk/bmrs/api/v1"
UK = ZoneInfo("Europe/London")

app = FastAPI(title="Wind Desk API", version="1.0.0", description="Elexon wind forecast and outturn analytics")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def unwrap(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        data = payload.get("data", [])
        return data if isinstance(data, list) else []
    return []


async def fetch(client: httpx.AsyncClient, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
    response = await client.get(f"{API_BASE}/{path}", params=params)
    response.raise_for_status()
    return unwrap(response.json())


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def number(v: Any) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None
    except (ValueError, TypeError):
        return None


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "wind-desk-api"}


@app.get("/api/month")
async def month_data(
    year: int = Query(2026, ge=2020, le=2035),
    month: int = Query(1, ge=1, le=12),
    cutoff: str = Query("11:00", description="UK local decision cutoff on D-1 (HH:MM)"),
):
    # Assignment scope is deliberately restricted to January 2026.
    if year != 2026 or month != 1:
        raise HTTPException(status_code=400, detail="This prototype is scoped to January 2026.")
    try:
        hour, minute = (int(part) for part in cutoff.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="cutoff must be HH:MM in 24-hour format")

    first = date(year, month, 1)
    after_last = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
    last = after_last - timedelta(days=1)
    actual_from = first.isoformat()
    actual_to = last.isoformat()

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0), headers={"Accept": "application/json"}) as client:
        async def actual_request():
            return await fetch(client, "datasets/FUELHH/stream", {"settlementDateFrom": actual_from, "settlementDateTo": actual_to, "fuelType": "WIND"})

        async def forecast_request_for_day(delivery_day: date):
            decision = datetime.combine(delivery_day - timedelta(days=1), time(hour, minute), tzinfo=UK)
            start = datetime.combine(delivery_day - timedelta(days=1), time.min, tzinfo=UK)
            return await fetch(client, "datasets/WINDFOR/stream", {"publishDateTimeFrom": iso_z(start), "publishDateTimeTo": iso_z(decision)})

        try:
            actual_task = asyncio.create_task(actual_request())
            semaphore = asyncio.Semaphore(5)
            async def limited(day: date):
                async with semaphore:
                    return day, await forecast_request_for_day(day)
            forecast_tasks = [asyncio.create_task(limited(first + timedelta(days=i))) for i in range((last-first).days + 1)]
            actual_rows = await actual_task
            forecast_results = await asyncio.gather(*forecast_tasks)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail=f"Elexon API returned HTTP {exc.response.status_code} for {exc.request.url.path}")
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Could not reach Elexon API: {exc}")

    actual_by_time: dict[str, float] = {}
    for row in actual_rows:
        if str(row.get("fuelType", "")).upper() != "WIND":
            continue
        target = parse_dt(row.get("startTime"))
        value = number(row.get("generation"))
        if target and value is not None and target.date() >= first and target.date() <= last:
            actual_by_time[target.isoformat()] = value

    # Keep all revisions available by target timestamp, then take the last revision
    # published at or before that delivery day's configurable decision cutoff.
    candidates: dict[str, list[tuple[datetime, float]]] = {}
    for delivery_day, rows in forecast_results:
        decision = datetime.combine(delivery_day - timedelta(days=1), time(hour, minute), tzinfo=UK).astimezone(timezone.utc)
        for row in rows:
            target = parse_dt(row.get("startTime"))
            published = parse_dt(row.get("publishTime"))
            value = number(row.get("generation"))
            if not target or not published or value is None or target.astimezone(UK).date() != delivery_day:
                continue
            if published <= decision.astimezone(timezone.utc):
                candidates.setdefault(target.isoformat(), []).append((published, value))

    points = []
    for key in sorted(set(actual_by_time) | set(candidates)):
        revisions = candidates.get(key, [])
        chosen = max(revisions, key=lambda item: item[0]) if revisions else None
        timestamp = datetime.fromisoformat(key)
        points.append({
            "startTime": timestamp.isoformat().replace("+00:00", "Z"),
            "deliveryDate": timestamp.astimezone(UK).date().isoformat(),
            "period": int(timestamp.astimezone(UK).hour * 2 + timestamp.astimezone(UK).minute // 30 + 1),
            "forecastMw": chosen[1] if chosen else None,
            "publishTime": iso_z(chosen[0]) if chosen else None,
            "actualMw": actual_by_time.get(key),
            "forecastAvailable": chosen is not None,
        })

    available = [p for p in points if p["forecastMw"] is not None and p["actualMw"] is not None]
    errors = [p["forecastMw"] - p["actualMw"] for p in available]
    abs_errors = [abs(v) for v in errors]
    mae = sum(abs_errors) / len(abs_errors) if errors else None
    rmse = (sum(v*v for v in errors) / len(errors)) ** 0.5 if errors else None
    bias = sum(errors) / len(errors) if errors else None
    actual_energy = sum(p["actualMw"] * 0.5 for p in available)
    mape_values = [abs(p["forecastMw"] - p["actualMw"]) / abs(p["actualMw"]) * 100 for p in available if p["actualMw"] != 0]
    mape = sum(mape_values) / len(mape_values) if mape_values else None
    forecasts = [p for p in points if p["forecastMw"] is not None]
    return {
        "scope": {"year": year, "month": month, "timezone": "Europe/London", "decisionCutoff": cutoff, "windowStart": first.isoformat(), "windowEnd": last.isoformat()},
        "summary": {
            "periods": len(points), "matchedPeriods": len(available), "forecastCoveragePct": round(len(available) / max(len(points), 1) * 100, 1),
            "maeMw": round(mae, 1) if mae is not None else None,
            "rmseMw": round(rmse, 1) if rmse is not None else None,
            "biasMw": round(bias, 1) if bias is not None else None,
            "mapePct": round(mape, 1) if mape is not None else None,
            "meanForecastMw": round(sum(p["forecastMw"] for p in forecasts)/len(forecasts), 1) if forecasts else None,
            "meanActualMw": round(sum(p["actualMw"] for p in available)/len(available), 1) if available else None,
            "windEnergyMwh": round(actual_energy, 1) if available else None,
            "latestPublishTime": max((p["publishTime"] for p in forecasts if p["publishTime"]), default=None),
        },
        "points": points,
        "source": "Elexon BMRS Insights API: FUELHH and WINDFOR",
    }

# In the production container, serve the bundled React build from FastAPI so the
# prototype can be deployed as one Heroku web process.
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).parent / "static"
if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{requested_path:path}", include_in_schema=False)
async def spa_fallback(requested_path: str):
    if requested_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    target = STATIC_DIR / requested_path
    if target.is_file():
        return FileResponse(target)
    index = STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Frontend build is not installed")

