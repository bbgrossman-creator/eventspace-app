# Deploying Event Space to Vercel — Step by Step

This puts your app on the internet: reachable from your phone and the restaurant,
with the email scheduler running automatically every 15 minutes. About 1–2 hours
the first time, mostly waiting on account signups.

You'll touch four services, all free to start: **GitHub** (stores the code),
**Vercel** (runs the app), **Supabase** (the database — you already have this),
and **Resend** (sends email).

---

## Before you start — one decision

**Use the SAME Supabase project you've been testing on, or a fresh one?**

- **Same project** = your test bookings come along. Simplest. Recommended unless
  you want a clean slate.
- **Fresh project** = pristine production database. If you choose this, create a
  new Supabase project and run `supabase/00_complete_setup.sql` in its SQL Editor
  before deploying.

Either way, write down (you'll need them in Step 4):
- Supabase **Project URL** and **anon key** (Project Settings → API)
- Supabase **service_role key** (same page — the secret one)

---

## Step 1 — Put the code on GitHub

1. Create a free account at **github.com** if you don't have one.
2. Click **+** (top right) → **New repository**. Name it `eventspace-app`,
   keep it **Private**, don't add a README. Create it.
3. On your computer, in the project folder, open the terminal and run:
   ```
   git init
   git add .
   git commit -m "Event Space app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/eventspace-app.git
   git push -u origin main
   ```
   (Replace YOUR-USERNAME. GitHub will show you this exact block after creating
   the repo — you can copy it from there.)

   **Check:** refresh the GitHub page — you should see your files. Confirm there
   is **no `.env.local`** in the list (the `.gitignore` prevents it — your secret
   keys must never land on GitHub).

---

## Step 2 — Set up Resend (email)

1. Sign up at **resend.com** with bbgrossman@gmail.com (free: 100 emails/day,
   3,000/month — plenty for beta).
2. **API Keys** → **Create API Key** → name it "Event Space" → copy the
   `re_...` key somewhere safe. You only see it once.
3. Leave the FROM address alone for now — beta mode routes everything to your
   inbox regardless, so the default sender is fine until production cutover.

---

## Step 3 — Import the project into Vercel

1. Sign up at **vercel.com** — choose **Continue with GitHub** (links the two).
2. **Add New… → Project** → find `eventspace-app` → **Import**.
3. Vercel auto-detects Next.js. **Don't deploy yet** — first expand
   **Environment Variables** (Step 4).

---

## Step 4 — Environment variables (the important part)

In Vercel's Environment Variables section, add each of these (Name = Value).
Copy values from your `.env.local` and the keys you gathered:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
| `RESEND_API_KEY` | the `re_...` key from Resend |
| `EMAIL_BETA_MODE` | `true` |
| `EMAIL_BETA_ADDRESS` | `bbgrossman@gmail.com` |
| `EMAIL_INTERNAL_ADDRESS` | `bbgrossman@gmail.com` |
| `CRON_SECRET` | make up a long random string (e.g. mash the keyboard) |

**Keep `EMAIL_BETA_MODE` = `true`.** Every email will route to your inbox with
the real recipient in the subject line — exactly the safe burn-in you want before
real customers receive anything.

Then click **Deploy**. Wait ~2 minutes. You'll get a URL like
`eventspace-app.vercel.app`.

---

## Step 5 — First login & smoke test

1. Open your new `.vercel.app` URL. You'll see the sign-in screen.
2. Sign in with the Supabase Auth user you created during testing. (If you used a
   fresh Supabase project, create a user first: Supabase → Authentication →
   Users → Add user.)
3. Click through: Daily Ops, Bookings, Calendar, Dashboard. Everything should load
   with your data.
4. **Test email:** Back Office → Email Automations → pick any automation →
   **Send Test (to you)**. Within seconds a `[TEST]` email should hit
   bbgrossman@gmail.com. If it does — the whole email pipeline works.

---

## Step 6 — Confirm the scheduler is live

1. Vercel project → **Settings → Cron Jobs**. You should see `/api/cron` scheduled
   `*/15 * * * *` (every 15 minutes). Vercel set this up automatically from
   `vercel.json`.
2. To test it now instead of waiting: visit
   `https://YOUR-APP.vercel.app/api/cron` in your browser. It returns a small JSON
   summary of what it checked/sent. (If you set `CRON_SECRET`, the browser visit
   shows "Unauthorized" — that's correct; it means the guard works. Vercel's
   scheduled runs pass the secret automatically.)

---

## Step 7 — Use it on your phone

Open the `.vercel.app` URL on your phone's browser → sign in → add to home screen
(Share → Add to Home Screen on iPhone). It behaves like an app.

---

## When you're ready for real customers (production cutover)

Do this only after a week or so of watching beta emails land in your own inbox and
tuning the wording:

1. In Resend, **verify your domain** (Resend walks you through adding DNS records).
2. In Vercel env vars, add `EMAIL_FROM` = `Event Space by Burger Bar <events@yourdomain.com>`
   and change `EMAIL_BETA_MODE` to `false`.
3. Redeploy (Vercel → Deployments → ⋯ → Redeploy).

From that moment, customers receive emails directly. Until then, everything is safely
routed to you.

---

## Updating the app later

When I send you new code: replace your `src` folder, then:
```
git add .
git commit -m "update"
git push
```
Vercel auto-deploys every push in ~2 minutes. No re-setup needed.

---

## If something goes wrong

- **Build fails on Vercel:** click the failed deployment → read the log. Usually a
  missing env var. The font "minify" warning is harmless and is not a failure.
- **App loads but no data / "row-level security" errors:** an env var is wrong —
  re-check the three Supabase values, then Redeploy.
- **No emails:** check `RESEND_API_KEY` is set in Vercel (not just locally), and look
  at a booking's activity log — it records every send attempt and the failure reason.
