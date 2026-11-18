import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('Vercel Git automatic deployments remain completely disabled', () => {
  const settings = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(settings.git?.deploymentEnabled, false,
    'Automatic Vercel deployments must remain disabled on every branch.');
});

test('CI cannot silently deploy to Vercel on GitHub pushes', () => {
  const workflows = new URL('../.github/workflows/', import.meta.url);
  for (const name of readdirSync(workflows).filter(name => /\.ya?ml$/.test(name))) {
    const yaml = readFileSync(new URL(name, workflows), 'utf8');
    assert.doesNotMatch(yaml, /\bvercel\s+(?:deploy|--prod|promote|rollback)\b/i,
      'Prohibited deployment command in ' + name);
    assert.doesNotMatch(yaml, /\b(?:amondnet\/vercel-action|vercel\/deploy-action)\b/i,
      'Prohibited Vercel deploy action in ' + name);
  }
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const [key, value] of Object.entries(pkg.scripts || {})) {
    assert.doesNotMatch(value, /\bvercel\s+(?:deploy|--prod|promote|rollback)\b/i,
      'Prohibited Vercel deploy script: ' + key);
  }
});
