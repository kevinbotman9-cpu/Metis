#!/usr/bin/env node
/**
 * Export a tenant to a directory, or verify a bundle already on disk.
 *
 *   npm run export -- --tenant telco-uk --out ./bundle
 *   npm run export -- --verify ./bundle
 *
 * A command line rather than only an HTTP endpoint, deliberately. §9 asks that
 * a customer can leave "without professional-services intervention", and an
 * export that can only be triggered through a console someone has to be logged
 * into is a weaker version of that promise than one an operator can run
 * against the database directly.
 *
 * Reads the same `METIS_DATABASE_URL` the registry and ledger already use, so
 * there is no second way to configure where the data is.
 */
import { createRegistryStore, ArtifactRegistry } from '@metis/registry';
import { createLedgerStore, DecisionLedger } from '@metis/ledger';
import { exportTenant } from './export';
import { verifyBundle } from './verify';
import { writeBundle, readBundle } from './files';

interface Args {
  tenant?: string;
  out?: string;
  verify?: string;
}

function parse(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    if (argv[i] === '--tenant') args.tenant = next();
    else if (argv[i] === '--out') args.out = next();
    else if (argv[i] === '--verify') args.verify = next();
  }
  return args;
}

const USAGE = `Usage:
  export --tenant <id> --out <dir>   Export a tenant to a directory
  export --verify <dir>              Check a bundle against its manifest`;

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2));

  if (args.verify) {
    const problems = verifyBundle(readBundle(args.verify));
    if (problems.length === 0) {
      process.stdout.write(`${args.verify}: bundle verified, no problems.\n`);
      return 0;
    }
    process.stderr.write(`${args.verify}: ${problems.length} problem(s)\n`);
    for (const p of problems) process.stderr.write(`  [${p.kind}] ${p.message}\n`);
    return 1;
  }

  if (!args.tenant || !args.out) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  const registryHandle = await createRegistryStore();
  const ledgerHandle = await createLedgerStore();

  try {
    const bundle = await exportTenant(
      {
        registry: new ArtifactRegistry(registryHandle.store),
        ledger: new DecisionLedger(ledgerHandle.store),
      },
      // The clock, once, here — not inside the export, which stays a pure
      // function of the stores so that two exports of unchanged data are
      // byte-identical and can be diffed.
      { tenantId: args.tenant, exportedAt: new Date().toISOString() }
    );

    const problems = verifyBundle(bundle);
    if (problems.length > 0) {
      // Refusing to write a bundle we already know is bad: on disk it would
      // look like a successful export until someone tried to use it.
      process.stderr.write('Export failed its own verification, nothing written:\n');
      for (const p of problems) process.stderr.write(`  [${p.kind}] ${p.message}\n`);
      return 1;
    }

    writeBundle(bundle, args.out);

    process.stdout.write(`Exported ${args.tenant} to ${args.out}\n`);
    for (const f of bundle.manifest.files) {
      process.stdout.write(`  ${f.entity}: ${f.count}\n`);
    }
    for (const e of bundle.manifest.excluded) {
      process.stdout.write(`  ${e.entity}: not exported — see manifest.json\n`);
    }
    process.stdout.write(`  bundle ${bundle.manifest.bundleHash.slice(0, 16)}\n`);
    return 0;
  } finally {
    await registryHandle.close();
    await ledgerHandle.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
);
