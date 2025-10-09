# Carpool Automator + One‑Button SMS Reminders

This augments your existing client‑only app with Netlify Functions that:
- Send immediate confirmations for drivers, riders, self‑drivers, and waitlist
- Pre‑schedule a 9:00am PT day‑of reminder via Twilio Message Scheduling
- If the event is beyond Twilio’s pre‑scheduling window (35 days), defers reminder scheduling and a Netlify Scheduled Function will schedule them automatically when they enter the window.

## What’s included
- `index.html` (adds the Schedule UI, keeps your builder intact)
- `schedule.js` (frontend call to the function)
- `netlify/functions/schedule.js` (handles message text & scheduling)
- `netlify/functions/daily-check.js` (hourly scheduled function to pick up deferred reminders)
- `netlify.toml` (enables the scheduled function + security headers)
- `package.json` (functions runtime deps: Twilio, Luxon, Netlify Blobs)

## Environment variables (set in Netlify → Site settings → Environment)
- `TWILIO_ACCOUNT_SID` — from Twilio console
- `TWILIO_AUTH_TOKEN` — from Twilio console
- `MESSAGING_SERVICE_SID` — your Messaging Service (starts with MG…)
- `SUPPORT_NUMBER` — optional, defaults to `(206) 886-5085`
- `TZ` — optional, defaults to `America/Los_Angeles`

## Deploy
1. Drag‑and‑drop this folder in Netlify or push to a repo and connect.
2. Set the environment variables above.
3. Trigger `Build Carpool` as usual, then fill Organization/Date/Time and click **Schedule Reminders**.

## Error messages you may see
- `Missing Twilio environment variables…` — set the env vars in Netlify.
- `Invalid date or time…` — use `yyyy-mm-dd` and `HH:mm` (24h).
- `No carpool data found…` — run your carpool builder first so it sets `window.currentCarpool` or provide `getCarpoolAssignments()`.

## Notes
- Confirmations send immediately (no scheduling).
- Reminders use Twilio’s `scheduleType: fixed` + `sendAt` in ISO 8601 (UTC). If the 9am PT reminder is not within **15 minutes to 35 days**, messages are deferred and scheduled later by the `daily-check` function.
- Timezone is handled with Luxon and `America/Los_Angeles` (DST safe).
