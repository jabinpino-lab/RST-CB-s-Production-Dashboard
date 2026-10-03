/* Production dashboard data fix
   Reporting week: Tuesday through Monday.
   This patch is deliberately defensive because the published Google Sheet
   can return dates in different text formats.
*/
(function () {
  function parseSheetDate(value) {
    const s = String(value ?? '').trim();
    if (!s) return null;

    // Google Sheets can expose a date as a serial number.
    // Serial 1 = 1899-12-31 in the Sheets/Excel-compatible date system.
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      const serial = Number(s);
      if (serial > 20000 && serial < 100000) {
        const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }

    // ISO / Google timestamp / normal Date-compatible values first.
    const iso = new Date(s);
    if (!Number.isNaN(iso.getTime()) && /[-T:]/.test(s)) {
      iso.setHours(0, 0, 0, 0);
      return iso;
    }

    // M/D/YYYY or MM/DD/YYYY, optionally followed by a time.
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }

    // YYYY/MM/DD fallback.
    const y = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (y) {
      const d = new Date(Number(y[1]), Number(y[2]) - 1, Number(y[3]));
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }

    return null;
  }

  function startOfTuesdayWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const daysSinceTuesday = (d.getDay() + 5) % 7;
    d.setDate(d.getDate() - daysSinceTuesday);
    return d;
  }

  function add(map, email, field, value) {
    email = String(email ?? '').trim();
    if (!email) return;

    const item = map.get(email) || { name: email, last: 0, this: 0 };
    item[field] += Number(String(value ?? '').replace(/,/g, '')) || 0;
    map.set(email, item);
  }

  function findColumn(header, candidates, fallback) {
    const normalized = String(header ?? '').trim().toLowerCase();
    for (const candidate of candidates) {
      if (normalized === candidate || normalized.includes(candidate)) return true;
    }
    return false;
  }

  window.weekInfo = function () {
    const now = new Date();
    const thisStart = startOfTuesdayWeek(now);
    const thisEnd = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 7);

    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);

    const lastEnd = new Date(thisStart);
    lastEnd.setMilliseconds(-1);

    return { now, thisStart, thisEnd, lastStart, lastEnd };
  };

  window.updateWeekProgress = function () {
    const el = document.getElementById('weekProgress');
    if (!el) return;

    const start = startOfTuesdayWeek(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const opts = { month: 'long', day: 'numeric', year: 'numeric' };
    el.textContent =
      `Week in Progress: ${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
  };

  window.extractSummary = function (matrix) {
    const result = new Map();
    if (!Array.isArray(matrix) || matrix.length < 2) return [];

    const header = matrix[0].map(x => String(x ?? '').trim().toLowerCase());

    // The production sheet has multiple Worker Email / Status / date fields.
    // Use the known raw-submission columns so a similarly named summary column
    // can never be selected accidentally.
    // 19 = Worker Email, 20 = Status, 24 = Submitted Date.
    let emailCol = 19;
    let statusCol = 20;
    let dateCol = 24;

    // If the expected columns are not present, fall back to header detection.
    const maxColumns = Math.max(...matrix.map(r => r.length));
    if (maxColumns <= 24) {
      emailCol = header.findIndex(h => findColumn(h, ['worker email'], false));
      statusCol = header.findIndex(h => h === 'status' || h.includes('status'));
      dateCol = header.findIndex(h =>
        h.includes('submitted date') ||
        h.includes('submission date') ||
        h === 'submitted' ||
        h.includes('date submitted')
      );
    }

    // Official reporting list, if present.
    const officialCol = 36;
    for (const r of matrix.slice(1)) {
      const email = String(r[officialCol] ?? '').trim();
      if (email && email.includes('@') && !result.has(email)) {
        result.set(email, { name: email, last: 0, this: 0 });
      }
    }

    const now = new Date();
    const thisStart = startOfTuesdayWeek(now);

    const thisEnd = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 7);

    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    for (const r of matrix.slice(1)) {
      const email = String(r[emailCol] ?? '').trim();
      const statusValue = String(r[statusCol] ?? '').trim().toLowerCase();
      const date = parseSheetDate(r[dateCol]);

      if (!email || !date) continue;

      // Accept the normal Submitted value and common sheet variants.
      if (!statusValue || !statusValue.includes('submitted')) continue;

      if (date >= lastStart && date < thisStart) {
        add(result, email, 'last', 1);
      }

      if (date >= thisStart && date < thisEnd && date <= todayEnd) {
        add(result, email, 'this', 1);
      }
    }

    return [...result.values()];
  };

  // Re-run after all scripts are loaded so the overridden functions are used.
  window.setTimeout(function () {
    if (typeof window.load === 'function') window.load();
  }, 50);
})();