import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, resolveLanguage } from '../../../src/domain/i18n.js';

const locales = {
  en: { 'status.on': 'On', 'status.off': 'Off', greet: 'Hello {name}', 'only.en': 'English only' },
  de_DE: { 'status.on': 'An', 'status.off': 'Aus', greet: 'Hallo {name}' },
};

test('resolveLanguage matches exact codes, prefixes and falls back to en', () => {
  assert.equal(resolveLanguage('de_DE', locales), 'de_DE');
  assert.equal(resolveLanguage('de', locales), 'de_DE');
  assert.equal(resolveLanguage('de-AT', locales), 'de_DE');
  assert.equal(resolveLanguage('en', locales), 'en');
  assert.equal(resolveLanguage('fr_FR', locales), 'en');
  assert.equal(resolveLanguage(undefined, locales), 'en');
});

test('t() looks up the selected language', () => {
  const { t, language } = createI18n({ locales, language: 'de' });
  assert.equal(language, 'de_DE');
  assert.equal(t('status.on'), 'An');
});

test('t() falls back to en, then to the key itself', () => {
  const { t } = createI18n({ locales, language: 'de_DE' });
  assert.equal(t('only.en'), 'English only');
  assert.equal(t('missing.key'), 'missing.key');
});

test('t() interpolates {placeholders} and leaves unknown ones', () => {
  const { t } = createI18n({ locales, language: 'en' });
  assert.equal(t('greet', { name: 'Ada' }), 'Hello Ada');
  assert.equal(t('greet'), 'Hello {name}');
});
