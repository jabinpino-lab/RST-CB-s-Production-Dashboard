const DATA_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTQ3Fh4bxosYRMoK5zeC5wbhNw6621gqbtkDgQD_XgC9RYrSalOHFbEgGWWLU_P8DmhwhhMJvNOFpaO/pub?gid=0&single=true&output=csv';

let rows = [];
let state = {};

const $ = id => document.getElementById(id);
const clean = s => String(s ?? '').trim();


// ============================================================
// CSV PARSER
// ============================================================

function parseCSV(text) {
  const out = [];
  let row = [];
  let cell = '';
  let q = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];

    if (c === '"') {
      if (q && n === '"') {
        cell += '"';
        i++;
      } else {
        q = !q;
      }
    }

    else if (c === ',' && !q) {
      row.push(cell);
      cell = '';
    }

    else if ((c === '\n' || c === '\r') && !q) {
      if (c === '\r' && n === '\n') {
        i++;
      }

      row.push(cell);

      if (row.some(v => clean(v) !== '')) {
        out.push(row);
      }

      row = [];
      cell = '';
    }

    else {
      cell += c;
    }
  }

  if (cell || row.length) {
    row.push(cell);

    if (row.some(v => clean(v) !== '')) {
      out.push(row);
    }
  }

  return out;
}


// ============================================================
// NUMBER FORMATTER
// ============================================================

function num(v) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}


// ============================================================
// PRODUCTION STATUS
// ============================================================

function status(n) {
  if (n === 0) {
    return ['No Output', 'attention'];
  }

  if (n <= 7) {
    return ['Need Attention', 'attention'];
  }

  if (n <= 14) {
    return ['On Track', 'track'];
  }

  return ['Target Hit', 'target'];
}


// ============================================================
// DATE FORMATTER
// ============================================================

function fmt(d) {
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}


// ============================================================
// WEEK INFORMATION
// ============================================================

function weekInfo() {
  const now = new Date();

  // Monday = 0, Tuesday = 1 ... Sunday = 6
  const day = (now.getDay() + 6) % 7;

  // Start of current week - Monday
  const thisStart = new Date(now);
  thisStart.setHours(0, 0, 0, 0);
  thisStart.setDate(now.getDate() - day);

  // Start of previous week
  const lastStart = new Date(thisStart);
  lastStart.setDate(thisStart.getDate() - 7);

  // End of previous week - Sunday 23:59:59.999
  const lastEnd = new Date(thisStart);
  lastEnd.setMilliseconds(-1);

  // End of current week
  const thisEnd = new Date(thisStart);
  thisEnd.setDate(thisStart.getDate() + 7);

  return {
    now,
    thisStart,
    thisEnd,
    lastStart,
    lastEnd
  };
}


// ============================================================
// WEEK PROGRESS DISPLAY
// ============================================================

function updateWeekProgress() {
  const weekProgress = $('weekProgress');

  if (!weekProgress) {
    return;
  }

  const today = new Date();

  // Sunday = 0
  // Monday = 1
  // Tuesday = 2
  // ...
  // Saturday = 6
  const day = today.getDay();

  // Calculate Monday of the current week
  const monday = new Date(today);

  const diffToMonday =
    day === 0
      ? -6
      : 1 - day;

  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  // Calculate Sunday of the current week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Format dates
  const dateOptions = {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  };

  const mondayText =
    monday.toLocaleDateString('en-US', dateOptions);

  const sundayText =
    sunday.toLocaleDateString('en-US', dateOptions);

  weekProgress.textContent =
    `Week in Progress: ${mondayText} – ${sundayText}`;
}


// ============================================================
// EXTRACT SUMMARY FROM GOOGLE SHEET
// ============================================================

