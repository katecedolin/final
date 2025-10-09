// netlify/functions/daily-check.js
// Scheduled Function that runs hourly to pick up deferred reminders that are now within Twilio's scheduling window.
import { DateTime } from 'luxon';
import twilio from 'twilio';
import { getStore, list } from '@netlify/blobs';

export const config = {
  schedule: '0 * * * *', // every hour (UTC)
};


const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, MESSAGING_SERVICE_SID, TZ = 'America/Los_Angeles' } = process.env;
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const withinTwilioWindow = (dtUtc) => {
  const now = DateTime.utc();
  const minLead = now.plus({ minutes: 15 });
  const maxLead = now.plus({ days: 35 });
  return dtUtc >= minLead && dtUtc <= maxLead;
};

export const handler = async (event, context) => {
  const store = getStore({ name: 'carpool-reminders' });
  const items = await list({ prefix: 'event:' });
  let scheduled = 0;
  let skipped = 0;

  for (const key of items.blobs.map(b => b.key)) {
    const rec = await store.getJSON(key);
    if (!rec) continue;
    const reminderLocal = DateTime.fromISO(`${rec.date}T09:00:00`, { zone: TZ });
    const reminderUtc = reminderLocal.toUTC();

    if (!withinTwilioWindow(reminderUtc)) {
      skipped++;
      continue;
    }

    const iso = reminderUtc.toISO({ suppressMilliseconds: true });
    for (const r of (rec.reminders || [])) {
      try {
        await client.messages.create({
          messagingServiceSid: MESSAGING_SERVICE_SID,
          to: r.to,
          body: r.body,
          scheduleType: 'fixed',
          sendAt: iso
        });
        scheduled++;
      } catch (e) {
        // log but keep going
      }
    }
    // Remove record once scheduled
    await store.delete(key);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, scheduled, skipped, ranAt: new Date().toISOString() })
  };
};
