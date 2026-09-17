/**
 * `npm run dev:seeded` — the console with the generated decision history.
 *
 * Since 2026-09-17 `npm run dev` starts with the tenant's catalogue and no
 * decision history: `.env.development` sets `METIS_SEED_LEDGER=0`, which is the
 * state every new tenant starts in and the one the product owner chose as the
 * default. The seeded tenant — 10,400 decisions, their deliveries and their
 * outcomes, executed into the in-memory ledger at start (ADR-018 §3) — is what a
 * demo against `docs/METIS_CONSOLE_SPEC.md` Part 6 needs, and this is the one
 * command that gives it.
 *
 * A launcher rather than an inline `METIS_SEED_LEDGER=1 next dev`, because that
 * form does not work in `cmd.exe` and the repository has no `cross-env`.
 *
 * **Why setting it here beats `.env.development`.** `@next/env` applies a value
 * from a `.env` file only when the key is undefined in the environment the
 * process started with; a variable already set wins. Read from its source on
 * 2026-09-17 rather than assumed, and measured the same day: a console started
 * with `METIS_SEED_LEDGER=0` in the environment reported `ledgerSeed: null` over a
 * `.env.development` that said `1`. This launcher relies on the same rule in the
 * other direction.
 *
 * Arguments after `--` go to `next dev`: `npm run dev:seeded -- --port 3001`.
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * The environment `next dev` gets: the caller's, with the whole history seeded.
 *
 * A plain record rather than `NodeJS.ProcessEnv`, which Next augments to require
 * `NODE_ENV` — true of a running process, and not of an environment being built.
 */
export type Env = Record<string, string | undefined>;

export function seededEnv(base: Env = process.env): Env {
  return { ...base, METIS_SEED_LEDGER: '1' };
}

// Only when run, never when imported: the unit test imports `seededEnv`, and a
// test that started a dev server as a side effect of an import would be a
// twelve-second hang with nothing on screen to explain it.
const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invoked) {
  const child = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], {
    // A real process is about to be given it, so it is one: `NODE_ENV` comes
    // along with the rest of the caller's environment.
    env: seededEnv() as NodeJS.ProcessEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
}
