import { coerceRow } from './grid';

/**
 * Parse the full CSV once at startup to seed the grid with the entire dataset.
 *
 * The internal_uid scheme here MUST mirror dataStream.js exactly
 * (`uid-row-${i}` over the raw line index, keeping only rows whose column
 * count matches the header) so that live stream updates merge into these
 * seeded rows by uid instead of creating duplicates.
 */
export function parseCsvSeed(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').length > lines[0].split(',').length
    ? lines[0].split('\t').map(h => h.trim())
    : lines[0].split(',').map(h => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].includes('\t') ? lines[i].split('\t') : lines[i].split(',');
    if (values.length !== headers.length) continue;

    const obj = { internal_uid: `uid-row-${i}` };
    headers.forEach((h, idx) => { obj[h] = values[idx].trim(); });
    rows.push(coerceRow(obj));
  }
  return rows;
}
