import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const themes = [
  'airport', 'cafe', 'english', 'help', 'hotel', 'media',
  'revitalization', 'sdgs', 'volunteer', 'world', 'worry', 'zoo'
];
const prefixes = {
  airport: 'AIR', cafe: 'CAFE', english: 'ENGLISH', help: 'HELP',
  hotel: 'HOTEL', media: 'ML', revitalization: 'REV', sdgs: 'SDG',
  volunteer: 'VOL', world: 'WORLD', worry: 'WORRY', zoo: 'ZOO'
};

for (const theme of themes) {
  test(theme + ' has 30 valid, uniquely identifiable cards', () => {
    const cards = JSON.parse(readFileSync(new URL('../src/data/' + theme + '.json', import.meta.url), 'utf8'));
    assert.equal(cards.length, 30);
    const ids = new Set();
    for (const card of cards) {
      assert.match(card.id, new RegExp('^' + prefixes[theme] + '_(00[1-9]|0[12][0-9]|030)
      assert.equal(ids.has(card.id), false, 'duplicate id: ' + card.id);
      ids.add(card.id);
      assert.ok(card.card_a?.text?.trim(), card.id + ' missing side A');
      assert.ok(card.card_b?.text?.trim(), card.id + ' missing side B');
      assert.ok(Array.isArray(card.vocabulary) && card.vocabulary.length, card.id + ' missing vocabulary');
      for (const vocab of card.vocabulary) {
        assert.ok(vocab.word?.trim(), card.id + ' missing vocabulary word');
        assert.ok(vocab.meaning?.trim(), card.id + ' missing vocabulary meaning');
      }
    }
  });
}
));
      assert.equal(ids.has(card.id), false, 'duplicate id: ' + card.id);
      ids.add(card.id);
      assert.ok(card.card_a?.text?.trim(), card.id + ' missing side A');
      assert.ok(card.card_b?.text?.trim(), card.id + ' missing side B');
      assert.ok(Array.isArray(card.vocabulary) && card.vocabulary.length, card.id + ' missing vocabulary');
      for (const vocab of card.vocabulary) {
        assert.ok(vocab.word?.trim(), card.id + ' missing vocabulary word');
        assert.ok(vocab.meaning?.trim(), card.id + ' missing vocabulary meaning');
      }
    }
  });
}
