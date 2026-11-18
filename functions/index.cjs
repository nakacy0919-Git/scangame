'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { assertRequestInput, matchingCard, issueChallenge, presentChallenge, gradeChallenge, isRoundActive, shouldReplaceChallenge } = require('./missionLogic.cjs');

initializeApp({
  databaseURL: 'https://scannect-default-rtdb.asia-southeast1.firebasedatabase.app',
});

const opts = { region:'asia-southeast1', memory:'256MiB', maxInstances:3, concurrency:20, timeoutSeconds:20 };
const ERR = (code, message) => new HttpsError(code, message);

function requireStudent(request) {
  if (!request.auth || request.auth.token.firebase?.sign_in_provider !== 'anonymous') {
    throw ERR('unauthenticated','Student anonymous sign-in is required.');
  }
  return request.auth.uid;
}

async function activeRound(data) {
  const stateSnap = await getDatabase().ref('sessions/' + data.sessionId + '/gameState').get();
  const state = stateSnap.val();
  if (!isRoundActive(state, data, Date.now())) {
    throw ERR('failed-precondition','This card is not available in the current round.');
  }
  return state;
}

function paths(data,uid) {
  const base = 'sessions/' + data.sessionId + '/rounds/' + data.roundId;
  return {
    challenge: base + '/challenges/' + uid + '/' + data.cardId,
    scan: base + '/scans/' + data.team + '_' + data.cardId,
    throttle: base + '/startLimits/' + uid,
  };
}

exports.startMission = onCall(opts, async request => {
  const uid = requireStudent(request);
  const data = request.data;
  if (!assertRequestInput(data, false)) throw ERR('invalid-argument', 'Invalid mission request');
  const state = await activeRound(data);
  const card = matchingCard(state.theme, data.cardId);
  const p = paths(data, uid);
  const db = getDatabase();
  const [existingScore, existingChallenge] = await Promise.all([
    db.ref(p.scan).get(), db.ref(p.challenge).get(),
  ]);
  if (existingScore.exists()) {
    throw ERR('already-exists', 'Your team has already earned points for this card.');
  }
  const now = Date.now();
  const current = existingChallenge.val();
  if (current && !shouldReplaceChallenge(current, data.team, now)) {
    return presentChallenge(current);
  }

  // Limit challenge creation/renewal per anonymous device and round. This is a
  // classroom quota, not a substitute for App Check / per-IP anti-abuse.
  const allowed = await db.ref(p.throttle).transaction(previous => {
    const last = Number(previous?.last) || 0;
    const count = Number(previous?.count) || 0;
    const time = Date.now();
    if (time - last < 900 || count >= 65) return undefined;
    return { last: time, count: count + 1 };
  }, undefined, false);
  if (!allowed.committed) {
    throw ERR('resource-exhausted', 'Too many missions requested from this device.');
  }

  const result = await db.ref(p.challenge).transaction(previous => {
    const currentTime = Date.now();
    if (!shouldReplaceChallenge(previous, data.team, currentTime)) return undefined;
    if (currentTime >= state.endsAt) return undefined;
    return { ...issueChallenge(state, card, data.supportsSpeech, currentTime), team: data.team };
  }, undefined, false);
  const challenge = result.snapshot.val();
  if (!challenge || challenge.team !== data.team ||
      challenge.expiresAt <= Date.now()) {
    throw ERR('failed-precondition', 'The challenge has expired or belongs to another team.');
  }
  return presentChallenge(challenge);
});

exports.submitMission = onCall(opts, async request => {
  const uid = requireStudent(request);
  const data = request.data;
  if (!assertRequestInput(data, true)) throw ERR('invalid-argument', 'Invalid submission');
  const p = paths(data, uid);
  const db = getDatabase();

  // A response may be lost after a successful commit. A safe retry from the
  // same student returns the recorded result without awarding points twice.
  const existingSnap = await db.ref(p.scan).get();
  if (existingSnap.exists()) {
    const previous = existingSnap.val();
    if (previous.uid === uid && previous.team === data.team && previous.code === data.cardId) {
      return { points: previous.points, correct: previous.mission === 'VOCAB' ? previous.points === 3 : null, duplicate: true };
    }
    throw ERR('already-exists', 'Your team has already completed this card.');
  }

  const state = await activeRound(data);
  const challengeSnap = await db.ref(p.challenge).get();
  const challenge = challengeSnap.val();
  if (!challenge || challenge.team !== data.team || challenge.expiresAt <= Date.now() ||
      !matchingCard(state.theme, data.cardId)) {
    throw ERR('failed-precondition', 'The mission is invalid or expired.');
  }
  let points;
  try { points = gradeChallenge(challenge, data.answer); }
  catch { throw ERR('invalid-argument', 'Invalid answer for this mission.'); }

  // One authoritative record PER TEAM AND CARD prevents duplicate scores from
  // many devices/accounts. Date checks run on every transaction retry.
  const result = await db.ref(p.scan).transaction(current => {
    if (current || Date.now() >= state.endsAt || Date.now() >= challenge.expiresAt) return undefined;
    return { team:data.team, code:data.cardId, uid, points, mission:challenge.type,
      timestamp:ServerValue.TIMESTAMP };
  }, undefined, false);
  if (!result.committed) {
    const previous = result.snapshot.val();
    if (previous && previous.uid === uid) {
      return { points:previous.points, correct:previous.mission === 'VOCAB' ? previous.points === 3 : null, duplicate:true };
    }
    throw ERR(previous ? 'already-exists' : 'failed-precondition',
      previous ? 'Your team has already scored this card.' : 'The round finished before your answer was submitted.');
  }
  return { points, correct:challenge.type === 'VOCAB' ? points === 3 : null, duplicate:false };
});
