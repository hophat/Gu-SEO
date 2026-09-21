// Tests for the loop runner's Jev wiring (scripts/loop-run.sh).
//
// The runner records a typed second opinion next to each loop decision, and in
// autofix that opinion is a merge gate: only `proceed` merges, `review`/`stop`
// escalates with the branch kept for a human, and an unavailable Jev (no key,
// rejected key, API down) never blocks the gates above it — verifier, tests,
// denylist — but must say why in the row. That policy lives in shell, where no
// type checker reads it and a wrong edit silently merges unreviewed work, so it
// is exercised here rather than described.
//
// Everything runs in a throwaway clone with `opencode`, `npm` and `node` stubbed
// on PATH (the last answers only the Jev call), so no agent starts, no request
// leaves the machine, and no row lands in this repository's own STATE.md or
// loop-run-log.md. The clone gets this working tree's scripts, not the committed
// ones: a regression must fail here before it is committed.
//
//   node --no-warnings scripts/run-loop-tests.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'loop-suite-'));
const CLONE = join(TMP, 'repo');
const BIN = join(TMP, 'bin');
const CALLS = join(TMP, 'jev-calls');       // one line per Jev invocation
const VERIFIER_DIFF = join(TMP, 'verifier-diff');
const FETCH_LOG = join(TMP, 'fetch-log');   // touched only if a request is attempted
const REAL_NODE = process.execPath;

const clean = () => rmSync(TMP, { recursive: true, force: true });
process.on('exit', clean);

let passed = 0;
function ok(label) { passed++; console.log(`✓ ${label}`); }

// ── the clone ────────────────────────────────────────────────────────
// Copies the runner's whole surface from the working tree, so an uncommitted
// edit to loop-run.sh is what gets tested.
mkdirSync(BIN, { recursive: true });
{
  const r = spawnSync('git', ['clone', '--quiet', '--local', ROOT, CLONE], { encoding: 'utf8' });
  assert.equal(r.status, 0, `could not clone the repo: ${r.stderr}`);
  for (const rel of ['scripts', 'skills', 'loop-constraints.md', 'STATE.md', 'loop-run-log.md', 'issue-triage-state.md']) {
    rmSync(join(CLONE, rel), { recursive: true, force: true });
    cpSync(join(ROOT, rel), join(CLONE, rel), { recursive: true });
  }
  for (const [key, value] of [['user.name', 'loop test'], ['user.email', 'loop@test']]) {
    spawnSync('git', ['-C', CLONE, 'config', key, value]);
  }
}

// ── PATH stubs ───────────────────────────────────────────────────────
function shim(name, body) { writeFileSync(join(BIN, name), `#!/usr/bin/env bash\n${body}`, { mode: 0o755 }); }

// The implementer writes to the worktree it is pointed at; the verifier keeps a
// copy of the diff it was handed so the test can see what the gate actually read.
shim('opencode', `agent=""; dir=""; file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) agent="$2"; shift 2;;
    --dir) dir="$2"; shift 2;;
    --file) file="$2"; shift 2;;
    *) shift;;
  esac
done
if [ "$agent" = implementer ]; then
  case "\${IMPL:-work}" in
    commit) cd "$dir" && printf 'probe\\n' >> loop-fix-probe.txt && git -c user.email=loop@test -c user.name=loop add -A && git -c user.email=loop@test -c user.name=loop commit -q -m "implementer commit" ;;
    work) cd "$dir" && printf 'probe\\n' >> loop-fix-probe.txt ;;
    nothing) : ;;
  esac
  echo implemented
else
  if [ -n "$file" ]; then cp "$file" "$VERIFIER_DIFF"; fi
  echo APPROVE
fi
exit 0
`);

// Records every Jev invocation, then answers with the canned reply JEV_FAKE
// names. The real scripts/jev.js only runs when a case asks for it (JEV_REAL=1)
// and always behind the fetch trap below, so no case can spend a request: with
// neither variable set this exits instead of reaching the API.
shim('node', `case " $* " in *jev.js*) ;; *) exec "$REAL_NODE" "$@";; esac
printf '%s' "$*" | tr '\\n' ' ' >> "$JEV_CALLS"; echo >> "$JEV_CALLS"
case "\${JEV_FAKE:-}" in
  proceed) printf '%s\\n' "loop fix: proceed overall=proceed@0.91 correctness=2.00@0.90 evidence=1.00@0.80 in=1234" '{"ok":true}'; exit 0 ;;
  review)  printf '%s\\n' "loop fix: review overall=review@0.55 correctness=1.00@0.40 evidence=0.00@0.98 in=1234" '{"ok":true}'; exit 1 ;;
  stop)    printf '%s\\n' "loop fix: stop overall=stop@0.90 in=1234" '{"ok":true}'; exit 2 ;;
  no-key)  printf '%s\\n' "jev: no API key — set TYPESAFE_API_KEY in .dev.vars" >&2; exit 1 ;;
  bad-key) printf '%s\\n' "error=Cannot authenticate with the server (401)" '{"ok":false,"status":401}'; exit 1 ;;
  triage)  printf '%s\\n' "type=bug@0.67 area=infra@0.72 priority=P1(2.01)@0.99 duplicate=no@0.33" '{"ok":true}'; exit 0 ;;
  "") [ -n "\${JEV_REAL:-}" ] && exec "$REAL_NODE" "$@" ;;
esac
printf '%s\\n' "jev: test suite refuses to call the API without a canned answer" >&2
exit 1
`);
shim('npm', 'exit 0\n');

