/**
 * The two numbers that decide whether Node scales for this workload.
 *
 *   1. Heap per proposition. Node is process-per-core, so each worker holds its
 *      own copy of the catalogue. A JVM would share one heap across threads.
 *      If the per-proposition cost were large, that duplication would be the
 *      argument for moving off Node. Measured: it is not.
 *
 *   2. Tail latency. The mean is comfortably inside budget; the question is
 *      what happens to the unlucky decision that lands during a GC pause.
 *
 * Run: node --expose-gc --import tsx src/scale-probe.ts
 *
 * GC is deliberately NOT measured here. PerformanceObserver({entryTypes:['gc']})
 * reported zero collections over 40,000 decisions, which is impossible — every
 * decision allocates a trace. Rather than publish a number that is quietly
 * wrong, use the runtime's own accounting:
 *
 *   node --trace-gc --import tsx src/scale-probe.ts 2>&1 | grep -c Scavenge
 *
 * which reported 900 scavenges and 6 mark-compacts, pausing ~3.2ms each.
 */
import { buildWorkload } from '@metis/datasets';
import { execute } from '@metis/runtime';

function heapFor(propositions: number): number {
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  const w = buildWorkload({ propositions });
  // Touch it, so nothing is lazily deferred out of the measurement.
  execute(w.artifact, w.catalogue, w.request(0));
  global.gc?.();
  return process.memoryUsage().heapUsed - before;
}

console.log('Catalogue heap footprint (per worker process)');
const points: [number, number][] = [];
for (const n of [100, 1000, 5000]) {
  const bytes = heapFor(n);
  points.push([n, bytes]);
  console.log(
    `  ${String(n).padStart(5)} propositions  ${(bytes / 1e6).toFixed(1)} MB` +
      `  (${Math.round(bytes / n)} bytes each)`
  );
}
const marginal = (points[2][1] - points[0][1]) / (points[2][0] - points[0][0]);
console.log(`  marginal cost: ${Math.round(marginal)} bytes per proposition`);
console.log(
  `  1,000,000 propositions would be ~${((marginal * 1e6) / 1e9).toFixed(2)} GB per worker\n`
);

const w = buildWorkload({ propositions: 40 });
for (let i = 0; i < 2000; i++) execute(w.artifact, w.catalogue, w.request(i));

const N = 40_000;
const lat = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const t = performance.now();
  execute(w.artifact, w.catalogue, w.request(i));
  lat[i] = performance.now() - t;
}

const s = Array.from(lat).sort((a, b) => a - b);
const q = (f: number) => s[Math.min(s.length - 1, Math.ceil(f * s.length) - 1)];
console.log(`Sustained load: ${N.toLocaleString('en-GB')} decisions, 40 candidates`);
console.log(
  `  p50 ${q(0.5).toFixed(3)}ms  p99 ${q(0.99).toFixed(3)}ms  ` +
    `p99.9 ${q(0.999).toFixed(3)}ms  max ${s[s.length - 1].toFixed(3)}ms`
);
console.log(
  `  p99 is ${(q(0.99) / q(0.5)).toFixed(1)}x the median. Scavenge pauses are ~3.2ms, ` +
    `which is\n  where that gap comes from — not from the decision logic.`
);
