import { context } from 'esbuild';
import { buildOptions, prepareOutput, writeHtml } from './build.mjs';

await prepareOutput();
await writeHtml();
const ctx = await context({
  ...buildOptions,
  sourcemap: 'inline',
  define: { 'process.env.NODE_ENV': '"development"' },
});
await ctx.rebuild();
await ctx.watch();
const server = await ctx.serve({ servedir: 'dist', host: '127.0.0.1', port: 5173 });
console.log('Scannect development server: http://' + server.host + ':' + server.port);
process.on('SIGINT', async () => { await ctx.dispose(); process.exit(0); });
