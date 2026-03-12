import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const out = resolve(root, 'nexus-reporter.zip');

if (existsSync(out)) rmSync(out);

execSync(`cd "${resolve(root, 'dist-extension')}" && zip -r "${out}" .`, { stdio: 'inherit' });
console.log(`Packed → nexus-reporter.zip`);
