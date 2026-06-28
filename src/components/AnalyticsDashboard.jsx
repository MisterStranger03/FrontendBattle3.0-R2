import { memo, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { aggregate } from '../utils/aggregate';
import { formatCurrency, formatNumber, formatPercent } from '../utils/format';

// Terminal palette
const C = {
  amber: '#ffb000', green: '#3fb950', blue: '#4493f8', violet: '#bc8cff', red: '#f85149',
  text: '#ededee', text2: '#9a9aa2', grid: '#26262c',
};
const STATUS_COLORS = { Active: C.green, Completed: C.blue, Planned: C.amber, Failed: C.red };
const ROI_COLORS = [C.red, '#b8893a', C.amber, '#6fb04a', C.green, C.blue];

// Shared dark-theme options
const baseScales = {
  x: { ticks: { color: C.text2, font: { size: 10 } }, grid: { color: C.grid } },
  y: { ticks: { color: C.text2, font: { size: 10 } }, grid: { color: C.grid } },
};
const noLegend = { plugins: { legend: { display: false } } };

export default memo(function AnalyticsDashboard({ rows, onClose }) {
  const panelRef = useRef(null);
  const statusRef = useRef(null);
  const industryRef = useRef(null);
  const roiRef = useRef(null);
  const deptRef = useRef(null);

  // Aggregate the frozen snapshot once when the dashboard opens.
  const data = useMemo(() => aggregate(rows), [rows]);

  // Esc to close + focus management
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [onClose]);

  // Build all charts on open; destroy every instance on cleanup (no leaks).
  useEffect(() => {
    const charts = [];

    if (statusRef.current) {
      charts.push(new Chart(statusRef.current, {
        type: 'doughnut',
        data: {
          labels: data.status.labels,
          datasets: [{
            data: data.status.values,
            backgroundColor: data.status.labels.map(l => STATUS_COLORS[l] || C.text2),
            borderColor: '#131316', borderWidth: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: { legend: { position: 'bottom', labels: { color: C.text2, font: { size: 11 }, padding: 12, boxWidth: 12 } } },
        },
      }));
    }

    if (industryRef.current) {
      charts.push(new Chart(industryRef.current, {
        type: 'bar',
        data: {
          labels: data.industries.labels,
          datasets: [{ data: data.industries.values, backgroundColor: C.amber, borderRadius: 2 }],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          ...noLegend,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
          },
          scales: {
            x: { ticks: { color: C.text2, font: { size: 9 }, callback: (v) => '$' + (v / 1e6).toFixed(0) + 'M' }, grid: { color: C.grid } },
            y: { ticks: { color: C.text2, font: { size: 9 } }, grid: { display: false } },
          },
        },
      }));
    }

    if (roiRef.current) {
      charts.push(new Chart(roiRef.current, {
        type: 'bar',
        data: {
          labels: data.roi.labels,
          datasets: [{ data: data.roi.values, backgroundColor: ROI_COLORS, borderRadius: 2 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, ...noLegend,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatNumber(ctx.raw) + ' projects' } } },
          scales: baseScales,
        },
      }));
    }

    if (deptRef.current) {
      charts.push(new Chart(deptRef.current, {
        type: 'bar',
        data: {
          labels: data.departments.labels,
          datasets: [{ data: data.departments.values, backgroundColor: C.blue, borderRadius: 2 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, ...noLegend,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatNumber(ctx.raw) + ' robots' } } },
          scales: {
            x: { ticks: { color: C.text2, font: { size: 9 }, maxRotation: 40, minRotation: 40 }, grid: { display: false } },
            y: { ticks: { color: C.text2, font: { size: 9 } }, grid: { color: C.grid } },
          },
        },
      }));
    }

    // Teardown — destroy every Chart.js instance so nothing is retained.
    return () => { charts.forEach(c => c.destroy()); };
  }, [data]);

  return (
    <div className="analytics-backdrop" onClick={onClose}>
      <section
        ref={panelRef}
        className="analytics-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Analytics dashboard"
        tabIndex={-1}
      >
        <header className="analytics-head">
          <div className="analytics-head-main">
            <span className="analytics-eyebrow">⏸ FROZEN SNAPSHOT</span>
            <h2 className="analytics-title">Telemetry Analytics</h2>
          </div>
          <button className="analytics-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="analytics-summary">
          <div className="asum"><span className="asum-label">Records</span><span className="asum-val">{formatNumber(data.count)}</span></div>
          <div className="asum"><span className="asum-label">Total Savings</span><span className="asum-val asum-val--green">{formatCurrency(data.totalSavings)}</span></div>
          <div className="asum"><span className="asum-label">Total Robots</span><span className="asum-val">{formatNumber(data.totalRobots)}</span></div>
          <div className="asum"><span className="asum-label">Avg ROI</span><span className="asum-val asum-val--amber">{formatPercent(data.avgRoi)}</span></div>
        </div>

        <div className="analytics-grid">
          <div className="achart-card">
            <div className="achart-title">Projects by Status</div>
            <div className="achart-canvas"><canvas ref={statusRef} /></div>
          </div>
          <div className="achart-card">
            <div className="achart-title">Top Industries by Total Savings</div>
            <div className="achart-canvas"><canvas ref={industryRef} /></div>
          </div>
          <div className="achart-card">
            <div className="achart-title">ROI Distribution</div>
            <div className="achart-canvas"><canvas ref={roiRef} /></div>
          </div>
          <div className="achart-card">
            <div className="achart-title">Robots Deployed by Department</div>
            <div className="achart-canvas"><canvas ref={deptRef} /></div>
          </div>
        </div>

        <footer className="analytics-foot">
          <span>Aggregated from the current frozen view · Chart.js</span>
          <span className="analytics-hint">Esc to close</span>
        </footer>
      </section>
    </div>
  );
});
