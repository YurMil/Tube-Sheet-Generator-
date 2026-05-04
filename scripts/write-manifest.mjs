import {readdirSync, statSync, writeFileSync} from 'node:fs';
import {relative, resolve, sep} from 'node:path';

const outputDir = resolve(import.meta.dirname, '../dist');

const collectFiles = (dir) =>
  readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }
    return fullPath;
  });

const files = collectFiles(outputDir)
  .filter((file) => !file.endsWith(`${sep}manifest.json`))
  .map((file) => {
    const stats = statSync(file);
    return {
      path: relative(outputDir, file).split(sep).join('/'),
      bytes: stats.size,
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  slug: 'tube-sheet-generator',
  entry: 'app.html',
  generatedAt: new Date().toISOString(),
  files,
};

writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
