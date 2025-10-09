// script.js — builds and displays the carpool list, sets window.currentCarpool for scheduler

// Simple helper for status text
const statusEl = document.getElementById('status');
function setStatus(msg, color = 'text-slate-600') {
  statusEl.textContent = msg;
  statusEl.className = `text-sm ${color}`;
}

// Click handler for "Build Carpool" button
document.getElementById('runBtn')?.addEventListener('click', async () => {
  const sheetUrl = document.getElementById('sheetUrl').value.trim();
  const eventCap = parseInt(document.getElementById('eventCap').value.trim(), 10) || Infinity;
  const gid = document.getElementById('gid').value.trim() || '';

  if (!sheetUrl) {
    setStatus('Please enter a Google Sheet link.', 'text-red-700');
    return;
  }

  setStatus('Fetching and parsing data…', 'text-indigo-700');

  try {
    // Convert Sheets link to CSV export URL
    const csvUrl = sheetUrl
      .replace('/edit#gid=', '/export?format=csv&gid=')
      .replace('/view#gid=', '/export?format=csv&gid=')
      + (gid && !sheetUrl.includes('gid=') ? `&gid=${gid}` : '');

    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();

    // Parse CSV
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data;

    if (!rows.length) throw new Error('No rows found in sheet.');

    // Normalize column names (case-insensitive)
    const norm = (s) => s.trim().toLowerCase();
    const headers = Object.keys(rows[0]).map(norm);

    const nameKey = headers.find(h => h.includes('name'));
    const transportKey = headers.find(h => h.includes('transportation'));
    const seatsKey = headers.find(h => h.includes('provide')) || headers.find(h => h.includes('seats'));

    if (!nameKey || !transportKey) throw new Error('Missing expected columns (Name, Transportation?)');

    const drivers = [];
    const selfDrivers = [];
    const riders = [];
    const waitlist = [];

    for (let i = 0; i < rows.length && (drivers.length + selfDrivers.length + riders.length) < eventCap; i++) {
      const r = rows[i];
      const name = r[nameKey] || '';
      const transport = (r[transportKey] || '').toLowerCase();
      const seats = parseInt(r[seatsKey], 10) || 0;

      // Extract phone if present
      const phoneKey = Object.keys(r).find(k => norm(k).includes('phone'));
      const phone = phoneKey ? r[phoneKey].trim() : '';

      if (transport.includes('provide')) {
        drivers.push({ name, phone, seats, riders: [] });
      } else if (transport.includes('myself') || transport.includes('own')) {
        selfDrivers.push({ name, phone });
      } else if (transport.includes('need')) {
        riders.push({ name, phone });
      } else {
        waitlist.push({ name, phone });
      }
    }

    // Simple carpool assignment
    let riderIdx = 0;
    for (const d of drivers) {
      for (let s = 0; s < d.seats && riderIdx < riders.length; s++) {
        const passenger = riders[riderIdx++];
        passenger.driverName = d.name;
        d.riders.push(passenger);
      }
    }

    // Unassigned riders go to waitlist
    if (riderIdx < riders.length) {
      waitlist.push(...riders.slice(riderIdx));
    }

    // Render results
    const results = document.getElementById('results');
    const renderGroup = (title, arr, renderer) => `
      <div class="mt-8">
        <h3 class="text-base font-semibold mb-2">${title} (${arr.length})</h3>
        <ul class="space-y-1">${arr.map(renderer).join('')}</ul>
      </div>
    `;

    results.innerHTML =
      renderGroup('Drivers', drivers, d => `<li><b>${d.name}</b> — ${d.seats} seats (${d.riders.map(r => r.name).join(', ') || 'no riders'})</li>`) +
      renderGroup('Self-Drivers', selfDrivers, s => `<li>${s.name}</li>`) +
      renderGroup('Riders', riders, r => `<li>${r.name} → ${r.driverName || 'unassigned'}</li>`) +
      renderGroup('Waitlist', waitlist, w => `<li>${w.name}</li>`);

    // Expose for scheduler
    window.currentCarpool = { drivers, selfDrivers, riders, waitlist };

    setStatus('Carpool built successfully!', 'text-emerald-700');
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, 'text-red-700');
  }
});
