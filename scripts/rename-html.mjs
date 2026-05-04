import {renameSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const outputDir = resolve(import.meta.dirname, '../dist');
const indexHtml = resolve(outputDir, 'index.html');
const appHtml = resolve(outputDir, 'app.html');

if (!existsSync(indexHtml)) {
  throw new Error(`Vite output is missing ${indexHtml}`);
}

renameSync(indexHtml, appHtml);
