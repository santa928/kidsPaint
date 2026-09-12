import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Precache the exact built shell, hashed assets, icons and sounds as one offline version. */
function offlineBundle(): Plugin {
  let outDir = '';
  return {
    name: 'kids-paint-offline-bundle', apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const paths = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name !== 'sw.js')
        .map(entry => resolve(entry.parentPath, entry.name).slice(outDir.length + 1)).sort();
      const hash = createHash('sha256');
      const template = readFileSync(resolve('public/sw.js'), 'utf8');
      hash.update(template);
      for (const path of paths) { hash.update(path); hash.update(readFileSync(resolve(outDir, path))); }
      const source = template.replace('__BUILD_ID__', hash.digest('hex').slice(0, 16))
        .replace('__PRECACHE_MANIFEST__', JSON.stringify(paths.map(path => `./${path}`)));
      writeFileSync(resolve(outDir, 'sw.js'), source);
    },
  };
}
export default defineConfig({ plugins: [react(), offlineBundle()], base: '/kidsPaint/' });
