// Message-key translation (research R-15). Receives already-parsed locale objects
// (the `Localization` maps of en.json / de_DE.json); no file I/O here.

/**
 * @param {string | undefined} requested e.g. 'de', 'de_DE', 'de-AT', 'en'
 * @param {Record<string, Record<string, string>>} locales
 */
export function resolveLanguage(requested, locales) {
  if (typeof requested === 'string' && requested) {
    const code = requested.replace(/-/g, '_');
    if (locales[code]) return code;
    const prefix = code.split('_')[0].toLowerCase();
    const match = Object.keys(locales).find((k) => k.split('_')[0].toLowerCase() === prefix);
    if (match) return match;
  }
  return 'en';
}

/**
 * @param {{ locales: Record<string, Record<string, string>>, language?: string }} options
 */
export function createI18n({ locales, language }) {
  const resolved = resolveLanguage(language, locales);
  const primary = locales[resolved] ?? {};
  const fallback = locales.en ?? {};

  /**
   * @param {string} key
   * @param {Record<string, string | number>} [params]
   */
  function t(key, params) {
    const template = primary[key] ?? fallback[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  }

  return { t, language: resolved };
}
