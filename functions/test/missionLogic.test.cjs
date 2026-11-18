'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {assertRequestInput,matchingCard,issueChallenge,presentChallenge,gradeChallenge,THEMES,isRoundActive,shouldReplaceChallenge} = require('../missionLogic.cjs');
const id='a'.repeat(32),roundId='b'.repeat(32);
const sample={sessionId:id,roundId,team:'A',cardId:'CAFE_001',supportsSpeech:false};
const state={theme:'cafe',endsAt:Date.now()+60000};
test('all twelve themes and 360 catalog cards exist on the server',()=>{
  assert.equal(THEMES.length,12);
  for(const theme of THEMES) assert.equal(require('../catalog.json')[theme].length,30);
});
test('malformed IDs, overposted values and additional point fields are rejected',()=>{
  assert.equal(assertRequestInput(sample),true);
  assert.equal(assertRequestInput({...sample,points:10}),false);
  assert.equal(assertRequestInput({...sample,cardId:'../CAFE_001'}),false);
  assert.equal(matchingCard('cafe','../CAFE_001'),null);
  assert.equal(assertRequestInput({...sample,sessionId:'../bad'}),false);
  assert.equal(assertRequestInput({...sample,team:'D',supportsSpeech:'yes'}),false);
});
test('server determines vocabulary points and does not disclose answer in challenge',()=>{
  const card=matchingCard('cafe','CAFE_001');
  const challenge=issueChallenge(state,card,false,Date.now());
  const visible=presentChallenge(challenge);
  assert.equal(visible.type,'VOCAB');
  assert.equal('correct' in visible,false);
  assert.equal(visible.choices.includes(challenge.correct),true);
  assert.equal(gradeChallenge(challenge,challenge.correct),3);
  const incorrect = visible.choices.find(choice => choice !== challenge.correct);
  assert.equal(gradeChallenge(challenge,incorrect),1);
  assert.throws(() => gradeChallenge(challenge,'made-up-choice'));
});
test('client-reported speech scores cannot reach the server',()=>{
  const card=matchingCard('cafe','CAFE_001');
  const challenge={type:'SPEAKING',text:card.card_a.text};
  assert.equal(gradeChallenge(challenge,'completed'),1);
  assert.throws(()=>gradeChallenge(challenge,'10'));
  assert.equal(assertRequestInput({...sample,answer:'completed',points:10}),false);
  assert.equal(assertRequestInput({sessionId:id,roundId,team:'A',cardId:'CAFE_001',answer:'completed'},true),true);
});

test('round must be active and its team and card valid at the server clock', () => {
  const now = Date.now();
  const active = { status:'PLAYING', theme:'cafe', roundId, teamCount:2, endsAt:now+5000 };
  assert.equal(isRoundActive(active,sample,now),true);
  assert.equal(isRoundActive(active,sample,now+5000),false);
  assert.equal(isRoundActive({...active,status:'GAMEOVER'},sample,now),false);
  assert.equal(isRoundActive({...active,theme:'world'},sample,now),false);
  assert.equal(isRoundActive({...active,roundId:id},sample,now),false);
  assert.equal(isRoundActive({...active,teamCount:4},{...sample,team:'D'},now),true);
  assert.equal(isRoundActive(active,{...sample,team:'D'},now),false);
  assert.equal(isRoundActive({...active,teamCount:5},sample,now),false);
});

test('expired or wrong-team challenges can be safely reissued', () => {
  const now=Date.now();
  assert.equal(shouldReplaceChallenge(null,'A',now),true);
  assert.equal(shouldReplaceChallenge({team:'A',expiresAt:now+5000},'A',now),false);
  assert.equal(shouldReplaceChallenge({team:'A',expiresAt:now},'A',now),true);
  assert.equal(shouldReplaceChallenge({team:'A',expiresAt:now+5000},'B',now),true);
  assert.equal(shouldReplaceChallenge({team:'A',expiresAt:NaN},'A',now),true);
});

test('invalid Firebase paths and malformed auth payloads are rejected', () => {
  assert.equal(assertRequestInput({...sample,cardId:'CAFE_001/evil'}),false);
  assert.equal(assertRequestInput({...sample,cardId:'CAFE_001.'}),false);
  assert.equal(assertRequestInput({...sample,sessionId:['a'.repeat(32)]}),false);
  assert.equal(assertRequestInput({...sample,roundId:roundId.slice(1)}),false);
  assert.equal(assertRequestInput({...sample,answer:'yes',supportsSpeech:true},true),false);
});
