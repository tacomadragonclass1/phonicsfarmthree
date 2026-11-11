import { describe, expect, it } from 'vitest';
import { allUrls, FONT, MODELS, SOUNDS } from '../src/assets/manifest';

// node:fs cannot be imported in this project: there is no @types/node and
// tsconfig's `types` is fixed to vite/client. import.meta.glob gives the same
// fact — the set of files that exist under public/ — through Vite's own
// transform, so the test still checks the disk without node types.
const PUBLIC_FILES = new Set(
  Object.keys(import.meta.glob('../public/assets/**/*')).map((p) => p.replace('../public/', '')),
);

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const VOICE = ['annette_find', 'annette_good', 'wrong_chime'];

describe('manifest urls', () => {
  it('every url exists on disk under public/', () => {
    for (const url of allUrls()) {
      expect(PUBLIC_FILES.has(url), `missing asset: ${url}`).toBe(true);
    }
  });

  it('model urls are glb files under assets/models/', () => {
    const entries = Object.entries(MODELS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, entry] of entries) {
      expect(entry.url.startsWith('assets/models/'), `${id}: ${entry.url}`).toBe(true);
      expect(entry.url.endsWith('.glb'), `${id}: ${entry.url}`).toBe(true);
    }
  });

  it('no url escapes the site base', () => {
    for (const url of allUrls()) {
      expect(url.includes('..'), url).toBe(false);
      expect(url.startsWith('/'), url).toBe(false);
    }
  });
});

describe('SOUNDS', () => {
  it('has exactly 29 keys: the 26 phonemes plus the three voice cues', () => {
    const keys = Object.keys(SOUNDS);
    expect(keys.length).toBe(29);
    for (const letter of LETTERS) {
      expect(keys.includes(letter), `no entry for ${letter}`).toBe(true);
      expect(SOUNDS[letter].url).toBe(`assets/audio/phonemes/${letter}.wav`);
    }
    for (const name of VOICE) {
      expect(SOUNDS[name].url).toBe(`assets/audio/voice/${name}.wav`);
    }
  });
});

describe('characters', () => {
  it('chuck and annette declare the clips the game relies on', () => {
    expect(MODELS.chuck.clips).toEqual(['idle', 'walk']);
    expect(MODELS.annette.clips).toEqual(['idle', 'walk']);
  });
});

describe('allUrls', () => {
  it('has no duplicates and includes the font', () => {
    const urls = allUrls();
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(FONT.url);
    expect(urls.length).toBe(Object.keys(MODELS).length + Object.keys(SOUNDS).length + 1);
  });
});
