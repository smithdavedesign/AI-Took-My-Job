import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const zip = resolve(root, 'nexus-reporter.zip');

// Read version from package.json
const pkg = JSON.parse(execSync('cat package.json', { cwd: root }).toString());
const version = pkg.version;
const tag = `extension-v${version}`;

if (!existsSync(zip)) {
  console.error('nexus-reporter.zip not found — run npm run extension:pack first');
  process.exit(1);
}

// Check gh CLI is available
try {
  execSync('gh --version', { stdio: 'ignore' });
} catch {
  console.error('gh CLI not found — install it from https://cli.github.com');
  process.exit(1);
}

console.log(`Creating GitHub release ${tag}…`);

try {
  execSync(
    `gh release create "${tag}" "${zip}" ` +
    `--title "Nexus Reporter Extension v${version}" ` +
    `--notes "Chrome extension build. Install via chrome://extensions → Load unpacked (zip), or drag the zip onto the extensions page with Developer mode enabled." ` +
    `--latest=false`,
    { cwd: root, stdio: 'inherit' }
  );
  console.log(`\nRelease ${tag} created. Share the zip download URL from the GitHub releases page.`);
} catch {
  console.error('\nRelease creation failed. The tag may already exist — bump the version in package.json and try again.');
  process.exit(1);
}
