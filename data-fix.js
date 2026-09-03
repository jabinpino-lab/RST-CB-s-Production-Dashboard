/* Live weekly production fix
   Reporting weeks run Tuesday through Monday.
   The published sheet's summary blocks are not used for the weekly
   comparison because their boundaries may follow a different week cycle.
   Instead, aggregate the underlying submitted records for:
     - This week: Tuesday through Monday (through today)
     - Last week: previous Tuesday through Monday
*/
(function () {
  function parseSheetDate(value) {
    const s = String(value ?? '').trim();
    if (!s) return null;

    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;

    const d = new Date(
      Number(m[3]),
      Number(m[1]) - 1,
      Number(m[2])
    );

    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Tuesday = 0, Wednesday = 1, ... Monday = 6
  function startOfTuesdayWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const day = d.getDay();
    const daysSinceTuesday = (day + 5) % 7;

    d.setDate(d.getDate() - daysSinceTuesday);
    return d;
  }

  function add(map, email, field, value) {
    email = String(email ?? '').trim();
    if (!email) return;

    const item =
      map.get(email) || {
        name: email,
        last: 0,
        this: 0
      };

    item[field] +=
      Number(String(value ?? '').replace(/,/g, '')) || 0;

    map.set(email, item);
  }

  // Override the dashboard's week calculation so every displayed range
  // follows Tuesday -> Monday.
  window.weekInfo = function () {
    const now = new Date();

    const thisStart = startOfTuesdayWeek(now);

    const thisEnd = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 7);

    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);

    const lastEnd = new Date(thisStart);
    lastEnd.setMilliseconds(-1);

    return {
      now,
      thisStart,
      thisEnd,
      lastStart,
      lastEnd
    };
  };

  // Override the header's "Week in Progress" display as well.
  window.updateWeekProgress = function () {
    const weekProgress = document.getElementById('weekProgress');
    if (!weekProgress) return;

    const now = new Date();
    const start = startOfTuesdayWeek(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const dateOptions = {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    };

    weekProgress.textContent =
      `Week in Progress: ${start.toLocaleDateString('en-US', dateOptions)} – ${end.toLocaleDateString('en-US', dateOptions)}`;
  };

  window.extractSummary = function (matrix) {
    const result = new Map();
    const now = new Date();

    const thisStart = startOfTuesdayWeek(now);

    const thisEnd = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 7);

    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Keep the official CB reporting list from the summary table.
    // Worker Email.2 = column 36.
    for (const r of matrix.slice(1)) {
      const lastCb = String(r[36] ?? '').trim();

      if (lastCb && !result.has(lastCb)) {
        result.set(lastCb, {
          name: lastCb,
          last: 0,
          this: 0
        });
      }
    }

    // Underlying production records:
    // column 19 = Worker Email
    // column 20 = status
    // column 24 = submitted date
    // Count submitted records into Tuesday-Monday periods.
    for (const r of matrix.slice(1)) {
      const email = String(r[19] ?? '').trim();
      const submitted = String(r[20] ?? '').trim().toLowerCase();
      const date = parseSheetDate(r[24]);

      if (!email || submitted !== 'submitted' || !date) continue;

      // Last week: previous Tuesday through Monday.
      if (date >= lastStart && date < thisStart) {
        add(result, email, 'last', 1);
      }

      // This week: current Tuesday through today.
      if (date >= thisStart && date < thisEnd && date <= todayEnd) {
        add(result, email, 'this', 1);
      }
    }

    return [...result.values()];
  };

  // app.js performs its first load before this file is evaluated. Run the
  // corrected loader once more so the live dashboard uses the new week cycle.
  if (typeof window.load === 'function') {
    window.setTimeout(() => window.load(), 0);
  }
})();
