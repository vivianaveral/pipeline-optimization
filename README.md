# BruntWork Sales Initiative KPI Tracker

**Internal use only — not for public or external access.**  
Audience: Viviana Vera (RevOps), Renier, Elizna

Tracks the performance of 5 BruntWork sales funnel initiatives, comparing old process vs new initiative outcomes at each stage. Built as a standalone Railway app separate from the Unified Dashboard.

---

## What it does

- Pulls live deal data from HubSpot CRM (Sales Pipeline, `pipeline = "default"`)
- Compares old motion vs new initiative for 5 initiatives:
  1. Form Fill / No Call Booked
  2. Missed Zoom Call
  3. TZ Rebook
  4. 48hr Call Tasks
  5. Pre-Meeting Email (baseline only until launch)
- Shows cohort funnels, weekly meeting rates, ROI/recovery economics
- Caches data as JSON; manual refresh button triggers live HubSpot pull (~10–40 API calls, ~5–15s)

---

## Authentication

The entire dashboard is password-protected. Any unauthenticated visitor is redirected to a login screen. On correct password, a secure HTTP-only cookie is set and persists for 7 days.

- Password is stored as `DASHBOARD_PASSWORD` in Railway environment variables — never hardcoded.
- No username field — single shared password for the internal team.

---

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local and set:
#   HUBSPOT_ACCESS_TOKEN=<your token>
#   DASHBOARD_PASSWORD=<any password you want locally>

# 3. Run dev server
npm run dev
# Open http://localhost:3000
```

---

## Deploying to Railway

1. Push to GitHub: `git push origin main`
2. In Railway: New Project → Deploy from GitHub → select `pipeline-optimization`
3. Add environment variables:
   - `HUBSPOT_ACCESS_TOKEN=<your token>`
   - `DASHBOARD_PASSWORD=<your chosen password>`
4. Railway auto-builds and deploys on every push to `main`

---

## HubSpot refresh

Click **↻ Refresh** in the dashboard to pull fresh data. This:
- Queries HubSpot CRM v3 Search API (max ~40 calls per full refresh)
- Writes aggregated results to `cache/initiative_data.json`
- All page loads read from the cache (fast)

Rate limits: 100 requests/10s — well within limits for on-demand refresh.

---

## GitHub

https://github.com/vivianaveral/pipeline-optimization.git
