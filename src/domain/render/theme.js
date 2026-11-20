// Colour sets per key style (data-model.md §10).

export const STYLES = Object.freeze({
  on: { bg: '#f59e0b', fg: '#1c1917', accent: '#fffbeb' },
  off: { bg: '#334155', fg: '#e2e8f0', accent: '#94a3b8' },
  unavailable: { bg: '#7f1d1d', fg: '#fee2e2', accent: '#fca5a5' },
  edit: { bg: '#0891b2', fg: '#ecfeff', accent: '#a5f3fc' },
  trigger: { bg: '#5b21b6', fg: '#f5f3ff', accent: '#c4b5fd' },
  sensor: { bg: '#0f766e', fg: '#f0fdfa', accent: '#99f6e4' },
  warn: { bg: '#c2410c', fg: '#fff7ed', accent: '#fdba74' },
});

/** @param {string} style */
export function themeFor(style) {
  return STYLES[style] ?? STYLES.off;
}
