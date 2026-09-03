/**
 * Integration Test: Compile and Execute
 * Tests the full pipeline: DIR → compile → execute → trace
 */

import * as fs from 'fs';
import * as path from 'path';
import { compile } from '@metis/compiler';
import { execute } from '@metis/runtime';
import type { Tenant } from '@metis/types';

describe('Compile and Execute', () => {
  let tenantConfig: Tenant;

  beforeEach(() => {
    tenantConfig = {
      id: 'test-tenant',
      name: 'Test Tenant',
      latencyBudgetMs: 50,
      maxNodesPerArtifact: 1000,
    };
  });

  test('should compile simple filter strategy', () => {
    const dirPath = path.join(__dirname, '../fixtures/simple-filter.json');
    const dirContent = fs.readFileSync(dirPath, 'utf-8');
    const dir = JSON.parse(dirContent);

    const result = compile(dir, { tenantConfig });

    expect(result.success).toBe(true);
    expect(result.artifact).toBeDefined();
    expect(result.artifact!.costManifest.estimatedP95LatencyMs).toBeLessThan(50);
  });

  test('should execute compiled artifact', async () => {
    const dirPath = path.join(__dirname, '../fixtures/simple-filter.json');
    const dirContent = fs.readFileSync(dirPath, 'utf-8');
    const dir = JSON.parse(dirContent);

    const compileResult = compile(dir, { tenantConfig });
    if (!compileResult.success || !compileResult.artifact) {
      throw new Error('Compilation failed');
    }

    const artifact = compileResult.artifact;

    const response = await execute(artifact, {
      tenantId: 'test-tenant',
      strategyName: 'simple-filter-strategy',
      customerId: 'customer_123',
      context: {
        active: true,
        segment: 'premium',
      },
    });

    expect(response.decisionId).toBeDefined();
    expect(response.trace).toBeDefined();
    expect(response.trace.totalMs).toBeGreaterThan(0);
    expect(response.trace.totalMs).toBeLessThan(50);
  });

  test('should produce deterministic results', async () => {
    const dirPath = path.join(__dirname, '../fixtures/simple-filter.json');
    const dirContent = fs.readFileSync(dirPath, 'utf-8');
    const dir = JSON.parse(dirContent);

    const compileResult = compile(dir, { tenantConfig });
    if (!compileResult.success || !compileResult.artifact) {
      throw new Error('Compilation failed');
    }

    const artifact = compileResult.artifact;

    const request = {
      tenantId: 'test-tenant',
      strategyName: 'simple-filter-strategy',
      customerId: 'customer_123',
      context: {
        active: true,
        segment: 'premium',
      },
    };

    // Execute multiple times
    const results = [];
    for (let i = 0; i < 5; i++) {
      const response = await execute(artifact, request);
      results.push(response);
    }

    // All should have the same decision
    const firstDecision = results[0].decision.winner;
    for (const result of results) {
      expect(result.decision.winner).toBe(firstDecision);
    }

    // All traces should be chainable
    for (let i = 1; i < results.length; i++) {
      expect(results[i].trace.prevHash).toBeDefined();
    }
  });
});
