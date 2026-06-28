import { formatCurrency, formatPercent, formatNumber } from './format';

// All columns are sortable: Feature 4 requires the numeric headers, and
// Feature 9's multi-sort example sorts by `industry` (a string column) first,
// so categorical columns must be clickable too. multiSort handles both types.
export const COLUMNS = [
  { field: 'project_id',           label: 'Project ID',      width: 110, type: 'string',   sortable: true },
  { field: 'project_name',         label: 'Project Name',    width: 210, type: 'string',   sortable: true },
  { field: 'company_id',           label: 'Company ID',      width: 100, type: 'string',   sortable: true },
  { field: 'project_status',       label: 'Status',          width: 90,  type: 'status',   sortable: true },
  { field: 'automation_type',      label: 'Automation Type', width: 155, type: 'string',   sortable: true },
  { field: 'department',           label: 'Department',      width: 150, type: 'string',   sortable: true },
  { field: 'industry',             label: 'Industry',        width: 150, type: 'string',   sortable: true },
  { field: 'country',              label: 'Country',         width: 125, type: 'string',   sortable: true },
  { field: 'robots_deployed',      label: 'Robots',          width: 75,  type: 'number',   sortable: true },
  { field: 'budget_usd',           label: 'Budget',          width: 120, type: 'currency', sortable: true },
  { field: 'annual_savings_usd',   label: 'Savings/yr',      width: 125, type: 'currency', sortable: true },
  { field: 'roi_percent',          label: 'ROI %',           width: 90,  type: 'percent',  sortable: true },
  { field: 'employee_hours_saved', label: 'Hrs Saved',       width: 100, type: 'number',   sortable: true },
];

export const TOTAL_COL_WIDTH = COLUMNS.reduce((s, c) => s + c.width, 0);

export function formatCell(row, col) {
  const val = row[col.field];
  switch (col.type) {
    case 'currency': return formatCurrency(val);
    case 'percent':  return formatPercent(val);
    case 'number':   return formatNumber(val);
    default:         return val != null ? String(val) : '';
  }
}

export function isAlertRow(row) {
  return row.project_status === 'Failed' || Number(row.roi_percent) < 0;
}

export const NUM_FIELDS = ['robots_deployed', 'budget_usd', 'annual_savings_usd', 'roi_percent', 'employee_hours_saved'];

export function coerceRow(row) {
  const r = { ...row };
  NUM_FIELDS.forEach(f => { r[f] = parseFloat(r[f]) || 0; });
  return r;
}
