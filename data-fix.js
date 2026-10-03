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

    const start = new Date(2026, 8, 29);
    const end = new Date(2026, 9, 5);

    const opts = { month: 'long', day: 'numeric', year: 'numeric' };
    el.textContent =
      `Week in Progress: ${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
  };

  window.extractSummary = function (matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) return [];

    const header = matrix[0].map(v => String(v ?? '').trim().toLowerCase());
    const rows = matrix.slice(1);

    const findCol = (...patterns) => {
      for (let i = 0; i < header.length; i++) {
        if (patterns.some(p => p.test(header[i]))) return i;
      }
      return -1;
    };

    // Use the actual reporting-table labels instead of fixed column numbers.
    // The supplied sheet has separate sections for Today, This Week and Last Week.
    const workerEmailCol = findCol(/^worker\s*email(?:\.\\d+)?$/i, /worker\s*email/i);
    const thisWeekEmailCol = findCol(/^worker\s*email(?:\.1)?$/i);
    const lastWeekEmailCol = findCol(/^worker\s*email(?:\.2)?$/i);
    const thisWeekCountCol = findCol(/^submitted\s*this\s*week$/i, /submitted.*this.*week/i);
    const lastWeekCountCol = findCol(/^submitted\s*last\s*week$/i, /submitted.*last.*week/i);

    const attendanceCols = header
      .map((h, i) => /attendance/.test(h) ? i : -1)
      .filter(i => i >= 0);

    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const attendanceEmails = new Set();
    const normalizeEmail = value => String(value ?? '').trim().toLowerCase();

    function addEmails(value, set) {
      const matches = String(value ?? '').match(emailPattern) || [];
      for (const email of matches) set.add(normalizeEmail(email));
    }

    // Attendance is the authoritative roster. Support both common layouts:
    // 1) Attendance cells contain CB emails.
    // 2) Attendance is a status/value beside Worker Email.
    if (attendanceCols.length) {
      for (const r of rows) {
        for (const col of attendanceCols) addEmails(r[col], attendanceEmails);

        const workerValues = [];
        for (const col of [workerEmailCol, thisWeekEmailCol, lastWeekEmailCol]) {
          if (col >= 0) workerValues.push(r[col]);
        }
        const emails = new Set();
        for (const value of workerValues) addEmails(value, emails);

        for (const col of attendanceCols) {
          const status = String(r[col] ?? '').trim().toLowerCase();
          if (status && !/^(absent|not attending|not present|off|leave|on leave|no|false|0|n\\/a)$/.test(status)) {
            for (const email of emails) attendanceEmails.add(email);
          }
        }
      }
    }

    const result = new Map();
    function ensure(email) {
      const key = normalizeEmail(email);
      if (!key || !key.includes('@')) return null;
      const item = result.get(key) || { name: key, last: 0, this: 0 };
      result.set(key, item);
      return item;
    }

    // Read the summary sections directly. This is the critical correction:
    // This Week comes from "Submitted This Week" and Last Week comes from
    // "Submitted Last Week", not the old hard-coded raw-data columns.
    for (const r of rows) {
      if (thisWeekEmailCol >= 0 && thisWeekCountCol >= 0) {
        const item = ensure(r[thisWeekEmailCol]);
        if (item) item.this = num(r[thisWeekCountCol]);
      }
      if (lastWeekEmailCol >= 0 && lastWeekCountCol >= 0) {
        const item = ensure(r[lastWeekEmailCol]);
        if (item) item.last = num(r[lastWeekCountCol]);
      }
    }

    // If duplicate Worker Email headers were not preserved by the CSV parser,
    // fall back to locating the email immediately before each section's count.
    if (thisWeekCountCol >= 0 || lastWeekCountCol >= 0) {
      for (const r of rows) {
        if (thisWeekCountCol >= 0 && thisWeekEmailCol < 0) {
          const item = ensure(r[thisWeekCountCol - 1]);
          if (item) item.this = num(r[thisWeekCountCol]);
        }
        if (lastWeekCountCol >= 0 && lastWeekEmailCol < 0) {
          const item = ensure(r[lastWeekCountCol - 1]);
          if (item) item.last = num(r[lastWeekCountCol]);
        }
      }
    }

    // If Attendance data is available, filter everything to that roster.
    // If the sheet has no Attendance column, retain the reporting summary
    // rather than making the dashboard blank.
    if (attendanceCols.length && attendanceEmails.size) {
      for (const email of attendanceEmails) {
        if (!result.has(email)) result.set(email, { name: email, last: 0, this: 0 });
      }
      return [...result.values()].filter(item => attendanceEmails.has(normalizeEmail(item.name)));
    }

    return [...result.values()];
  };

  // Re-run after all scripts are loaded so the overridden functions are used.
  window.setTimeout(function () {
    if (typeof window.load === 'function') window.load();
  }, 50);
})();