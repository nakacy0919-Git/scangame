import test from 'node:test';
import assert from 'node:assert/strict';
import { findCard, getVocabQuestion, speechAccuracy, speechPoints, shuffle, validMissionPoints, isValidTheme, summarizeRound, selectableTeams } from '../src/gameLogic.js';

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


test('round summary deduplicates simultaneous team-card scans and computes combo bonus', () => {
  const records = {
    last: { team: 'A', code: 'CAFE_003', points: 10, timestamp: 300 },
    first: { team: 'A', code: 'CAFE_001', points: 3, timestamp: 100 },
    duplicate: { team: 'A', code: 'CAFE_001', points: 10, timestamp: 110 },
    second: { team: 'A', code: 'CAFE_002', points: 5, timestamp: 200 },
    otherTeam: { team: 'B', code: 'CAFE_001', points: 1, timestamp: 250 },
  };
  const result = summarizeRound(records, codes, ['A', 'B'], 350);
  assert.deepEqual(result.acceptedKeys, ['first', 'second', 'otherTeam', 'last']);
  assert.equal(result.scores.A, 3 + 5 + 10 + 2);
  assert.equal(result.scores.B, 1);
  assert.equal(result.maxCombos.A, 3);
  assert.equal(result.acceptedEvents.find(event => event.key === 'last').earnedPoints, 12);
  assert.equal(result.scannedCodes.A.CAFE_001, true);
  assert.equal(result.scannedCodes.B.CAFE_001, true);
});

test('round summary rejects invalid identifiers, malformed points, disabled teams and late records', () => {
  const summary = summarizeRound({
    forged: { team: 'A', code: 'NOT_A_CARD', points: 10, timestamp: 10 },
    invalidPoints: { team: 'A', code: 'CAFE_001', points: 999, timestamp: 20 },
    late: { team: 'A', code: 'CAFE_001', points: 3, timestamp: 2000 },
    inactiveTeam: { team: 'D', code: 'CAFE_001', points: 3, timestamp: 30 },
    good: { team: 'A', code: 'CAFE_002', points: 5, timestamp: 50 },
  }, codes, ['A', 'B'], 100);
  assert.equal(summary.scores.A, 5);
  assert.equal(summary.scores.D, 0);
  assert.deepEqual(summary.acceptedKeys, ['good']);
});

test('scanner displays only current round teams', () => {
  assert.deepEqual(selectableTeams(2), ['A','B']);
  assert.deepEqual(selectableTeams(3), ['A','B','C']);
  assert.deepEqual(selectableTeams(4), ['A','B','C','D']);
  assert.deepEqual(selectableTeams(999), ['A','B']);
  assert.deepEqual(selectableTeams(undefined), ['A','B']);
});
