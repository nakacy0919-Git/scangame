export const ALL_TEAMS = ['A', 'B', 'C', 'D'];

export function selectableTeams(teamCount) {
  return ALL_TEAMS.slice(0, Number.isInteger(teamCount) && teamCount >= 2 && teamCount <= 4 ? teamCount : 2);
}


export function newId() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('A secure HTTPS connection is required for game sessions.');
  }
  return globalThis.crypto.randomUUID().replaceAll('-', '');
}

export function findCard(codes, scannedCode) {
  if (!Array.isArray(codes) || typeof scannedCode !== 'string') return null;
  return codes.find(card => card.id === scannedCode || card.code === scannedCode) ?? null;
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getVocabQuestion(card, themeData) {
  const words = Array.isArray(card?.vocabulary)
    ? card.vocabulary.filter(item => item.word?.trim() && item.meaning?.trim())
    : [];
  if (!words.length) return null;

  const target = shuffle(words)[0];
  const meanings = new Set(
    (Array.isArray(themeData) ? themeData : [])
      .flatMap(item => item.vocabulary ?? [])
      .map(item => item.meaning?.trim())
      .filter(value => value && value !== target.meaning.trim())
  );
  const choices = shuffle([target.meaning, ...shuffle([...meanings]).slice(0, 3)]);
  return { word: target.word, correct: target.meaning, choices };
}

export function speechAccuracy(target, spoken) {
  const tokens = value => String(value ?? '')
    .toLowerCase()
    .replace(/\[[^\]]*]/g, ' ')
    .match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) ?? [];
  const expected = tokens(target);
  const actual = tokens(spoken);
  if (!expected.length) return 0;

  const counts = new Map();
  for (const word of actual) counts.set(word, (counts.get(word) ?? 0) + 1);
  let matched = 0;
  for (const word of expected) {
    if ((counts.get(word) ?? 0) > 0) {
      matched++;
      counts.set(word, counts.get(word) - 1);
    }
  }
  return matched / expected.length;
}

export function speechPoints(accuracy) {
  if (accuracy >= 0.8) return 10;
  if (accuracy >= 0.5) return 5;
  return 1;
}

export function validMissionPoints(points) {
  return Number.isInteger(points) && [1, 3, 5, 10].includes(points);
}

export function isValidTheme(theme, gameData) {
  return typeof theme === 'string' && Object.prototype.hasOwnProperty.call(gameData, theme);
}


/**
 * Derive the scoreboard from server-accepted scan records.
 * Stable timestamp/key ordering avoids changing combo bonuses after a reconnect.
 * The host remains responsible for verifying the actual QR card identifiers.
 */
export function summarizeRound(records, cards, teams = ALL_TEAMS, endsAt = Infinity) {
  const scores = Object.fromEntries(ALL_TEAMS.map(team => [team, 0]));
  const maxCombos = Object.fromEntries(ALL_TEAMS.map(team => [team, 0]));
  const currentCombos = Object.fromEntries(ALL_TEAMS.map(team => [team, 0]));
  const scannedCodes = {};
  const acceptedKeys = [];
  const acceptedEvents = [];

  const known = new Map(
    (Array.isArray(cards) ? cards : [])
      .filter(card => typeof card.id === 'string')
      .map(card => [card.id, card.id])
  );
  for (const card of Array.isArray(cards) ? cards : []) {
    if (typeof card.code === 'string' && card.code) known.set(card.code, card.id);
  }

  const events = Object.entries(records && typeof records === 'object' ? records : {})
    .filter(([, item]) => item && typeof item === 'object')
    .sort(([keyA, a], [keyB, b]) =>
      Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0) || keyA.localeCompare(keyB)
    );

  for (const [key, event] of events) {
    if (!teams.includes(event.team) || !validMissionPoints(event.points) ||
        !Number.isFinite(event.timestamp) || event.timestamp <= 0 ||
        event.timestamp > endsAt) continue;

    const cardId = known.get(event.code);
    if (!cardId) continue;

    if (scannedCodes[event.team]?.[cardId]) continue;
    (scannedCodes[event.team] ??= {})[cardId] = true;
    acceptedKeys.push(key);

    const combo = ++currentCombos[event.team];
    const bonus = combo % 3 === 0 ? 2 : 0;
    scores[event.team] += event.points + bonus;
    acceptedEvents.push({ key, team: event.team, cardId, earnedPoints: event.points + bonus, bonus });
    maxCombos[event.team] = Math.max(maxCombos[event.team], combo);
  }

  return { scores, maxCombos, scannedCodes, acceptedKeys, acceptedEvents };
}
