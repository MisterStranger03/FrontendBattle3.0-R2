// Snapshot Export (Bounty 3) — serialise the active (filtered + sorted) view to
// a downloadable CSV, entirely client-side and WITHOUT freezing the live stream.
//
// The 50k-row serialisation is sliced into chunks with a yield between each, so
// no single task blocks a frame; the 200ms pipeline and 60 FPS scroll keep
// running while the file is built.

// Original CSV schema columns (excludes the synthetic internal_uid).
export const EXPORT_FIELDS = [
  'project_id', 'company_id', 'project_name', 'start_date', 'completion_date',
  'project_status', 'automation_type', 'robots_deployed', 'budget_usd',
  'annual_savings_usd', 'roi_percent', 'department', 'implementation_partner',
  'country', 'industry', 'employee_hours_saved', 'ai_enabled', 'cloud_deployment',
];

const CHUNK_SIZE = 8000;

// RFC-4180 escaping: quote-wrap fields containing comma, quote, or newline.
function escapeCsv(val) {
  const s = val == null ? '' : String(val);
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function triggerDownload(csv, rowCount) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `rpa-snapshot-${rowCount}rows-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after the download has had a chance to start — frees the blob memory.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Build and download a CSV of `rows` (already filter+sort applied) without
 * blocking the main thread.
 * @returns {() => void} cancel function (aborts a pending export)
 */
export function exportSnapshotCsv(rows, { onProgress, onDone } = {}) {
  const total = rows.length;
  const lines = [EXPORT_FIELDS.join(',')];
  let i = 0;
  let cancelled = false;

  const processChunk = () => {
    if (cancelled) return;
    const end = Math.min(i + CHUNK_SIZE, total);
    for (; i < end; i++) {
      const r = rows[i];
      let line = '';
      for (let f = 0; f < EXPORT_FIELDS.length; f++) {
        if (f > 0) line += ',';
        line += escapeCsv(r[EXPORT_FIELDS[f]]);
      }
      lines.push(line);
    }
    if (onProgress) onProgress(total ? i / total : 1);

    if (i < total) {
      setTimeout(processChunk, 0);   // yield — keeps the stream/UI responsive
    } else {
      triggerDownload(lines.join('\r\n'), total);
      if (onDone) onDone();
    }
  };

  // Defer the first chunk so the click handler returns immediately.
  setTimeout(processChunk, 0);

  return () => { cancelled = true; };
}
