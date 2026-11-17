import { build } from 'esbuild';
import { rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function prepareOutput() {
  await rm('dist', { force: true, recursive: true });
  await mkdir('dist/assets', { recursive: true });
  await cp('public', 'dist', { recursive: true });
}

export const buildOptions = {
  entryPoints: ['src/main.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  outdir: 'dist/assets',
  entryNames: 'app',
  assetNames: '[name]-[hash]',
  publicPath: '/assets',
  loader: { '.png': 'file', '.jpg': 'file', '.jpeg': 'file', '.svg': 'file', '.webp': 'file', '.woff': 'file', '.woff2': 'file' },
  logLevel: 'info',
};

export async function writeHtml(cacheBust = '') {
  const html = await readFile('index.html', 'utf8');
  const injected = html.replace(
    '<script type="module" src="/src/main.jsx"></script>',
    '<link rel="stylesheet" href="/assets/app.css' + cacheBust + '">' +
    '<script type="module" src="/assets/app.js' + cacheBust + '"></script>'
  );
  if (injected === html) throw new Error('HTML entry point was not found');
  await writeFile('dist/index.html', injected);
}

if (process.argv[1]?.endsWith('/build.mjs')) {
  await prepareOutput();
  await build({
    ...buildOptions,
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const js = await readFile('dist/assets/app.js');
  const suffix = '?v=' + createHash('sha256').update(js).digest('hex').slice(0, 12);
  await writeHtml(suffix);
}
