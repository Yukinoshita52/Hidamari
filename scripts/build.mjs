import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const outDir = 'dist';
await mkdir(outDir, { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  external: ['obsidian', '@codemirror/state', '@codemirror/view', '@codemirror/language'],
  target: 'es2020',
  outfile: outDir + '/main.js'
});
await copyFile('manifest.json', outDir + '/manifest.json');
