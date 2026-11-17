export const ALL_TEAMS = ['A', 'B', 'C', 'D'];

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
