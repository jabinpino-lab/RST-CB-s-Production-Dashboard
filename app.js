const DATA_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSdXbqQMwQexp1zCBc_KlIFanBr9UoOaxyDL_3keNkKUvmuujQNTPPfhDdBeMg6NhlMp9i_1kINnjC1/pub?gid=1105569847&single=true&output=csv';
const ATTENDANCE_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSdXbqQMwQexp1zCBc_KlIFanBr9UoOaxyDL_3keNkKUvmuujQNTPPfhDdBeMg6NhlMp9i_1kINnjC1/pub?gid=138909060&single=true&output=csv';

let state = { data: [] };

const $ = id => document.getElementById(id);
const clean = s => String(s ?? '').trim();

function parseCSV(text) {
  const out = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') {
      if (quoted && n === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && n === '\n') i++;
      row.push(cell);
      if (row.some(v => clean(v) !== '')) out.push(row);
      row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some(v => clean(v) !== '')) out.push(row);
  }
  return out;
}

function num(v) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function status(n) {
  if (n === 0) return ['No Output', 'attention'];
  if (n <= 7) return ['Need Attention', 'attention'];
  if (n <= 14) return ['On Track', 'track'];
  return ['Target Hit', 'target'];
}

function fmt(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function startOfTuesdayWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const daysSinceTuesday = (d.getDay() + 5) % 7;
  d.setDate(d.getDate() - daysSinceTuesday);
  return d;
}

function weekInfo() {
  const now = new Date();
  const thisStart = startOfTuesdayWeek(now);
  const thisEnd = new Date(thisStart);
  thisEnd.setDate(thisEnd.getDate() + 7);
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 7);
  const lastEnd = new Date(thisStart);
  lastEnd.setMilliseconds(-1);
  return { now, thisStart, thisEnd, lastStart, lastEnd };
}

