import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8')).rules;

test('Firebase rule contract denies all unscoped reads and writes', () => {
  assert.equal(rules['.read'], false);
  assert.equal(rules['.write'], false);
  assert.equal(rules.teachers.$uid['.write'], false);
});
test('Firebase rule contract requires allowlisted host and isolates raw scans', () => {
  const session = rules.sessions.$sessionId;
  assert.match(session.hostUid['.write'], /child\('teachers'\)/);
  assert.match(session.hostUid['.write'], /google.com/);
  assert.match(session.gameState['.write'], /hostUid/);
  assert.match(session.hostUid['.read'], /auth.uid/);
  assert.match(session.rounds.$roundId.scans['.read'], /hostUid/);
});
test('No browser user, including the host, can write to scan awards', () => {
  const scans = rules.sessions.$sessionId.rounds.$roundId.scans;
  assert.equal(scans['.write'], false);
  assert.equal(scans.$scanId, undefined);
  assert.equal(rules.sessions.$sessionId.rounds.$roundId.challenges, undefined);
  assert.match(rules.sessions.$sessionId.gameState.durationSec['.validate'], /900/);
});

// These are static contract checks. Firebase Emulator integration testing remains
// necessary before publishing rules to a real classroom database.