// A `fetch` that refuses and records the attempt: the only evidence that the
// no-documents case really made no request.
const TRAP = join(TMP, 'fetch-trap.cjs');
writeFileSync(TRAP, `globalThis.fetch = () => {
  try { require('node:fs').appendFileSync(process.env.FETCH_LOG, 'fetch\\n'); } catch {}
  throw new Error('network disabled in tests');
};
`);

// ── driving the runner ───────────────────────────────────────────────
const env = (extra) => ({ ...process.env, PATH: `${BIN}:${process.env.PATH}`, REAL_NODE, JEV_CALLS: CALLS, VERIFIER_DIFF, FETCH_LOG, ...extra });

function run(args, extra = {}) {
  reset();
  const r = spawnSync('bash', [join(CLONE, 'scripts', 'loop-run.sh'), ...args], { cwd: CLONE, encoding: 'utf8', env: env(extra) });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// Same, without blocking the event loop: the loopback stub below answers from
// this process, and spawnSync would deadlock against it.
function runAsync(args, extra = {}) {
  reset();
  return new Promise((resolve) => {
    const child = spawn('bash', [join(CLONE, 'scripts', 'loop-run.sh'), ...args], { cwd: CLONE, env: env(extra) });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('close', (status) => resolve({ status, out }));
  });
}
const calls = () => (existsSync(CALLS) ? readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).length : 0);
const verifierSaw = () => (existsSync(VERIFIER_DIFF) ? readFileSync(VERIFIER_DIFF, 'utf8') : '');
function lastRow() {
  const rows = readFileSync(join(CLONE, 'loop-run-log.md'), 'utf8').split('\n').filter(Boolean);
  return rows[rows.length - 1];
}
const git = (...args) => spawnSync('git', ['-C', CLONE, ...args], { encoding: 'utf8' }).stdout || '';
const worktrees = () => git('worktree', 'list', '--porcelain').split('worktree ').length - 1;
const branches = () => git('branch', '--list', 'loop/fix-*').trim();

// Run before every invocation, not just every case: an escalated run keeps its
// branch and worktree on purpose, and the fix id is only second-accurate, so a
// second run inside the same second would collide with its own branch name.
function reset() {
  for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
    if (line.startsWith('worktree ') && line.slice(9) !== CLONE) git('worktree', 'remove', line.slice(9), '--force');
  }
  for (const b of branches().split('\n').map((s) => s.replace(/^[*+ ]+/, '').trim()).filter(Boolean)) {
    git('branch', '-D', b);
  }
  rmSync(CALLS, { force: true });
  rmSync(VERIFIER_DIFF, { force: true });
}

const before = { state: readFileSync(join(ROOT, 'STATE.md'), 'utf8'), log: readFileSync(join(ROOT, 'loop-run-log.md'), 'utf8') };

console.log('\n--- loop runner · Jev gate ---\n');

// ── autofix ──────────────────────────────────────────────────────────
{
  const r = run(['autofix'], { IMPL: 'work', JEV_FAKE: 'proceed' });
  assert.equal(r.status, 0, `a proceeding fix should merge: ${r.out}`);
  assert.match(verifierSaw(), /loop-fix-probe\.txt/, 'the verifier must be handed the change the implementer left');
  assert.equal(calls(), 1, 'the diff should be judged exactly once');
  assert.match(lastRow(), /- merged -/, `expected a merged row, got: ${lastRow()}`);
  assert.match(lastRow(), /jev: loop fix: proceed overall=proceed@0\.91/, 'the row must carry what Jev answered');
  assert.equal(spawnSync('git', ['-C', CLONE, 'show', 'main:loop-fix-probe.txt']).status, 0, 'the fix must reach main');
  assert.equal(worktrees(), 1, 'the worktree must be removed after merging');
  assert.equal(branches(), '', 'the branch must be deleted after merging');
  ok('a proceeding fix merges, and the branch and worktree go with it');
}

