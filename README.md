# Wind Desk — Elexon day-ahead wind intelligence

A first-version decision-support web app for UK electricity procurement teams. It pairs the Elexon BMRS **WINDFOR** wind forecast vintage available by a configurable decision cutoff with **FUELHH** wind generation outturn, then quantifies forecast error. The assignment scope is national wind generation and January 2026 only.

## Product walkthrough

- The banner explains the selected decision cutoff and completeness of the matched data.
- Monthly KPI cards summarize mean forecast, mean absolute error (MAE), bias, coverage, MAPE and RMSE.
- The delivery-day list makes daily forecast levels and error easy to scan.
- The day chart compares the selected forecast vintage with actual wind output at half-hour resolution.
- Settlement detail displays timestamps, forecast, actual, signed error and publication time. Export downloads the full month as CSV.
- Change the UK local cutoff (default **11:00 on D-1**) to examine another decision snapshot. For each delivery period, the backend chooses the latest `publishTime` no later than that cutoff.

The cutoff is an explicit prototype assumption to make the day-ahead decision boundary auditable. The user can change it to match the client's internal schedule. Elexon documents up to eight daily wind forecast publications; a forecast snapshot is selected independently for each delivery day.

## Run locally with Docker

Requirements: Docker Desktop with Compose.

```sh
docker compose up --build
```

Open [http://localhost:8000](http://localhost:8000). The first request loads the January data from Elexon's public Insights API and may take a minute because historical forecast vintages are requested per delivery day. The API is also available at `/api/month?year=2026&month=1&cutoff=11:00` and `/api/health`.

To stop the app, press Ctrl+C, then run `docker compose down`.

## Run without Docker

Backend (Python 3.11+):

```sh
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Frontend (in a second terminal):

```sh
cd frontend
npm install
npm run dev
```

The dev server uses Vite. Vite proxies `/api` requests to `http://localhost:8000` during development. Set `VITE_API_BASE` only when the API is hosted on a separate origin. (For the provided one-container Docker build, no frontend environment variable is required.)

## Vercel deployment

Vercel's current combined frontend/backend setup uses a root-level `vercel.toml` (not YAML). It configures two services from this repository: the Vite app in `frontend/` and the FastAPI app in `backend/`. Requests to `/api/*` are routed to FastAPI; all other paths go to React. Vercel documents this setup as Vercel Services.

To preview locally or deploy with the Vercel CLI (requires a Vercel account):

```sh
npm install --global vercel
vercel login
vercel dev
```

Open the local URL printed by `vercel dev`. To deploy a preview, run `vercel` from the project root. To deploy to production, run:

```sh
vercel --prod
```

You can also import the project from a Git provider in the Vercel dashboard. Keep the Vercel project root set to the repository root so it can read `vercel.toml` and both service folders. No Elexon API key is required.
## Metrics and interpretation

- **MAE (MW):** average absolute half-hour forecast error for matched forecast and actual points.
- **RMSE (MW):** square-root mean squared error, which gives larger misses more weight.
- **Bias (MW):** forecast minus actual. Positive means the forecast was high on average; negative means it was low.
- **MAPE (%):** average absolute percentage error, excluding periods where actual wind generation is zero.
- **Coverage:** matched periods with both a forecast vintage and outturn divided by available periods returned by Elexon.

Forecast and actual are MW power values, not energy. The dashboard uses **0.5 hours per settlement period** only when calculating the optional aggregate MWh field returned by the API. None of these metrics includes demand, other generation, market prices, losses, or a full net-position calculation; the product indicates wind uncertainty and should not be treated as a complete procurement recommendation.

## Data source and attribution

- [Elexon FUELHH stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream): filter to `fuelType = WIND`, use `startTime` and `generation`.
- [Elexon WINDFOR stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream): use `startTime`, `publishTime` and `generation` to recreate a forecast vintage.
- API base: `https://data.elexon.co.uk/bmrs/api/v1`.

Data © Elexon Limited. This prototype requests the January 2026 actual period from the FUELHH stream endpoint and the previous-day forecast publication window for each delivery day. Elexon may revise historical records or API behavior; missing data is shown as a gap rather than silently treated as zero.

## Design and implementation

- **React + Vite:** single-page desk dashboard, responsive layout, Recharts visualizations, client-side CSV export.
- **Python + FastAPI:** reads Elexon, selects the latest eligible publication per target period, joins on the UTC `startTime`, computes month-level metrics, and serves the static app in Docker; Vercel runs the FastAPI service separately.
- **Docker:** multi-stage build compiles the frontend and creates a small Python runtime image. Compose provides a one-command local startup.
- **Deployment:** Vercel service configuration is included in `vercel.toml`, routing the React frontend and Python API through one project.

### Known limitations / next iteration

- Client procurement boundary/cutoff and forecast vintage policy should be confirmed with the trading team.
- Historic forecast stream requests are made once per delivery day; production should add a short-lived cache and controlled retry/backoff.
- Coverage and exact rows depend on Elexon's returned records. The screen reports missing periods and the README documents the matching rule.
- The first version does not calculate required thermal procurement because demand and non-wind generation are outside the allowed dataset scope.

## AI tools

AI tools were used to assist with domain/API research, product design, and implementation of this prototype.



