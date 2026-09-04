#!/usr/bin/env node

/**
 * CLI for METIS Compiler
 * Usage: metis compile strategy.json --tenant telco-uk --output compiled.json
 */

import * as fs from 'fs';
import { compile, generateCompileReport } from './compile';
import type { Tenant } from '@metis/types';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
METIS Compiler

Usage:
  metis-compile <input> [options]

Arguments:
  input                 Path to the DIR JSON file to compile

Options:
  --tenant <id>         Tenant ID (required)
  --output <path>       Output file path (default: <input>.compiled.json)
  --budget <ms>         Latency budget in milliseconds (default: 50)
  --sign                Sign the compiled artifact
  --help                Show this help message

Example:
  metis-compile strategy.json --tenant telco-uk --output compiled.json --budget 50
`);
  process.exit(0);
}

const inputPath = args[0];
let outputPath = `${inputPath}.compiled.json`;
let tenantId: string | undefined;
let latencyBudgetMs = 50;
let sign = false;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--output' && i + 1 < args.length) {
    outputPath = args[++i];
  } else if (args[i] === '--tenant' && i + 1 < args.length) {
    tenantId = args[++i];
  } else if (args[i] === '--budget' && i + 1 < args.length) {
    latencyBudgetMs = parseInt(args[++i], 10);
  } else if (args[i] === '--sign') {
    sign = true;
  }
}

if (!tenantId) {
  console.error('Error: --tenant is required');
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

  // Create tenant config
  const tenantConfig: Tenant = {
    id: tenantId,
    name: tenantId,
    latencyBudgetMs,
    maxNodesPerArtifact: 1000,
  };

  // Compile
  const result = compile(dir, {
    tenantConfig,
    sign,
    createdBy: 'cli',
  });

  // Print report
  console.log(generateCompileReport(result));

  if (!result.success) {
    process.exit(1);
  }

  // Write compiled artifact
  if (result.artifact) {
    const output = {
      ...result.artifact,
      binary: result.artifact.binary.toString('base64'), // Encode binary as base64
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n✓ Compiled artifact written to: ${outputPath}`);
  }
} catch (error) {
  console.error('Compilation error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
