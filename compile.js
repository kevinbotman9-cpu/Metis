#!/usr/bin/env node

/**
 * METIS Compiler CLI - Simple wrapper
 * Usage: node compile.js <input.json> --tenant <id> --output <path>
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const inputPath = args[0];
let outputPath = `${inputPath}.compiled.json`;
let tenantId = 'default';

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--output' && i + 1 < args.length) {
    outputPath = args[++i];
  } else if (args[i] === '--tenant' && i + 1 < args.length) {
    tenantId = args[++i];
  }
}

if (!inputPath) {
  console.error('Usage: node compile.js <input.json> --tenant <id> --output <path>');
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`Error: Input file not found: ${inputPath}`);
  process.exit(1);
}

try {
  // Read the input DIR
  const dirContent = fs.readFileSync(inputPath, 'utf-8');
  const dir = JSON.parse(dirContent);

  // Simple compilation simulation (Phase 0)
  const compiled = {
    id: dir.id,
    version: dir.version,
    metadata: {
      id: dir.id,
      version: dir.version,
      tenantId: tenantId,
      createdAt: new Date().toISOString(),
      createdBy: 'cli',
      signature: ''
    },
    dirSchema: dir,
    packageVersions: {},
    costManifest: {
      computeNodes: dir.nodes.length,
      modelInvocations: [],
      externalCalls: 0,
      estimatedP95LatencyMs: Math.min(50, dir.nodes.length * 2),
      estimatedCostPerThousand: 0
    },
    binary: '',
    signature: ''
  };

  console.log('\n✓ Compilation successful');
  console.log(`  Artifact ID: ${compiled.id}`);
  console.log(`  Version: ${compiled.version}`);
  console.log(`  Nodes: ${compiled.dirSchema.nodes.length}`);
  console.log(`  Estimated P95 Latency: ${compiled.costManifest.estimatedP95LatencyMs}ms`);
  console.log(`  Models Invoked: ${compiled.costManifest.modelInvocations.length || 'none'}`);

  // Write compiled artifact
  fs.writeFileSync(outputPath, JSON.stringify(compiled, null, 2));
  console.log(`\n✓ Compiled artifact written to: ${outputPath}\n`);

} catch (error) {
  console.error('Compilation error:', error.message);
  process.exit(1);
}
