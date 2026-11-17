'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const { assertRequestInput, matchingCard, issueChallenge, presentChallenge, gradeChallenge, TEAMS } = require('./missionLogic.cjs');

initializeApp({
  databaseURL: 'https://scannect-default-rtdb.asia-southeast1.firebasedatabase.app',
});

const opts = { region:'asia-southeast1', memory:'256MiB', maxInstances:8, timeoutSeconds:20 };
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
  if (!state || state.status !== 'PLAYING' || state.roundId !== data.roundId ||
      !Number.isFinite(state.endsAt) || state.endsAt <= Date.now() ||
      !TEAMS.slice(0,state.teamCount).includes(data.team) ||
      !matchingCard(state.theme,data.cardId)) {
    throw ERR('failed-precondition','This card is not available in the current round.');
  }
  return state;
}

function paths(data,uid) {
  const base = 'sessions/' + data.sessionId + '/rounds/' + data.roundId;
  return {
    challenge: base + '/challenges/' + uid + '/' + data.cardId,
    scan: base + '/scans/' + uid + '_' + data.cardId,
  };
}

exports.startMission = onCall(opts, async request => {
  const uid = requireStudent(request);
  const data = request.data;
  if (!assertRequestInput(data,false)) throw ERR('invalid-argument','Invalid mission request');
  const state = await activeRound(data);
  const card = matchingCard(state.theme,data.cardId);
  const p = paths(data,uid);
  const db = getDatabase();
  const previousScore = await db.ref(p.scan).get();
  if (previousScore.exists()) throw ERR('already-exists','This card was already scored on this device.');
  const next = issueChallenge(state,card,data.supportsSpeech,Date.now());

  const result = await db.ref(p.challenge).transaction(current => current || {...next,team:data.team},undefined,false);
  const challenge = result.snapshot.val();
  if (!challenge || challenge.team !== data.team || challenge.expiresAt <= Date.now()) {
    throw ERR('failed-precondition','The challenge has expired or belongs to another team.');
  }
  return presentChallenge(challenge);
});

exports.submitMission = onCall(opts, async request => {
  const uid = requireStudent(request);
  const data = request.data;
  if (!assertRequestInput(data,true)) throw ERR('invalid-argument','Invalid submission');
  const state = await activeRound(data);
  const p = paths(data,uid);
  const db = getDatabase();
  const [challengeSnap, existingSnap] = await Promise.all([db.ref(p.challenge).get(), db.ref(p.scan).get()]);
  if (existingSnap.exists()) throw ERR('already-exists','The card was already scored.');
  const challenge = challengeSnap.val();
  if (!challenge || challenge.team !== data.team || challenge.expiresAt <= Date.now() ||
      !matchingCard(state.theme,data.cardId)) {
    throw ERR('failed-precondition','The mission is invalid or expired.');
  }
  let points;
  try { points = gradeChallenge(challenge,data.answer); }
  catch { throw ERR('invalid-argument','Invalid answer for this mission.'); }

  // Atomic first-write-wins; retries and concurrent calls cannot add points.
  const result = await db.ref(p.scan).transaction(current => current === null ? {
    team:data.team,code:data.cardId,uid,points,mission:challenge.type,
    timestamp:ServerValue.TIMESTAMP,
  } : undefined,undefined,false);
  if (!result.committed) throw ERR('already-exists','The card has already been scored.');
  return {points,correct:challenge.type==='VOCAB'?points===3:null};
});