function extractSummary(matrix) {
  const result = new Map();

  /*
    Reporting table in the supplied sheet:

    Last Week:
      Worker Email.2       = column 36
      Submitted Last Week  = column 37

    This Week:
      Worker Email         = column 28
      Submitted Today      = column 29
  */

  for (const r of matrix.slice(1)) {

    // -----------------------------
    // LAST WEEK
    // -----------------------------

    const lastCb = clean(r[36]);
    const lastVal = clean(r[37]);

    if (lastCb) {
      const item =
        result.get(lastCb) || {
          name: lastCb,
          last: 0,
          this: 0
        };

      item.last = num(lastVal);

      result.set(lastCb, item);
    }


    // -----------------------------
    // THIS WEEK
    // -----------------------------

    const todayCb = clean(r[28]);
    const todayVal = clean(r[29]);

    if (todayCb) {
      const item =
        result.get(todayCb) || {
          name: todayCb,
          last: 0,
          this: 0
        };

      item.this += num(todayVal);

      result.set(todayCb, item);
    }
  }

  return [...result.values()];
}


// ============================================================
// RENDER DASHBOARD
// ============================================================

function render() {
  const a = state;

  const totalThis =
    a.data.reduce((s, x) => s + x.this, 0);

  const totalLast =
    a.data.reduce((s, x) => s + x.last, 0);


  // --------------------------------
  // TOTALS
  // --------------------------------

  $('thisWeekTotal').textContent =
    totalThis;

  $('lastWeekTotal').textContent =
    totalLast;


  // --------------------------------
  // THIS WEEK DATE RANGE
  // --------------------------------

  $('thisWeekRange').textContent =
    `${fmt(a.thisStart)} – ${
      fmt(
        new Date(
          Math.min(
            a.now.getTime(),
            a.thisEnd.getTime() - 1
          )
        )
      )
    }`;


  // --------------------------------
  // LAST WEEK DATE RANGE
  // --------------------------------

  $('lastWeekRange').textContent =
    `${fmt(a.lastStart)} – ${fmt(a.lastEnd)}`;


  // --------------------------------
  // WEEK PROGRESS
  // --------------------------------

  updateWeekProgress();


  // --------------------------------
  // ATTENTION COUNT
  // --------------------------------

  $('attentionCount').textContent =
    a.data.filter(x => x.this <= 7).length;


  // --------------------------------
  // TARGET COUNT
  // --------------------------------

  $('targetCount').textContent =
    a.data.filter(x => x.this >= 15).length;


  // --------------------------------
  // LAST UPDATED
  // --------------------------------

  $('updatedAt').textContent =
    `Updated ${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })}`;


  // --------------------------------
  // DRAW COMPONENTS
  // --------------------------------

  drawChart(a.data);
  drawTable(a.data);
  drawComparison(a.data);
}


// ============================================================
// DRAW CHART
// ============================================================

function drawChart(data) {

  const sorted = [...data].sort(
    (x, y) =>
      x.this - y.this ||
      x.name.localeCompare(y.name)
  );

  const max =
    Math.max(
      15,
      ...sorted.map(x => x.this)
    );


  $('chart').innerHTML = `

    <div class="chart-note">

      <span>
        Lowest production first
      </span>

      <span>
        0 = No Output •
        1–7 = Need Attention •
        8–14 = On Track •
        15+ = Target Hit
      </span>

    </div>

    <div class="bars">

      ${sorted.map(x => {

        const [label, cls] =
          status(x.this);

        const h =
          x.this === 0
            ? 4
            : Math.max(
                4,
                x.this / max * 250
              );

        return `

          <div
            class="bar-group"
            title="${escapeHtml(x.name)} — ${x.this} (${label})"
          >

            <div class="bar-value">
              ${x.this}
            </div>

            <div
              class="bar ${cls}"
              style="height:${h}px"
            ></div>

            <div class="bar-name">
              ${escapeHtml(
                x.name.split('@')[0]
              )}
            </div>

          </div>

        `;

      }).join('')}

    </div>

  `;
}


// ============================================================
// DRAW TABLE
// ============================================================

