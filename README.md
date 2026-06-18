# Event Space by Burger Bar — Operations App

A full booking & invoice management system replacing the Google Sheets / Apps Script setup.
Built with **Next.js + Supabase (Postgres)** — no more column-shift bugs, blocked alerts, or
formula regressions. The data lives in a real database with named fields.

## What's included (Phase 1)

| Page | Replaces |
|---|---|
| **Daily Ops** (`/`) | Daily Checklist / Daily Ops Panel / priority engine |
| **Bookings** (`/bookings`) | Booking Form tab + Workflow Dashboard |
| **Booking detail** (`/bookings/[id]`) | Invoice Manager + Quick Action popup + deposit/payment/guest-count/cancel dialogs |
| **Weekly Calendar** (`/calendar`) | Weekly Calendar tab (Sun–Thu cards) |
| **New Inquiry** (`/bookings/new`) | New Inquiry dialog + availability check + pricing reference |

Business logic ported line-for-line in `src/lib/`:
- `workflow.ts` — statuses, pipeline stages, priority engine, 4-hour conflict rule, working days (Sun–Thu)
- `pricing.ts` — buffet tiers (10/20/30/40+), refill schedule, CC fee math (÷1.03), 6.625% NJ tax, invoice totals

Charges are now **unlimited line items** (no more Addon1–4 slot limit). Every action writes to an activity log per booking.

## Setup (about 20 minutes)

### 1. Create the database
1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine). Pick a strong DB password and the **US East** region.
2. In the dashboard: **SQL Editor → New query** → paste the entire contents of `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user** → create your login (e.g. bbgrossman@gmail.com + password). Turn **off** public signups under Authentication → Providers → Email if you want it locked down.

### 2. Configure the app
1. In Supabase: **Project Settings → API** → copy the **Project URL** and **anon public key**.
2. Copy `.env.local.example` to `.env.local` and paste both values in.

### 3. Run it locally
```bash
npm install
npm run dev
```
Open http://localhost:3000.

### 4. Deploy (free)
1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → Import the repo.
3. Add the two environment variables from `.env.local` in Vercel's project settings.
4. Deploy. You'll get a URL like `eventspace.vercel.app` — works on phone and desktop.

## Migrating your existing bookings

Export the Booking Form tab as CSV, then in Supabase use **Table Editor → bookings → Insert → Import data from CSV** after mapping columns. Or paste a few rows manually to start — the system works fine with a fresh start for new bookings while you finish old ones in Sheets.

## Status workflow (same as before)

```
On Hold → (deposit) → Schedule Menu Call → Complete Menu → Send Est. Invoice
→ Confirm Count & Menu → Send Final Invoice → Collect Payment → Completed
```
Conflicts, hold expiry, overrides, cancellation with refund options, and post-event
adjustments (which reopen a completed booking for payment) all carry over.

## Phase 2 roadmap (next sessions)

- **Auth gate** — require login before any page (Supabase middleware)
- **PDF invoices** — generate branded invoice/receipt PDFs (navy + gold, matching your menus)
- **Email sending** — hold confirmations, invoices, reminders via Resend (replaces MailApp; beta-mode routing to your address first)
- **Scheduled jobs** — hold expiration, menu reminders, morning summary email (Supabase Edge Functions with cron, replacing time triggers)
- **Google Calendar sync** — create/update/color calendar events via the Calendar API
- **Menu selection forms** — in-app Full Service / Single / Double Buffet forms writing to the `menu` jsonb field (replaces Google Forms; invoice number pre-linked automatically, tier-aware dish counts)
- **Customer-facing booking form** — public page that creates holds directly

## Project layout
```
supabase/schema.sql      ← run once in Supabase
src/lib/workflow.ts      ← status machine + priority engine
src/lib/pricing.ts       ← all pricing constants and math
src/app/                 ← pages
src/components/          ← Sidebar, StatusPipeline
```

