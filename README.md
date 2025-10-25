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



