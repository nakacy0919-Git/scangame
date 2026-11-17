import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../functions/catalog.json', import.meta.url), 'utf8'));
const themes = Object.keys(catalog);

test('server grading catalogue exactly matches all teaching cards', () => {
  assert.equal(themes.length, 12);
  for (const theme of themes) {
    const original = JSON.parse(readFileSync(new URL('../src/data/' + theme + '.json', import.meta.url), 'utf8'));
    const expected = original.map(card => ({
      id: card.id,
      card_a: { text: card.card_a.text },
      vocabulary: card.vocabulary.map(v => ({word:v.word,meaning:v.meaning})),
    }));
    assert.deepEqual(catalog[theme], expected, 'server answers diverged from ' + theme);
  }
});
