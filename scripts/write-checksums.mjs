import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
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
  .filter((file) => !file.endsWith(`${sep}checksums.json`))
  .map((file) => {
    const buffer = readFileSync(file);
    return {
      path: relative(outputDir, file).split(sep).join('/'),
      sha256: createHash('sha256').update(buffer).digest('hex'),
      bytes: buffer.byteLength,
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

writeFileSync(resolve(outputDir, 'checksums.json'), `${JSON.stringify({files}, null, 2)}\n`);