{
  // The blind spot this covers: the implementer commits inside the worktree, so
  // a working-tree diff is empty while the branch really does change files.
  const r = run(['autofix', '--dry-run'], { IMPL: 'commit', JEV_FAKE: 'proceed' });
  assert.equal(r.status, 0, `a committed fix is still mergeable: ${r.out}`);
  assert.match(verifierSaw(), /loop-fix-probe\.txt/, 'a fix the implementer committed itself must still reach the verifier');
  assert.match(lastRow(), /dry-run \(would merge\)/, `expected a dry-run row, got: ${lastRow()}`);
  ok('a fix the implementer committed itself is still what the gates read');
}

{
  const mainBefore = git('rev-parse', 'main');
  const r = run(['autofix'], { IMPL: 'work', JEV_FAKE: 'review' });
  assert.equal(r.status, 1, 'a review must fail the run');
  assert.match(lastRow(), /- escalated -/, `expected an escalated row, got: ${lastRow()}`);
  assert.match(lastRow(), /Jev did not proceed \(jev: .*review/, 'the row must name the answer that stopped it');
  assert.equal(git('rev-parse', 'main'), mainBefore, 'nothing may merge without a proceed');
  assert.notEqual(branches(), '', 'the branch must be kept for the human');
  // `stop` (exit 2) reaches the same gate as `review`, and dry-run is the mode
  // that prints the diff: a cron row names its path instead of logging a diff
  // nobody asked for.
  const stop = run(['autofix', '--dry-run'], { IMPL: 'work', JEV_FAKE: 'stop' });
  assert.equal(stop.status, 1, 'a stop is a failure too');
  assert.match(stop.out, /loop-fix-probe\.txt/, 'dry-run must print the diff the human is deciding on');
  assert.match(lastRow(), /Jev did not proceed/, 'a stop escalates like a review');
  ok('a review or a stop escalates with the branch kept, main untouched, and the diff printed in dry-run');
}

{
  const r = run(['autofix', '--dry-run'], { IMPL: 'nothing', JEV_FAKE: 'proceed' });
  assert.equal(r.status, 0, `a no-op fix has nothing to merge: ${r.out}`);
  assert.equal(calls(), 0, 'a branch that changes no files must not buy a judgement');
  assert.match(lastRow(), /nothing to judge/, `expected the row to say why nothing was asked, got: ${lastRow()}`);
  ok('a branch that changes nothing buys no judgement, and says so');
}

for (const [fake, kind, evidence] of [
  ['no-key', 'missing', /unavailable — jev: no API key/],
  ['bad-key', 'rejected', /unavailable — error=Cannot authenticate/],
]) {
  const r = run(['autofix', '--dry-run'], { IMPL: 'work', JEV_FAKE: fake });
  assert.equal(r.status, 0, `an unavailable Jev must not stop the loop (${fake}): ${r.out}`);
  assert.match(lastRow(), evidence, `the row must say why there is no answer (${fake}): ${lastRow()}`);
  assert.match(lastRow(), /dry-run \(would merge\)/, 'the gates above Jev still decide');
  ok(`a ${kind} key is recorded, not treated as a verdict`);
}

// ── the real client, against a loopback stub ─────────────────────────
// Every case above stubs jev.js, so the runner is only ever tested against
// answers this file invented. Here the real scripts/jev.js runs against a local
// server that replies in the API's shape: one request, the diff as state, the
// rubric as questions, and the reply read back into the `--summary` line the
// runner acts on. That is the seam nothing else closes — change the summary
// format or the token field and this fails, where the canned cases stay green.
{
  const seen = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push({ path: req.url, auth: req.headers.authorization, body });
      // Answer whatever was asked, so a change to the rubric does not have to
      // change this stub with it.
      const answers = Object.fromEntries(Object.entries(body.questions).map(([key, q]) => [key,
        q.type === 'score' ? { type: 'score', score: 2, confidence: 0.9 } : { type: 'choice', choice: 'proceed', confidence: 0.95 }]));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'jev-1.13.0', answers, usage: { input_tokens: 4242, output_tokens: 12 } }));
    });
  });
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  try {
    const r = await runAsync(['autofix'], {
      IMPL: 'work', JEV_REAL: '1', TYPESAFE_API_KEY: 'test-key',
      TYPESAFE_API_URL: `http://127.0.0.1:${server.address().port}/v1/systemone`,
    });
    assert.equal(seen.length, 1, 'the real client should make exactly one request');
    assert.equal(seen[0].auth, 'Bearer test-key', 'the key must travel in the auth header');
    assert.equal(seen[0].path, '/v1/systemone', 'the endpoint path is part of the contract');
    assert.match(JSON.stringify(seen[0].body.state), /loop-fix-probe/, 'the state must be the diff under judgement');
    assert.ok(seen[0].body.questions.overall, 'the questions must carry the gate the runner reads');
    assert.equal(r.status, 0, `a proceeding answer still merges: ${r.out}`);
    assert.match(lastRow(), /proceed overall=proceed@0\.95/, 'the row must carry the answer the real client printed');
    assert.match(lastRow(), /in=4242/, 'the token count the API reported must reach the row');
    ok('the real client against a stub: one request, and its answer reaches the row and the merge');
  } finally {
    server.close();
  }
}

