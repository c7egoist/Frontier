import { mkdir, writeFile } from 'node:fs/promises';
import { createSampleFieldCsv } from '../src/core/datasets.js';

const target = new URL('../public/sample-wind-field.csv', import.meta.url);
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(target, createSampleFieldCsv([16, 6, 16]), 'utf8');
console.log(`Wrote ${target.pathname}`);