function updateWeekProgress() {
  const el = $('weekProgress');
  if (!el) return;
  const { thisStart, thisEnd } = weekInfo();
  const end = new Date(thisEnd);
  end.setDate(end.getDate() - 1);
  const opts = { month: 'long', day: 'numeric', year: 'numeric' };
  el.textContent =
    `Week in Progress: ${thisStart.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function extractAttendanceEmails(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return new Set();

  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi;
  const emails = new Set();

  // Attendance is a separate tab. Treat every email present in the
  // published Attendance CSV as an attending CB.
  for (const row of matrix) {
    for (const cell of row) {
      const matches = clean(cell).match(emailPattern) || [];
      for (const email of matches) emails.add(email.toLowerCase().trim());
    }
  }

  return emails;
}

function extractSummary(matrix, attendanceEmails = new Set()) {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];

  const header = matrix[0].map(v => clean(v).toLowerCase());
  const rows = matrix.slice(1);
  const findCol = (...patterns) => {
    for (let i = 0; i < header.length; i++) {
      if (patterns.some(p => p.test(header[i]))) return i;
    }
    return -1;
  };

  // The reporting summary has repeated Worker Email columns. Derive each
  // weekly email column from the Worker Email immediately before its
  // corresponding Submitted This/Last Week column.
  const thisWeekCountCol =
    findCol(/^submitted\\s*this\\s*week$/, /submitted.*this.*week/i);
  const lastWeekCountCol =
    findCol(/^submitted\\s*last\\s*week$/, /submitted.*last.*week/i);

  const thisWeekEmailCol = thisWeekCountCol > 0 ? thisWeekCountCol - 1 : -1;
  const lastWeekEmailCol = lastWeekCountCol > 0 ? lastWeekCountCol - 1 : -1;

  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i;
  const normalizeEmail = v => clean(v).toLowerCase();

  const result = new Map();
  const ensure = email => {
    const key = normalizeEmail(email);
    if (!emailPattern.test(key)) return null;
    if (!result.has(key)) result.set(key, { name: key, last: 0, this: 0 });
    return result.get(key);
  };

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

  // Attendance is authoritative. Every attendee is shown, including 0 output.
  // Anyone present only in the reporting summary is excluded.
  if (attendanceEmails.size) {
    return [...attendanceEmails].map(email => {
      const item = result.get(email);
      return item || { name: email, last: 0, this: 0 };
    });
  }

  throw new Error('The Attendance sheet returned no CB emails.');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function drawChart(data) {
  const sorted = [...data].sort((a, b) =>
    Math.max(b.last, b.this) - Math.max(a.last, a.this) ||
    a.name.localeCompare(b.name)
  );
  const max = Math.max(15, ...sorted.flatMap(x => [x.last, x.this]));

  $('chart').innerHTML = `
    <div class="chart-note">
      <span>Last week vs this week • Highest output first</span>
      <span>0 = No Output • 1–7 = Need Attention • 8–14 = On Track • 15+ = Target Hit</span>
    </div>
    <div class="comparison-chart">
      <div class="y-scale">
        <span>${max}</span><span>${Math.round(max * .75)}</span>
        <span>${Math.round(max * .5)}</span><span>${Math.round(max * .25)}</span><span>0</span>
      </div>
      <div class="chart-scroll"><div class="chart-grid">
        ${sorted.map(x => {
          const lastHeight = x.last === 0 ? 3 : Math.max(3, x.last / max * 250);
          const thisHeight = x.this === 0 ? 3 : Math.max(3, x.this / max * 250);
          const [, lastCls] = status(x.last);
          const [, thisCls] = status(x.this);
          return `
            <div class="cb-column">
              <div class="bars-pair">
                <div class="bar-wrap" title="${escapeHtml(x.name)} — Last week: ${x.last}">
                  <div class="bar-value">${x.last}</div>
                  <div class="bar last-bar ${lastCls}" style="height:${lastHeight}px"></div>
                </div>
                <div class="bar-wrap" title="${escapeHtml(x.name)} — This week: ${x.this}">
                  <div class="bar-value">${x.this}</div>
                  <div class="bar this-bar ${thisCls}" style="height:${thisHeight}px"></div>
                </div>
              </div>
              <div class="horizontal-name" title="${escapeHtml(x.name)}">${escapeHtml(x.name.split('@')[0])}</div>
            </div>`;
        }).join('')}
      </div></div>
    </div>
    <div class="chart-legend">
      <span><i class="legend-bar last"></i> Last Week</span>
      <span><i class="legend-bar current"></i> This Week</span>
    </div>`;
}

function drawTable(data) {
  const q = clean($('searchBox')?.value).toLowerCase();
  const sorted = data.filter(x => x.name.toLowerCase().includes(q))
    .sort((a, b) => a.this - b.this || a.name.localeCompare(b.name));

  $('tableBody').innerHTML = sorted.map(x => {
    const [label, cls] = status(x.this);
    const delta = x.this - x.last;
    return `
      <tr class="${cls === 'attention' ? 'attention-row' : ''}">
        <td class="cb-name">${escapeHtml(x.name)}</td>
        <td>${x.last}</td>
        <td><strong>${x.this}</strong></td>
        <td class="${delta < 0 ? 'negative' : delta > 0 ? 'positive' : ''}">
          ${delta > 0 ? '+' : ''}${delta}
        </td>
        <td><span class="status ${cls}">${label}</span></td>
      </tr>`;
  }).join('') || '<tr><td colspan="5">No matching CBs.</td></tr>';
}

function drawComparison(data) {
  $('comparison').innerHTML = [...data]
    .sort((a, b) => a.this - b.this || a.name.localeCompare(b.name))
    .map(x => {
      const d = x.this - x.last;
      const [label, cls] = status(x.this);
      return `
        <div class="compare-card ${cls}">
          <div class="name">${escapeHtml(x.name)}</div>
          <div class="compare-values">
            <div><small>Last week</small><strong>${x.last}</strong></div>
            <div><small>This week</small><strong>${x.this}</strong></div>
          </div>
          <div class="delta ${d < 0 ? 'negative' : d > 0 ? 'positive' : ''}">
            ${d > 0 ? '+' : ''}${d} vs last week
          </div>
          <span class="status ${cls}">${label}</span>
        </div>`;
    }).join('') || '<div>No data found for the selected weeks.</div>';
}

function render() {
  const a = state;
  const totalThis = a.data.reduce((s, x) => s + x.this, 0);
  const totalLast = a.data.reduce((s, x) => s + x.last, 0);

  $('thisWeekTotal').textContent = totalThis;
  $('lastWeekTotal').textContent = totalLast;
  $('thisWeekRange').textContent = `${fmt(a.thisStart)} – ${fmt(new Date(Math.min(a.now.getTime(), a.thisEnd.getTime() - 1)))}`;
  $('lastWeekRange').textContent = `${fmt(a.lastStart)} – ${fmt(a.lastEnd)}`;
  updateWeekProgress();

  $('attentionCount').textContent =
    a.data.filter(x => x.this >= 1 && x.this <= 7).length;
  $('targetCount').textContent =
    a.data.filter(x => x.this >= 15).length;

  $('updatedAt').textContent = `Updated ${new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit'
  })}`;

  drawChart(a.data);
  drawTable(a.data);
  drawComparison(a.data);
}

async function load() {
  try {
    $('error').classList.add('hidden');
    $('updatedAt').textContent = 'Loading…';

    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Google Sheet returned HTTP ${res.status}`);

    const [reportingRes, attendanceRes] = await Promise.all([
      fetch(DATA_URL, { cache: 'no-store' }),
      fetch(ATTENDANCE_URL, { cache: 'no-store' })
    ]);
    if (!reportingRes.ok) throw new Error(`Reporting sheet returned HTTP ${reportingRes.status}`);
    if (!attendanceRes.ok) throw new Error(`Attendance sheet returned HTTP ${attendanceRes.status}`);

    const [reportingText, attendanceText] = await Promise.all([
      reportingRes.text(),
      attendanceRes.text()
    ]);

    const matrix = parseCSV(reportingText);
    const attendanceMatrix = parseCSV(attendanceText);
    if (matrix.length < 2) throw new Error('The published reporting sheet returned no usable rows.');
    if (attendanceMatrix.length < 2) throw new Error('The published Attendance sheet returned no usable rows.');

    const attendanceEmails = extractAttendanceEmails(attendanceMatrix);
    const data = extractSummary(matrix, attendanceEmails);
    if (!data.length) {
      throw new Error('No CB records were detected for the published Attendance roster.');
    }

    state = { data, ...weekInfo() };
    render();
  } catch (e) {
    $('error').textContent = `Unable to load production data: ${e.message}`;
    $('error').classList.remove('hidden');
    $('updatedAt').textContent = 'Data load failed';
    console.error(e);
  }
}

$('refreshBtn').addEventListener('click', load);
$('searchBox').addEventListener('input', () => drawTable(state.data || []));
load();
setInterval(updateWeekProgress, 60 * 1000);
