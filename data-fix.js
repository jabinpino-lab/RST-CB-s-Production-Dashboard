/* Live weekly production fix
   The published sheet's "Submitted Today" block is only a daily snapshot.
   For the dashboard's This Week number we must aggregate the underlying
   submitted records from Monday through today instead of using that snapshot.
*/
(function () {
  function parseSheetDate(value) {
    const s = String(value ?? '').trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
  }

  function add(map, email, field, value) {
    email = String(email ?? '').trim();
    if (!email) return;
    const item = map.get(email) || { name: email, last: 0, this: 0 };
    item[field] += Number(String(value ?? '').replace(/,/g, '')) || 0;
    map.set(email, item);
  }

  window.extractSummary = function (matrix) {
    const result = new Map();
    const now = new Date();
    const thisStart = startOfWeek(now);
    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);
    const thisEnd = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 7);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Keep the official CB reporting list and Last Week values from the
    // summary table in the published sheet.
    for (const r of matrix.slice(1)) {
      const lastCb = String(r[36] ?? '').trim();
      const lastVal = Number(String(r[37] ?? '').replace(/,/g, '')) || 0;
      if (lastCb) {
        const item = result.get(lastCb) || { name: lastCb, last: 0, this: 0 };
        item.last = lastVal;
        result.set(lastCb, item);
      }
    }

    // Columns 19/20/24 are the underlying production records:
    // 19 = Worker Email, 20 = status, 24 = submitted date.
    // Aggregate all submitted records for the current week through today.
    for (const r of matrix.slice(1)) {
      const email = String(r[19] ?? '').trim();
      const submitted = String(r[20] ?? '').trim().toLowerCase();
      const date = parseSheetDate(r[24]);
      if (!email || submitted !== 'submitted' || !date) continue;

      if (date >= thisStart && date < thisEnd && date <= todayEnd) {
        add(result, email, 'this', 1);
      }
    }

    return [...result.values()];
  };

  // app.js performs its first load before this file is evaluated. Run the
  // corrected loader once more so the live dashboard uses the fixed logic.
  if (typeof window.load === 'function') window.setTimeout(() => window.load(), 0);
})();
