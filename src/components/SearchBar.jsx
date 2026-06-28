import { memo, useCallback } from 'react';

export default memo(function SearchBar({ value, onChange }) {
  const handleChange = useCallback((e) => onChange(e.target.value), [onChange]);
  const handleClear = useCallback(() => onChange(''), [onChange]);

  return (
    <div className="search-bar">
      <span className="search-icon">⌕</span>
      <input
        className="search-input"
        type="text"
        placeholder="Search project, company, partner, country..."
        value={value}
        onChange={handleChange}
        spellCheck={false}
      />
      {value && (
        <button className="search-clear" onClick={handleClear} aria-label="Clear">✕</button>
      )}
    </div>
  );
});