// ── triage ───────────────────────────────────────────────────────────
{
  writeFileSync(join(CLONE, 'issue-triage-state.md'), '## Top 5\n- [P1][bug] videos publish without a mastered mix\n## Next actions\n- keep\n');
  const r = run(['triage'], { JEV_FAKE: 'triage' });
  assert.equal(r.status, 0, `triage should succeed: ${r.out}`);
  assert.equal(calls(), 1, 'the Top 5 should be scored in one call');
  assert.match(lastRow(), /jev: type=bug@0\.67 .* priority=P1\(2\.01\)@0\.99/, `the row must carry each score with its confidence: ${lastRow()}`);
  ok('triage scores the Top 5 and records every answer with its confidence');
}

{
  writeFileSync(join(CLONE, 'issue-triage-state.md'), '## Top 5\n- (empty — populated by the next run)\n## Next actions\n- keep\n');
  const r = run(['triage'], { JEV_FAKE: 'triage' });
  assert.equal(r.status, 0, `triage should succeed: ${r.out}`);
  assert.equal(calls(), 0, "the file's own placeholder must not be scored");
  assert.match(lastRow(), /nothing to score/, `expected the row to say why nothing was asked: ${lastRow()}`);
  ok('an empty Top 5 is not scored, and says so');
}

// ── jev.js itself: no documents, no request ──────────────────────────
{
  // JEV_REAL lets the shim run the real jev.js; the trap above is what makes
  // "no request" provable rather than assumed.
  const bare = { PATH: `${BIN}:${process.env.PATH}`, REAL_NODE, JEV_CALLS: CALLS, FETCH_LOG, TYPESAFE_API_KEY: 'bogus', JEV_REAL: '1' };
  rmSync(FETCH_LOG, { force: true });
  const r = spawnSync(REAL_NODE, ['--require', TRAP, join(CLONE, 'scripts', 'jev.js'), 'evaluate'], {
    cwd: CLONE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...bare },
  });
  assert.equal(r.status, 2, `no documents is a stop: ${r.stderr}`);
  assert.match(r.stderr, /no documents/, 'it must say what was missing');
  assert.equal(existsSync(FETCH_LOG), false, 'no documents must not reach the network');

  // Positive control: with a document the same trap fires, so the check above
  // is evidence that nothing was sent rather than a trap that never works.
  const control = spawnSync(REAL_NODE, ['--require', TRAP, join(CLONE, 'scripts', 'jev.js'), 'evaluate', '--state', 'fix the thing', '--min-confidence', '0.6'], {
    cwd: CLONE, encoding: 'utf8', env: { ...process.env, ...bare },
  });
  assert.equal(control.status, 2, 'a trapped request is a stop too');
  assert.equal(existsSync(FETCH_LOG), true, 'the trap must fire when there is something to judge');
  ok('evaluate with no documents stops without a request (and the trap does fire on one)');
}

// ── this repository was never the test fixture ───────────────────────
{
  assert.equal(readFileSync(join(ROOT, 'STATE.md'), 'utf8'), before.state, 'the suite must not write rows into this repo');
  assert.equal(readFileSync(join(ROOT, 'loop-run-log.md'), 'utf8'), before.log, 'the suite must not append to this log');
  // A loop worktree is named wt-loop-fix-<id>; anything else (a developer's own
  // checkout, the editor's) is not this suite's business.
  const listed = spawnSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }).stdout || '';
  assert.doesNotMatch(listed, /wt-loop-fix-/, 'the suite must not leave a worktree in this repo');
  assert.equal((spawnSync('git', ['-C', ROOT, 'branch', '--list', 'loop/fix-*'], { encoding: 'utf8' }).stdout || '').trim(), '', 'the suite must not leave a branch in this repo');
  ok('the real repository carries no row, worktree or branch from these cases');
}

console.log(`\nALL LOOP TESTS PASSED (${passed} checks)`);
