/**
 * Zips the portal builds for upload: portals/crop-crawler-youtube.zip and portals/crop-crawler-crazygames.zip.
 * Run after `npm run build:youtube && npm run build:crazygames`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('portals', { recursive: true });
for (const flavor of ['youtube', 'crazygames']) {
  const dir = resolve('dist', flavor);
  if (!existsSync(dir)) {
    console.error(`missing ${dir} — run npm run build:${flavor} first`);
    process.exit(1);
  }
  const out = resolve('portals', `crop-crawler-${flavor}.zip`);
  rmSync(out, { force: true });
  execFileSync('zip', ['-qr9', out, '.', '-x', '*.map'], { cwd: dir });
  const kb = statSync(out).size / 1024;
  console.log(`✓ ${out} (${kb.toFixed(0)} KB)`);
  const list = execFileSync('zip', ['-sf', out]).toString().split('\n').filter((l) => /index\.html|assets\//.test(l)).length;
  console.log(`  ${list} entries incl. index.html at the archive root`);
}
