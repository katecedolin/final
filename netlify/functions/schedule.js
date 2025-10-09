// netlify/functions/schedule.js
import { DateTime } from 'luxon';
import twilio from 'twilio';
import { getStore } from '@netlify/blobs';

// Env vars (set in Netlify UI)
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  MESSAGING_SERVICE_SID,
  SUPPORT_NUMBER = '(206) 886-5085',
  TZ = 'America/Los_Angeles'
} = process.env;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Helpers
const withinTwilioWindow = (dtUtc) => {
  const now = DateTime.utc();
  const minLead = now.plus({ minutes: 15 });
  const maxLead = now.plus({ days: 35 });
  return dtUtc >= minLead && dtUtc <= maxLead;
};

const toIsoForTwilio = (dt) => dt.toUTC().toISO({ suppressMilliseconds: true });

const buildMessages = (org, eventDate, eventTime, carpool) => {
  const whenStr = `${eventDate.toLocaleString(DateTime.DATE_MED)} at ${eventTime.toFormat('h:mm a')}`;

  const confirmations = [];
  const allNonWaitlist = [];

  // Drivers
  for (const d of (carpool.drivers || [])) {
    const riders = (d.riders || []).map(r => r.name).join(', ') || 'No riders assigned';
    const body = `Hi ${d.name}, you have been confirmed for the ${org} volunteer opportunity on ${eventDate.toLocaleString(DateTime.DATE_MED)} at ${eventTime.toFormat('h:mm a')}. Since you signed up as a driver, here are the people you will be taking:\n\t${riders}\nFor directions to the event check the GroupMe Volunteer Opportunities Section!\nIf you have any questions or concerns please text ${SUPPORT_NUMBER}.`;
    confirmations.push({ to: d.phone, body, role: 'driver' });
    allNonWaitlist.push({ to: d.phone, name: d.name });
  }

  // Self-drivers
  for (const s of (carpool.selfDrivers || [])) {
    const body = `Hi ${s.name}, you have been confirmed for the ${org} volunteer opportunity on ${eventDate.toLocaleString(DateTime.DATE_MED)} at ${eventTime.toFormat('h:mm a')}. See you then!\nFor directions to the event check the GroupMe Volunteer Opportunities Section!\nIf you have any questions or concerns please text ${SUPPORT_NUMBER}.`;
    confirmations.push({ to: s.phone, body, role: 'self-driver' });
    allNonWaitlist.push({ to: s.phone, name: s.name });
  }

  // Riders
  for (const r of (carpool.riders || [])) {
    const driverName = r.driverName || 'your assigned driver';
    const body = `Hi ${r.name}, you have been confirmed for the ${org} volunteer opportunity on ${eventDate.toLocaleString(DateTime.DATE_MED)} at ${eventTime.toFormat('h:mm a')}. Since you signed up for the carpool, you will be riding with ${driverName}\nIf you have any questions or concerns please text ${SUPPORT_NUMBER}.`;
    confirmations.push({ to: r.phone, body, role: 'rider' });
    allNonWaitlist.push({ to: r.phone, name: r.name });
  }

  // Waitlist
  const waitlist = [];
  for (const w of (carpool.waitlist || [])) {
    const body = `Hi ${w.name}, you are currently on the WAITLIST for the ${org} volunteer opportunity on ${eventDate.toLocaleString(DateTime.DATE_MED)} at ${eventTime.toFormat('h:mm a')}. If any spots open up we will let you know!`;
    waitlist.push({ to: w.phone, body, role: 'waitlist' });
  }

  // Reminder (non-waitlist only)
  const reminders = allNonWaitlist.map(p => ({
    to: p.to,
    body: `Hi ${p.name}, this is a reminder that you signed up for the ${org} volunteer opportunity on ${eventDate.toLocaleString(DateTime.DATE_MED)} at ${eventTime.toFormat('h:mm a')}. See you then!\nIf you have any questions or concerns please text ${SUPPORT_NUMBER}.`
  }));

  return { confirmations, waitlist, reminders };
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Use POST' }) };
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !MESSAGING_SERVICE_SID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing Twilio environment variables. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and MESSAGING_SERVICE_SID in Netlify.' })
    };
  }

  try {
    const { org, date, time, carpool } = JSON.parse(event.body || '{}');
    if (!org || !date || !time || !carpool) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields: org, date (yyyy-mm-dd), time (HH:mm), carpool' }) };
    }

    // Build event datetime in PT
    const eventDate = DateTime.fromISO(date, { zone: TZ });
    const eventTime = DateTime.fromISO(`${date}T${time}`, { zone: TZ });
    if (!eventDate.isValid || !eventTime.isValid) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid date or time. Use date yyyy-mm-dd and time HH:mm (24h).' }) };
    }

    // 9:00am local time reminder
    const reminderLocal = DateTime.fromISO(`${date}T09:00:00`, { zone: TZ });
    const reminderUtc = reminderLocal.toUTC();

    const { confirmations, waitlist, reminders } = buildMessages(org, eventDate, eventTime, carpool);

    // Send confirmations immediately (no schedule)
    const sentNow = [];
    for (const msg of confirmations.concat(waitlist)) {
      if (!msg.to) continue;
      try {
        const resp = await client.messages.create({
          messagingServiceSid: MESSAGING_SERVICE_SID,
          to: msg.to,
          body: msg.body
        });
        sentNow.push(resp.sid);
      } catch (e) {
        // Continue sending others but collect errors
      }
    }

    // Schedule reminders via Twilio if within window; otherwise persist for scheduled function
    let scheduled = 0;
    let deferred = 0;
    const errors = [];

    if (withinTwilioWindow(reminderUtc)) {
      const iso = toIsoForTwilio(reminderUtc);
      for (const r of reminders) {
        if (!r.to) continue;
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
          errors.push({ to: r.to, error: e.message });
        }
      }
    } else {
      // Store the payload to schedule later via the scheduled function
      const store = getStore({ name: 'carpool-reminders' });
      const id = `event:${org}:${date}`;
      const record = { org, date, time, reminders, createdAt: new Date().toISOString() };
      await store.setJSON(id, record);
      deferred = reminders.length;
    }

    const summary = { sentNow: sentNow.length, scheduled, deferred, errors };
    return { statusCode: 200, body: JSON.stringify({ ok: true, reminderTimePT: reminderLocal.toISO(), summary }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: `Internal error: ${err.message}` }) };
  }
};
