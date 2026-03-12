// @ts-check
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outdir = resolve(root, 'dist-extension');
const isWatch = process.argv.includes('--watch');

mkdirSync(outdir, { recursive: true });

// Copy static assets
cpSync(resolve(root, 'extension/manifest.json'), resolve(outdir, 'manifest.json'));
cpSync(resolve(root, 'extension/popup.html'), resolve(outdir, 'popup.html'));
cpSync(resolve(root, 'extension/options.html'), resolve(outdir, 'options.html'));

// Copy icons if they exist
try {
  cpSync(resolve(root, 'extension/icons'), resolve(outdir, 'icons'), { recursive: true });
} catch {
  // Icons directory is optional during development
}

const buildOptions = /** @type {esbuild.BuildOptions} */ ({
  entryPoints: [
    resolve(root, 'extension/popup.ts'),
    resolve(root, 'extension/options.ts'),
    resolve(root, 'extension/background.ts'),
  ],
  bundle: true,
  outdir,
  format: 'esm',
  target: 'chrome120',
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
  logLevel: 'info',
});

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching extension/… (Ctrl+C to stop)');
} else {
  await esbuild.build(buildOptions);
  console.log(`Extension built → ${outdir}`);
}
