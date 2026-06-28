import { memo } from 'react';
import { formatNumber, formatCurrency } from '../utils/format';

const KPICard = memo(({ label, value, sub }) => (
  <div className="kpi-card">
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
));

export default memo(function KPIStrip({ kpis }) {
  return (
    <div className="kpi-strip">
      <KPICard
        label="Rows Streamed"
        value={formatNumber(kpis.totalStreamed)}
        sub="cumulative updates"
      />
      <KPICard
        label="Active Robots Deployed"
        value={formatNumber(kpis.totalRobots)}
        sub="running total"
      />
      <KPICard
        label="Global Cumulative Savings"
        value={formatCurrency(kpis.totalSavings)}
        sub="annual savings streamed"
      />
    </div>
  );
});
