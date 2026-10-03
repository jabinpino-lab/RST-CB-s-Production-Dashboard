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

    // Attendance is the authoritative CB roster.
    // The Attendance column can either contain email addresses directly,
    // or contain an attendance/status value on the same row as Worker Email.
    // In the latter case, Worker Email identifies the CB to display.
    const attendanceCols = header
      .map((h, i) => /attendance/.test(h) ? i : -1)
      .filter(i => i >= 0);

    const workerEmailCols = header
      .map((h, i) => /worker\\s*email|cb\\s*email|email/.test(h) ? i : -1)
      .filter(i => i >= 0);

    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi;
    const attendanceEmails = new Set();

    function normalizeEmail(value) {
      return String(value ?? '').trim().toLowerCase();
    }

    function addAttendanceEmail(value) {
      const matches = String(value ?? '').match(emailPattern) || [];
      for (const email of matches) attendanceEmails.add(normalizeEmail(email));
    }

    function attendanceValueMeansPresent(value) {
      const s = String(value ?? '').trim().toLowerCase();
      if (!s) return false;
      // These values explicitly indicate that the CB is not on attendance.
      if (/^(absent|not attending|not present|off|leave|on leave|no|false|0|n\\/a)$/.test(s)) return false;
      return true;
    }

    if (attendanceCols.length) {
      for (const r of matrix.slice(1)) {
        // Case 1: Attendance cells themselves contain one or more CB emails.
        for (const col of attendanceCols) addAttendanceEmail(r[col]);

        // Case 2: Attendance is a status/list column and Worker Email is
        // elsewhere on the same row. A non-empty positive attendance value
        // means that row's Worker Email is on Attendance.
        if (workerEmailCols.length) {
          const emails = [];
          for (const col of workerEmailCols) {
            const value = String(r[col] ?? '').trim();
            if (emailPattern.test(value)) {
              emailPattern.lastIndex = 0;
              const matches = value.match(emailPattern) || [];
              for (const email of matches) emails.push(email);
            }
            emailPattern.lastIndex = 0;
          }

          const present = attendanceCols.some(col => attendanceValueMeansPresent(r[col]));
          if (present) {
            for (const email of emails) attendanceEmails.add(normalizeEmail(email));
          }
        }
      }
    }

    function isAttending(email) {
      // If Attendance is present in the sheet, only its roster is displayed.
      return attendanceCols.length > 0 && attendanceEmails.has(normalizeEmail(email));
    }

    const now = new Date();
    const thisStart = startOfTuesdayWeek(now);
    const thisEnd = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 7);
    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    function ensure(email) {
      email = String(email ?? '').trim();
      if (!email || !email.includes('@')) return null;
      const item = result.get(email) || { name: email, last: 0, this: 0 };
      result.set(email, item);
      return item;
    }

    function countDate(item, date) {
      if (!item || !date) return;
      if (date >= lastStart && date < thisStart) item.last += 1;
      if (date >= thisStart && date < thisEnd && date <= todayEnd) item.this += 1;
    }

    // Preserve the official CB list when it exists.
    for (const r of matrix.slice(1)) {
      for (const value of r) {
        const s = String(value ?? '').trim();
        if (s.includes('@')) ensure(s);
      }
    }

    // First try the known raw submission columns.
    const emailCol = 19;
    const statusCol = 20;
    const dateCol = 24;

    let counted = 0;
    for (const r of matrix.slice(1)) {
      const email = String(r[emailCol] ?? '').trim();
      const statusValue = String(r[statusCol] ?? '').trim().toLowerCase();
      const date = parseSheetDate(r[dateCol]);

      if (email && email.includes('@') && statusValue.includes('submitted') && date) {
        const item = ensure(email);
        const before = item.this + item.last;
        countDate(item, date);
        if (item.this + item.last > before) counted++;
      }
    }

    // Robust fallback: if the sheet's column positions changed, inspect each
    // row for an email, a Submitted status, and any parseable date.
    if (counted === 0) {
      for (const r of matrix.slice(1)) {
        const emails = r
          .map(v => String(v ?? '').trim())
          .filter(v => /@/.test(v));

        const hasSubmitted = r.some(v =>
          String(v ?? '').trim().toLowerCase().includes('submitted')
        );
        if (!emails.length || !hasSubmitted) continue;

        const dates = r
          .map(v => parseSheetDate(v))
          .filter(Boolean);

        if (!dates.length) continue;

        // Prefer an email next to a submitted/status/date region, otherwise
        // count the first email in the row.
        const email = emails[0];
        const item = ensure(email);
        for (const date of dates) {
          const before = item.this + item.last;
          countDate(item, date);
          if (item.this + item.last > before) counted++;
        }
      }
    }

    // Final fallback for summary-style sheets: use the known summary columns
    // when they contain explicit numeric counts rather than raw submissions.
    if (counted === 0) {
      for (const r of matrix.slice(1)) {
        const lastEmail = String(r[36] ?? '').trim();
        const lastVal = num(r[37]);
        const thisEmail = String(r[28] ?? '').trim();
        const thisVal = num(r[29]);

        if (lastEmail.includes('@')) {
          const item = ensure(lastEmail);
          item.last = lastVal;
        }
        if (thisEmail.includes('@')) {
          const item = ensure(thisEmail);
          item.this += thisVal;
        }
      }
    }

    // If Attendance contains email addresses, it is the authoritative display list.
    // Add attended CBs even when they have zero production in the reporting rows.
    for (const email of attendanceEmails) {
      if (!result.has(email)) result.set(email, { name: email, last: 0, this: 0 });
    }
    return [...result.values()].filter(item => isAttending(item.name));
  };

  // Re-run after all scripts are loaded so the overridden functions are used.
  window.setTimeout(function () {
    if (typeof window.load === 'function') window.load();
  }, 50);
})();