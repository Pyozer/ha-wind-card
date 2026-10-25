import { describe, expect, it } from 'vitest';
import { en } from '../src/localize/en';
import { fr } from '../src/localize/fr';
import { LANGUAGE_NAMES, localize, resolveLanguage, SUPPORTED_LANGUAGES } from '../src/localize/localize';

/** Dotted keys of every string of a dictionary. */
function keys(dict: object, prefix = ''): string[] {
  return Object.entries(dict).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keys(value as object, `${prefix}${key}.`),
  );
}

const text = (dict: object, key: string): string =>
  key.split('.').reduce((cur, part) => (cur as Record<string, unknown>)[part], dict as unknown) as string;

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  it('has the same keys in every language', () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });

  it('uses the same placeholders in every language', () => {
    for (const key of keys(en)) expect(placeholders(text(fr, key)), key).toEqual(placeholders(text(en, key)));
  });

  it('has no empty string', () => {
    for (const dict of [en, fr])
      for (const key of keys(dict)) expect(text(dict, key).length, key).toBeGreaterThan(0);
  });

  it('names the 13 Beaufort forces and the 16 points of the compass', () => {
    for (let force = 0; force <= 12; force++) expect(en.bft[`f${force}` as keyof typeof en.bft]).toBeTruthy();
    for (let point = 0; point < 16; point++)
      expect(en.compass[`p${point}` as keyof typeof en.compass]).toBeTruthy();
    expect(keys(en.bft)).toHaveLength(13);
    expect(keys(en.compass)).toHaveLength(16);
  });

  it('names every language in its own', () => {
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });
});

describe('localize', () => {
  it('translates, with a regional variant and in any case', () => {
    expect(localize('fr', 'card.gust')).toBe('Rafales');
    expect(localize('fr-FR', 'card.gust')).toBe('Rafales');
    expect(localize('FR', 'card.gust')).toBe('Rafales');
    expect(localize('en', 'card.gust')).toBe('Gusts');
  });

  it('falls back on English, then on the key', () => {
    expect(localize('de', 'card.gust')).toBe('Gusts');
    expect(localize(undefined, 'card.gust')).toBe('Gusts');
    expect(localize('en', 'no.such.key' as never)).toBe('no.such.key');
  });

  it('fills the placeholders', () => {
    expect(localize('en', 'card.force', { force: '4' })).toBe('Force 4');
    expect(localize('fr', 'card.max', { period: '12 h' })).toBe('Max · 12 h');
  });
});

describe('resolveLanguage', () => {
  it('prefers the card, then the profile of the user, then the server', () => {
    expect(resolveLanguage('fr', { language: 'en' })).toBe('fr');
    expect(resolveLanguage('auto', { language: 'en', locale: { language: 'fr' } })).toBe('fr');
    expect(resolveLanguage(undefined, { language: 'de' })).toBe('de');
    expect(resolveLanguage(undefined, undefined)).toBe('en');
  });
});
