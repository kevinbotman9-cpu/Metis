/**
 * Load Harness - Latency, throughput, and cost measurement
 */

import type { CompiledArtifact, DecisionRequest } from '@metis/types';
import { execute } from '@metis/runtime';

export interface LoadTest {
  name: string;
  description: string;
  requestsPerSecond: number;
  durationSeconds: number;
  requestGenerator: (index: number) => DecisionRequest;
}

export interface LatencyHistogram {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  mean: number;
}

export interface HarnessResult {
  test: LoadTest;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: LatencyHistogram;
  throughput: number; // requests per second
  totalDurationMs: number;
}

/**
 * Run a load test against a compiled artifact
 */
export async function runLoadTest(
  artifact: CompiledArtifact,
  test: LoadTest
): Promise<HarnessResult> {
  const startTime = Date.now();
  const latencies: number[] = [];
  let successCount = 0;
  let failureCount = 0;

  const endTime = startTime + test.durationSeconds * 1000;
  let requestIndex = 0;

  console.log(`\n=== Load Test: ${test.name} ===`);
  console.log(`${test.description}`);
  console.log(`Target: ${test.requestsPerSecond} req/s for ${test.durationSeconds}s\n`);

  while (Date.now() < endTime) {
    const batchStartTime = Date.now();

    // Generate requests for this batch
    const batchSize = Math.ceil(test.requestsPerSecond / 10); // 10 batches per second
    const promises: Promise<void>[] = [];

    for (let i = 0; i < batchSize; i++) {
      const request = test.requestGenerator(requestIndex++);

      promises.push(
        (async () => {
          const reqStartTime = Date.now();
          try {
            await execute(artifact, request);
            const latency = Date.now() - reqStartTime;
            latencies.push(latency);
            successCount++;
          } catch (error) {
            failureCount++;
          }
        })()
      );
    }

    await Promise.all(promises);

    // Throttle to maintain target rate
    const batchDuration = Date.now() - batchStartTime;
    const targetBatchDuration = (1000 / test.requestsPerSecond) * batchSize;
    const sleepDuration = Math.max(0, targetBatchDuration - batchDuration);
    if (sleepDuration > 0) {
      await new Promise((r) => setTimeout(r, sleepDuration));
    }
  }

  const totalDurationMs = Date.now() - startTime;

  // Calculate histogram
  latencies.sort((a, b) => a - b);
  const histogram: LatencyHistogram = {
    p50: latencies[Math.floor(latencies.length * 0.5)],
    p75: latencies[Math.floor(latencies.length * 0.75)],
    p95: latencies[Math.floor(latencies.length * 0.95)],
    p99: latencies[Math.floor(latencies.length * 0.99)],
    max: latencies[latencies.length - 1],
    min: latencies[0],
    mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
  };

  const result: HarnessResult = {
    test,
    totalRequests: successCount + failureCount,
    successfulRequests: successCount,
    failedRequests: failureCount,
    latencies: histogram,
    throughput: (successCount / totalDurationMs) * 1000,
    totalDurationMs,
  };

  return result;
}

/**
 * Print harness results
 */
export function printResults(result: HarnessResult): void {
  console.log('=== Results ===');
  console.log(`Total Requests: ${result.totalRequests}`);
  console.log(`Successful: ${result.successfulRequests}`);
  console.log(`Failed: ${result.failedRequests}`);
  console.log(`Success Rate: ${((result.successfulRequests / result.totalRequests) * 100).toFixed(2)}%\n`);

  console.log('Latency (ms):');
  console.log(`  Min:  ${result.latencies.min.toFixed(2)}`);
  console.log(`  P50:  ${result.latencies.p50.toFixed(2)}`);
  console.log(`  P75:  ${result.latencies.p75.toFixed(2)}`);
  console.log(`  P95:  ${result.latencies.p95.toFixed(2)}`);
  console.log(`  P99:  ${result.latencies.p99.toFixed(2)}`);
  console.log(`  Max:  ${result.latencies.max.toFixed(2)}\n`);

  console.log(`Throughput: ${result.throughput.toFixed(2)} req/s`);
  console.log(`Total Duration: ${(result.totalDurationMs / 1000).toFixed(2)}s\n`);

  // Gate check
  if (result.latencies.p95 <= 50) {
    console.log('✓ PASS: P95 latency under 50ms');
  } else {
    console.log(`✗ FAIL: P95 latency ${result.latencies.p95.toFixed(2)}ms exceeds budget (50ms)`);
  }
}

/**
 * Create a standard load test scenario
 */
export function createSteadyStateTest(artifact: CompiledArtifact): LoadTest {
  return {
    name: 'Steady State',
    description: 'Constant 100 requests per second for 30 seconds',
    requestsPerSecond: 100,
    durationSeconds: 30,
    requestGenerator: (index: number) => ({
      tenantId: 'test',
      strategyName: 'strategy',
      customerId: `customer_${index % 10000}`,
      context: {
        segment: ['premium', 'standard', 'budget'][index % 3],
        active: true,
      },
    }),
  };
}
