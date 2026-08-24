// Production comparison chart patch
// Shows Last Week and This Week side-by-side for every CB.
(function () {
  function drawComparisonChart(data) {
    const sorted = [...data].sort((a, b) =>
      Math.max(b.last, b.this) - Math.max(a.last, a.this) ||
      a.name.localeCompare(b.name)
    );

    const max = Math.max(15, ...sorted.flatMap(x => [x.last, x.this]));

    $('chart').innerHTML = `
      <div class="chart-note">
        <span>Last week vs this week • Highest output first</span>
        <span>Names are vertical for easier reading</span>
      </div>
      <div class="comparison-chart">
        <div class="y-scale">
          <span>${max}</span>
          <span>${Math.round(max * .75)}</span>
          <span>${Math.round(max * .5)}</span>
          <span>${Math.round(max * .25)}</span>
          <span>0</span>
        </div>
        <div class="chart-scroll">
          <div class="chart-grid">
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
                  <div class="vertical-name" title="${escapeHtml(x.name)}">
                    ${escapeHtml(x.name.split('@')[0])}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="chart-legend">
        <span><i class="legend-bar last"></i> Last Week</span>
        <span><i class="legend-bar current"></i> This Week</span>
      </div>`;
  }

  // Replace the chart function used by app.js render().
  window.drawChart = drawComparisonChart;

  // app.js performs its initial load before this patch is loaded.
  // Reload once so render() uses the new chart function.
  if (typeof window.load === 'function') {
    window.load();
  }
})();
