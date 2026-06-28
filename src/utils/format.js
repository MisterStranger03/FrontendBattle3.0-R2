export const formatCurrency = (val) => {
  const n = parseFloat(val);
  if (isNaN(n)) return '$0';
  return '$' + Math.max(0, n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};

// Signed currency — for derived values (e.g. Net = Savings − Budget) that can be
// negative. Unlike formatCurrency, this does NOT clamp to zero.
export const formatCurrencySigned = (val) => {
  const n = parseFloat(val);
  if (isNaN(n)) return '$0';
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export const formatPercent = (val) => {
  const n = parseFloat(val);
  if (isNaN(n)) return '0.00%';
  return Math.max(-9999, Math.min(9999, n)).toFixed(2) + '%';
};

export const formatNumber = (val) => {
  const n = parseInt(val, 10);
  if (isNaN(n)) return '0';
  return Math.max(0, n).toLocaleString('en-US');
};
