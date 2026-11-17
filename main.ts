// Token Radar — the make.fun token-radar-01 entry (Node 22, standard library only).
//
// It scores every pre-token protocol in the sealed DefiLlama snapshot with the
// radar-2 model in lib/model.ts, writes the ranked board, the dashboard's data
// and the judge's dossier, and copies the static dashboard and screenshots
// alongside. The snapshot is read-only and frozen; the model, the page and the
// farm plans are the entry's own work, and the gate's shape is kept: the
// snapshot in, the board out, the dossier rebuilt from the output and compared
// byte for byte by the scorer.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_CAP_BYTES = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const DASHBOARD_LIMITS = { max_files: 400, max_bytes: 4_194_304 };

/** A flag's value from the command line, in `--name value` or `--name=value` form. */
function flagValue(flag: string, fallback: string): string {
  const argv = process.argv;
  const at = argv.indexOf(`--${flag}`);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1]!;
  const joined = argv.find((a) => a.startsWith(`--${flag}=`));
  return joined === undefined ? fallback : joined.slice(flag.length + 3);
}

/** The snapshot file for an --input that names a file or its directory. */
function snapshotPath(raw: string): string {
  return raw.endsWith('.json') ? raw : join(raw, 'snapshot.json');
}

/** Report a problem on stderr and stop with the given status. */
function fail(message: string, status: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(status);
}

/** Copy a directory's regular files into `to`, skipping names that start with a dot. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

function main(): void {
  const input = snapshotPath(flagValue('input', '/input'));
  if (!existsSync(input)) {
    fail(`no snapshot at ${input}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  }
  const out = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const problem = boardIssue(board, snapshot);
  if (problem !== null) {
    fail(`the model wrote a board the gate refuses: ${problem}`, 1);
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  copyDir(join(entryDir, 'dashboard'), join(out, 'dashboard'));
  const shots = copyDir(join(entryDir, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) {
    fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`, 1);
  }
  for (const name of shots) {
    if (!SHOT_NAME.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_CAP_BYTES, screenshots: SHOT_LIMITS, dashboard: DASHBOARD_LIMITS }));

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

main();
