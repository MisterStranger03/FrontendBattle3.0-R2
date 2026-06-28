export function multiSort(rows, sortKeys) {
  if (!sortKeys.length) return rows;
  return [...rows].sort((a, b) => {
    for (const { field, dir } of sortKeys) {
      const av = parseFloat(a[field]);
      const bv = parseFloat(b[field]);
      const aVal = isNaN(av) ? String(a[field] || '') : av;
      const bVal = isNaN(bv) ? String(b[field] || '') : bv;
      if (aVal < bVal) return dir === 'asc' ? -1 : 1;
      if (aVal > bVal) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}