function drawTable(data) {

  const q =
    clean(
      $('searchBox')?.value
    ).toLowerCase();


  const sorted =
    data
      .filter(x =>
        x.name
          .toLowerCase()
          .includes(q)
      )
      .sort(
        (x, y) =>
          x.this - y.this ||
          x.name.localeCompare(y.name)
      );


  $('tableBody').innerHTML =

    sorted.map(x => {

      const [label, cls] =
        status(x.this);

      const delta =
        x.this - x.last;


      return `

        <tr class="${
          cls === 'attention'
            ? 'attention-row'
            : ''
        }">

          <td class="cb-name">
            ${escapeHtml(x.name)}
          </td>

          <td>
            ${x.last}
          </td>

          <td>
            <strong>
              ${x.this}
            </strong>
          </td>

          <td class="${
            delta < 0
              ? 'negative'
              : delta > 0
                ? 'positive'
                : ''
          }">

            ${delta > 0 ? '+' : ''}
            ${delta}

          </td>

          <td>

            <span class="status ${cls}">
              ${label}
            </span>

          </td>

        </tr>

      `;

    }).join('')

    ||

    `
      <tr>
        <td colspan="5">
          No matching CBs.
        </td>
      </tr>
    `;
}


// ============================================================
// DRAW COMPARISON
// ============================================================

function drawComparison(data) {

  $('comparison').innerHTML =

    [...data]

      .sort(
        (a, b) =>
          a.this - b.this ||
          a.name.localeCompare(b.name)
      )

      .map(x => {

        const d =
          x.this - x.last;

        const [label, cls] =
          status(x.this);


        return `

          <div class="compare-card ${cls}">

            <div class="name">
              ${escapeHtml(x.name)}
            </div>


            <div class="compare-values">

              <div>

                <small>
                  Last week
                </small>

                <strong>
                  ${x.last}
                </strong>

              </div>


              <div>

                <small>
                  This week
                </small>

                <strong>
                  ${x.this}
                </strong>

              </div>

            </div>


            <div class="delta ${
              d < 0
                ? 'negative'
                : d > 0
                  ? 'positive'
                  : ''
            }">

              ${d > 0 ? '+' : ''}
              ${d} vs last week

            </div>


            <span class="status ${cls}">
              ${label}
            </span>

          </div>

        `;

      })

      .join('')

      ||

      `
        <div>
          No data found for the selected weeks.
        </div>
      `;
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(s) {

  return String(s).replace(
    /[&<>\"]/g,

    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[c])
  );
}


// ============================================================
// LOAD GOOGLE SHEET DATA
// ============================================================

async function load() {

  try {

    $('error').classList.add('hidden');

    $('updatedAt').textContent =
      'Loading…';


    const res =
      await fetch(
        DATA_URL,
        {
          cache: 'no-store'
        }
      );


    if (!res.ok) {

      throw new Error(
        `Google Sheet returned HTTP ${res.status}`
      );

    }


    const text =
      await res.text();


    const matrix =
      parseCSV(text);


    if (matrix.length < 2) {

      throw new Error(
        'The published sheet returned no usable rows.'
      );

    }


    const data =
      extractSummary(matrix);


    if (!data.length) {

      throw new Error(
        'No CB records were found in the reporting summary columns.'
      );

    }


    const w =
      weekInfo();


    state = {
      data,
      ...w
    };


    render();

  }


  catch (e) {

    $('error').textContent =
      `Unable to load production data: ${e.message}`;

    $('error').classList.remove('hidden');

    $('updatedAt').textContent =
      'Data load failed';

    console.error(e);

  }

}


// ============================================================
// REFRESH BUTTON
// ============================================================

$('refreshBtn').addEventListener(
  'click',
  load
);


// ============================================================
// SEARCH BOX
// ============================================================

$('searchBox').addEventListener(
  'input',
  () => {

    drawTable(
      state.data || []
    );

  }
);


// ============================================================
// INITIAL LOAD
// ============================================================

load();


// ============================================================
// AUTOMATIC WEEK DISPLAY UPDATE
// ============================================================

// Update the week display immediately
updateWeekProgress();

// Keep the week display accurate if the page
// remains open across midnight.
setInterval(
  updateWeekProgress,
  60 * 1000
);
