/**
 * Where does a decision actually spend its time?
 *
 * Run: node --cpu-prof --cpu-prof-dir=./prof node_modules/tsx/dist/cli.mjs src/profile.ts
 */
import { buildWorkload } from '@metis/datasets';
import { execute } from '@metis/runtime';

const w = buildWorkload({ offers: 400 });
for (let i = 0; i < 300; i++) execute(w.artifact, w.catalogue, w.request(i));
for (let i = 0; i < 4000; i++) execute(w.artifact, w.catalogue, w.request(i));
console.log('done');
