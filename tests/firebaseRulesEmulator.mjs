import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { get, ref, set, serverTimestamp, runTransaction } from 'firebase/database';
import { readFileSync } from 'node:fs';

const projectId = 'demo-scannect';
const roundId = 'a'.repeat(32);
const path = 'sessions/classroom';
const scansPath = path + '/rounds/' + roundId + '/scans';

const env = await initializeTestEnvironment({
  projectId,
  database: {
    host: '127.0.0.1',
    port: 9000,
    rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
  },
});

try {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), 'teachers/teacher-1'), true);
  });

  const teacher = env.authenticatedContext('teacher-1', { firebase: { sign_in_provider: 'google.com' } });
  const intruder = env.authenticatedContext('intruder', { firebase: { sign_in_provider: 'google.com' } });
  const student = env.authenticatedContext('student-1', { firebase: { sign_in_provider: 'anonymous' } });
  const otherStudent = env.authenticatedContext('student-2', { firebase: { sign_in_provider: 'anonymous' } });
  const guest = env.unauthenticatedContext();

  await assertFails(set(ref(intruder.database(), path + '/hostUid'), 'intruder'));
  await assertFails(set(ref(student.database(), path + '/hostUid'), 'student-1'));
  await assertSucceeds(set(ref(teacher.database(), path + '/hostUid'), 'teacher-1'));
  await assertFails(set(ref(intruder.database(), path + '/hostUid'), 'intruder'));

  await assertSucceeds(get(ref(teacher.database(), path + '/hostUid')));
  await assertFails(get(ref(student.database(), path + '/hostUid')));

  await assertSucceeds(set(ref(teacher.database(), path + '/gameState'), {
    status: 'PLAYING', theme: 'cafe', roundId, endsAt: Date.now() + 60_000,
    teamCount: 2, durationSec: 300, scannedCodes: {},
  }));

  await assertSucceeds(get(ref(student.database(), path + '/gameState')));
  await assertFails(get(ref(guest.database(), path + '/gameState')));
  await assertFails(set(ref(student.database(), path + '/gameState/status'), 'MENU'));

  const validScan = {
    team: 'A', code: 'CAFE_001', points: 3, uid: 'student-1', timestamp: serverTimestamp(),
  };
  await assertFails(set(ref(student.database(), scansPath + '/student-1_CAFE_001'), validScan));
  await assertFails(set(ref(teacher.database(), scansPath + '/teacher-1_CAFE_001'), {
    ...validScan, uid: 'teacher-1',
  }));
  await env.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), scansPath + '/student-1_CAFE_001'), {
      ...validScan, timestamp: Date.now(),
    });
  });

  await assertFails(set(ref(student.database(), scansPath + '/student-1_CAFE_031'), {
    ...validScan, code: 'CAFE_031',
  }));
  await assertFails(set(ref(student.database(), scansPath + '/student-1_AIR_001'), {
    ...validScan, code: 'AIR_001',
  }));
  await assertFails(set(ref(student.database(), scansPath + '/student-1_CAFE_002'), {
    ...validScan, code: 'CAFE_002', points: 999,
  }));
  await assertFails(set(ref(student.database(), scansPath + '/student-1_CAFE_003'), {
    ...validScan, code: 'CAFE_003', team: 'D',
  }));
  await assertFails(set(ref(student.database(), path + '/rounds/' + 'b'.repeat(32) + '/scans/student-1_CAFE_002'), {
    ...validScan, code: 'CAFE_002',
  }));
  // Clients cannot view private server-issued challenge answers.
  await env.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), path + '/rounds/' + roundId + '/challenges/student-1/CAFE_001'), {
      type:'VOCAB', team:'A', word:'awake', correct:'目が覚めて、眠気のない',
      choices:['目が覚めて、眠気のない','眠る','回復する','走る'],
      createdAt:Date.now(), expiresAt:Date.now()+10000,
    });
  });
  await assertFails(get(ref(student.database(), path + '/rounds/' + roundId + '/challenges/student-1/CAFE_001')));
  await assertFails(get(ref(teacher.database(), path + '/rounds/' + roundId + '/challenges/student-1/CAFE_001')));
  await assertFails(set(ref(student.database(), path + '/rounds/' + roundId + '/startLimits/student-1'), {last:Date.now(),count:1}));

  // The same first-write-wins transaction used by the trusted backend allows
  // only one competing student to claim a team/card score.
  await env.withSecurityRulesDisabled(async context => {
    const awardRef = ref(context.database(), scansPath + '/A_CAFE_002');
    const startAt = Date.now();
    const [first, second] = await Promise.all([
      runTransaction(awardRef, current => current === null
        ? {team:'A', code:'CAFE_002', uid:'student-1', points:3, timestamp:startAt}
        : undefined),
      runTransaction(awardRef, current => current === null
        ? {team:'A', code:'CAFE_002', uid:'student-2', points:1, timestamp:startAt}
        : undefined),
    ]);
    assert.equal([first.committed,second.committed].filter(Boolean).length,1,
      'Only one device should win each team/card');
  });
  await assertFails(get(ref(student.database(), scansPath)));
  await assertSucceeds(get(ref(teacher.database(), scansPath)));

  await assertSucceeds(set(ref(teacher.database(), path + '/gameState/status'), 'GAMEOVER'));
  await assertFails(set(ref(otherStudent.database(), scansPath + '/student-2_CAFE_001'), {
    team: 'B', code: 'CAFE_001', points: 1, uid: 'student-2', timestamp: serverTimestamp(),
  }));

  console.log('Firebase Realtime Database emulator security tests passed');
} finally {
  await env.cleanup();
}
