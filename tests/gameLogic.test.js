import test from 'node:test';
import assert from 'node:assert/strict';
import { findCard, getVocabQuestion, speechAccuracy, speechPoints, shuffle, validMissionPoints, isValidTheme } from '../src/gameLogic.js';

const codes = [
  { id: 'CAFE_001', card_a: { text: 'Hello' }, vocabulary: [{ word: 'hello', meaning: 'こんにちは' }, { word: 'hi', meaning: 'こんにちは' }] },
  { id: 'CAFE_002', vocabulary: [{ word: 'milk', meaning: '牛乳' }] },
  { id: 'CAFE_003', vocabulary: [{ word: 'water', meaning: '水' }] },
];

test('only an exact, known card matches the scanner input', () => {
  assert.equal(findCard(codes, 'CAFE_001')?.id, 'CAFE_001');
  assert.equal(findCard(codes, 'CAFE_001/../../'), null);
  assert.equal(findCard(codes, null), null);
  assert.equal(findCard([], 'CAFE_001'), null);
});
test('vocabulary choices contain one answer and no duplicate meanings', () => {
  for (let i = 0; i < 20; i++) {
    const question = getVocabQuestion(codes[0], codes);
    assert.ok(question);
    assert.equal(new Set(question.choices).size, question.choices.length);
    assert.equal(question.choices.filter(value => value === question.correct).length, 1);
  }
});
test('missing vocabulary has no fake completion reward', () => {
  assert.equal(getVocabQuestion({}, codes), null);
});
test('speech scoring does not count repeated recognized words multiple times', () => {
  assert.equal(speechAccuracy('I want water water', 'I water'), 0.5);
  assert.equal(speechAccuracy('hello hello hello', 'hello'), 1 / 3);
  assert.equal(speechAccuracy('[A tourist] Hello world', 'Hello world'), 1);
  assert.equal(speechAccuracy('', ''), 0);
  assert.equal(speechPoints(0.8), 10);
  assert.equal(speechPoints(0.5), 5);
  assert.equal(speechPoints(0), 1);
});
test('rejects fabricated scores and unknown themes', () => {
  assert.equal(validMissionPoints(10), true);
  assert.equal(validMissionPoints(999), false);
  assert.equal(validMissionPoints('10'), false);
  assert.equal(isValidTheme('__proto__', { cafe: {} }), false);
  assert.equal(isValidTheme('cafe', { cafe: {} }), true);
});
test('shuffle preserves membership', () => {
  assert.deepEqual(shuffle([1, 2, 3], () => 0).sort(), [1, 2, 3]);
});
