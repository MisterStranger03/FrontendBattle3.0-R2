import { memo, useEffect, useRef } from 'react';
import { formatCurrency, formatPercent, formatNumber } from '../utils/format';

// Field groups for the inspector — every relational attribute of the record,
// organised and formatted for scannability.
const fmtDate = (v) => (v && String(v).trim() ? v : '—');
const fmtText = (v) => (v != null && String(v).trim() ? String(v) : '—');

function Row({ label, children }) {
  return (
    <div className="insp-row">
      <span className="insp-key">{label}</span>
      <span className="insp-val">{children}</span>
    </div>
  );
}

function Chip({ on }) {
  return <span className={`insp-chip insp-chip--${on ? 'yes' : 'no'}`}>{on ? 'Yes' : 'No'}</span>;
}

export default memo(function RowInspector({ record, onClose }) {
  const panelRef = useRef(null);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus the panel on open for accessibility; restore focus on close.
  useEffect(() => {
    const prev = document.activeElement;
    panelRef.current?.focus();
    return () => { if (prev instanceof HTMLElement) prev.focus(); };
  }, []);

  if (!record) return null;

  const status = record.project_status || 'unknown';
  const roiNeg = Number(record.roi_percent) < 0;
  const netValue = (Number(record.annual_savings_usd) || 0) - (Number(record.budget_usd) || 0);

  return (
    <div className="insp-backdrop" onClick={onClose}>
      <aside
        ref={panelRef}
        className="insp-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Project inspector: ${record.project_name || record.project_id}`}
        tabIndex={-1}
      >
        <header className="insp-head">
          <div className="insp-head-main">
            <span className="insp-id">{fmtText(record.project_id)}</span>
            <h2 className="insp-title">{fmtText(record.project_name)}</h2>
          </div>
          <button className="insp-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="insp-statusbar">
          <span className={`insp-status td--status`} data-status={status}>{status}</span>
          <span className="insp-roi" data-negative={roiNeg ? '1' : ''}>
            ROI {formatPercent(record.roi_percent)}
          </span>
        </div>

        <div className="insp-body">
          <section className="insp-group">
            <div className="insp-group-title">Identity</div>
            <Row label="Project ID">{fmtText(record.project_id)}</Row>
            <Row label="Project Name">{fmtText(record.project_name)}</Row>
            <Row label="Company ID">{fmtText(record.company_id)}</Row>
          </section>

          <section className="insp-group">
            <div className="insp-group-title">Classification</div>
            <Row label="Automation Type">{fmtText(record.automation_type)}</Row>
            <Row label="Department">{fmtText(record.department)}</Row>
            <Row label="Industry">{fmtText(record.industry)}</Row>
            <Row label="Country">{fmtText(record.country)}</Row>
            <Row label="Impl. Partner">{fmtText(record.implementation_partner)}</Row>
          </section>

          <section className="insp-group">
            <div className="insp-group-title">Financials</div>
            <Row label="Budget"><span className="insp-num">{formatCurrency(record.budget_usd)}</span></Row>
            <Row label="Annual Savings"><span className="insp-num insp-num--pos">{formatCurrency(record.annual_savings_usd)}</span></Row>
            <Row label="Net (Savings − Budget)">
              <span className={`insp-num ${netValue < 0 ? 'insp-num--neg' : 'insp-num--pos'}`}>{formatCurrency(netValue)}</span>
            </Row>
            <Row label="ROI %"><span className="insp-num" data-negative={roiNeg ? '1' : ''}>{formatPercent(record.roi_percent)}</span></Row>
          </section>

          <section className="insp-group">
            <div className="insp-group-title">Operations</div>
            <Row label="Robots Deployed"><span className="insp-num">{formatNumber(record.robots_deployed)}</span></Row>
            <Row label="Employee Hours Saved"><span className="insp-num">{formatNumber(record.employee_hours_saved)}</span></Row>
          </section>

          <section className="insp-group">
            <div className="insp-group-title">Timeline</div>
            <Row label="Start Date">{fmtDate(record.start_date)}</Row>
            <Row label="Completion Date">{fmtDate(record.completion_date)}</Row>
          </section>

          <section className="insp-group">
            <div className="insp-group-title">Flags</div>
            <Row label="AI-Enabled"><Chip on={record.ai_enabled === 'Yes'} /></Row>
            <Row label="Cloud Deployment"><Chip on={record.cloud_deployment === 'Yes'} /></Row>
          </section>
        </div>

        <footer className="insp-foot">
          <span className="insp-uid">{record.internal_uid}</span>
          <span className="insp-hint">Esc to close</span>
        </footer>
      </aside>
    </div>
  );
});
