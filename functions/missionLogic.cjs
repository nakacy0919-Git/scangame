'use strict';
const { randomInt } = require('node:crypto');
const catalog = require('./catalog.json');

const THEMES = Object.freeze(Object.keys(catalog));
const TEAMS = ['A', 'B', 'C', 'D'];
const ID_PATTERN = /^[a-f0-9]{32}$/;

function assertRequestInput(data, includeAnswer = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const keys = includeAnswer ? ['sessionId','roundId','team','cardId','answer'] : ['sessionId','roundId','team','cardId','supportsSpeech'];
  if (Object.keys(data).some(key => !keys.includes(key))) return false;
  if (!ID_PATTERN.test(data.sessionId) || !ID_PATTERN.test(data.roundId)) return false;
  if (!TEAMS.includes(data.team) || typeof data.cardId !== 'string' || data.cardId.length > 48) return false;
  if (!includeAnswer && typeof data.supportsSpeech !== 'boolean') return false;
  if (includeAnswer && (typeof data.answer !== 'string' || data.answer.length > 256)) return false;
  return true;
}

function matchingCard(theme, cardId) {
  if (!THEMES.includes(theme)) return null;
  return catalog[theme].find(card => card.id === cardId) || null;
}

function shuffled(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[j], arr[i]] = [arr[i], arr[j]];
  }
  return arr;
}

function issueChallenge(state, card, supportsSpeech, now) {
  const vocab = card.vocabulary.filter(w => typeof w.word === 'string' && typeof w.meaning === 'string' && w.word && w.meaning);
  if (!vocab.length) throw new Error('No vocabulary for this card');
  const isSpeaking = supportsSpeech && randomInt(2) === 0;
  if (isSpeaking) return {
    type:'SPEAKING', text:card.card_a.text, createdAt:now, expiresAt:Math.min(state.endsAt,now+120_000),
  };
  const target = vocab[randomInt(vocab.length)];
  const available = [...new Set(catalog[state.theme].flatMap(c=>c.vocabulary.map(w=>w.meaning)).filter(w=>w && w!==target.meaning))];
  const choices = shuffled([target.meaning,...shuffled(available).slice(0,3)]);
  return {
    type:'VOCAB', word:target.word, choices, correct:target.meaning,
    createdAt:now, expiresAt:Math.min(state.endsAt,now+120_000),
  };
}

function presentChallenge(challenge) {
  if (challenge.type === 'VOCAB') return {type:'VOCAB',word:challenge.word,choices:challenge.choices};
  if (challenge.type === 'SPEAKING') return {type:'SPEAKING',text:challenge.text};
  throw new Error('Unsupported challenge');
}

// A valid classroom round must still be live when a mission is submitted.
function isRoundActive(state, data, now) {
  return Boolean(state && state.status === 'PLAYING' &&
    state.roundId === data.roundId && Number.isFinite(state.endsAt) &&
    state.endsAt > now && Number.isInteger(state.teamCount) &&
    state.teamCount >= 2 && state.teamCount <= TEAMS.length &&
    TEAMS.slice(0, state.teamCount).includes(data.team) &&
    matchingCard(state.theme, data.cardId));
}

// A challenge may be renewed after expiration, and changing to the correct
// team invalidates the old challenge rather than locking the student out.
function shouldReplaceChallenge(current, team, now) {
  return !current || !Number.isFinite(current.expiresAt) ||
    current.expiresAt <= now || current.team !== team;
}

function gradeChallenge(challenge, answer) {
  if (challenge.type === 'VOCAB') {
    if (!Array.isArray(challenge.choices) || !challenge.choices.includes(answer)) {
      throw new Error('Answer is not one of the issued choices');
    }
    return answer === challenge.correct ? 3 : 1;
  }
  // An untrusted browser cannot prove that speech happened, or grade its own
  // transcript. A speaking task awards 1 participation point only.
  if (challenge.type === 'SPEAKING' && answer === 'completed') return 1;
  throw new Error('Invalid mission answer');
}
module.exports = { THEMES, TEAMS, assertRequestInput, matchingCard, issueChallenge, presentChallenge, gradeChallenge, isRoundActive, shouldReplaceChallenge };
