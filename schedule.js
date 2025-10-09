// schedule.js
// Hook for your existing carpool automator. Call scheduleReminders(carpool) or click the button.

/**
 * Expected carpool structure (example):
 * {
 *   event: { capacity: 50 },
 *   drivers: [ { name, phone, seats, riders: [{ name, phone }, ...] } ],
 *   selfDrivers: [ { name, phone } ],
 *   riders: [ { name, phone, driverName } ],
 *   waitlist: [ { name, phone } ]
 * }
 */
async function scheduleReminders(carpool) {
  const org = document.getElementById('orgName').value.trim();
  const date = document.getElementById('eventDate').value; // yyyy-mm-dd
  const time = document.getElementById('eventTime').value; // HH:mm

  const statusEl = document.getElementById('scheduleStatus');
  statusEl.textContent = '';

  if (!org || !date || !time) {
    statusEl.textContent = 'Please provide Organization, Date, and Time.';
    statusEl.className = 'text-sm text-red-700';
    return;
  }
  if (!carpool || (!carpool.drivers && !carpool.selfDrivers && !carpool.riders)) {
    statusEl.textContent = 'No carpool data found. Build the carpool first.';
    statusEl.className = 'text-sm text-red-700';
    return;
  }

  try {
    const res = await fetch('/.netlify/functions/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org, date, time, carpool })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unknown error');
    statusEl.textContent = `Scheduled: ${json.summary.sentNow} confirmations, ${json.summary.scheduled} reminders, ${json.summary.deferred} deferred.`;
    statusEl.className = 'text-sm text-emerald-700';
  } catch (err) {
    statusEl.textContent = `Error scheduling: ${err.message}`;
    statusEl.className = 'text-sm text-red-700';
  }
}

document.getElementById('scheduleBtn')?.addEventListener('click', async () => {
  // If your existing code exposes a global with the computed carpool, use it.
  // Otherwise, wire this call from your carpool code after building assignments.
  if (window.currentCarpool) {
    await scheduleReminders(window.currentCarpool);
  } else if (window.getCarpoolAssignments) {
    await scheduleReminders(window.getCarpoolAssignments());
  } else {
    const statusEl = document.getElementById('scheduleStatus');
    statusEl.textContent = 'No carpool assignments found. Ensure your carpool builder sets window.currentCarpool or provides getCarpoolAssignments().';
    statusEl.className = 'text-sm text-red-700';
  }
});
