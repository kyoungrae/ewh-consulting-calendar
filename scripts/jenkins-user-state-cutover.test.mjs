import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const run = promisify(execFile);
async function withFixture(callback) {
    const dir = await mkdtemp(join(tmpdir(), 'ewh-cutover-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'backups'));
        await mkdir(join(dir, 'bin'));
        await writeFile(join(dir, 'scripts', 'jenkins-user-state-cutover.sh'), await readFile(new URL('./jenkins-user-state-cutover.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), `COMPOSE_PROJECT_NAME=test\nFIREBASE_PROJECT=test\nFIREBASE_WEB_API_KEY=public\nBACKUP_DIR=${dir}/backups\n`);
        await writeFile(join(dir, 'runtime.env'), 'private=1\n');
        await writeFile(join(dir, 'firebase.json'), '{}');
        const data = gzipSync('fixture');
        const backup = join(dir, 'backups', 'test.archive.gz');
        await writeFile(backup, data);
        await writeFile(join(dir, 'backups', 'test.sha256'), `${createHash('sha256').update(data).digest('hex')}  ${backup}\n`);
        const docker = join(dir, 'bin', 'docker');
        await writeFile(docker, `#!/bin/sh
printf '%s | image=%s\n' "$*" "$APP_IMAGE" >> "$TEST_CALLS"
case "$1" in
  compose)
    case "$*" in
      *' ps -q mongo') echo mongo-id ;;
      *' ps -q app') echo app-id ;;
      *' ps --all -q app') echo app-id ;;
      *' --status') if [ -e "$TEST_MARKER" ]; then cat "$TEST_MARKER"; else echo missing; fi ;;
      *' --verify-seedable') [ "$TEST_SEEDABLE" = 1 ] ;;
      *' --verify-no-pending') [ "$TEST_PENDING" = 0 ] ;;
      *' --invalidate') echo invalidated > "$TEST_MARKER" ;;
      *' --apply') if [ "$TEST_FAIL_APPLY" = 1 ]; then exit 1; fi; echo ready > "$TEST_MARKER" ;;
      *' --check') test "$(cat "$TEST_MARKER")" = ready ;;
      *' up -d --no-deps --no-build app')
        case "$APP_IMAGE" in ewh-calendar/app:*) [ "$TEST_FAIL_UP" = 0 ] ;; esac ;;
    esac ;;
  inspect)
    case "$*" in *Config.Labels*) echo false ;; *State.Status*) echo exited ;; *State.ExitCode*) if grep -q 'ps --all -q app' "$TEST_CALLS"; then echo "$TEST_NEW_EXIT_CODE"; else echo "$TEST_EXIT_CODE"; fi ;; *.Image*) echo old-image ;; esac ;;
  image) case "$2" in inspect) echo v1 ;; esac ;;
esac
`);
        await chmod(docker, 0o755);
        const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, FIREBASE_USER_STATES_QUIESCED: '1',
            RUNTIME_ENV_FILE: join(dir, 'runtime.env'), FIREBASE_SERVICE_ACCOUNT_FILE: join(dir, 'firebase.json'),
            TEST_MARKER: join(dir, 'marker'), TEST_CALLS: join(dir, 'calls'), TEST_PENDING: '0', TEST_FAIL_APPLY: '0', TEST_FAIL_UP: '0', TEST_EXIT_CODE: '0', TEST_NEW_EXIT_CODE: '0', TEST_SEEDABLE: '1' };
        const execute = (overrides = {}) => run('sh', [join(dir, 'scripts', 'jenkins-user-state-cutover.sh'), 'test'], { cwd: dir, env: { ...env, ...overrides } });
        await callback({ dir, execute, env });
    } finally { await rm(dir, { recursive: true, force: true }); }
}

test('cutover requires confirmed quiescence and a verified backup before stopping the API', async () => {
    await withFixture(async ({ dir, execute }) => {
        await assert.rejects(execute({ FIREBASE_USER_STATES_QUIESCED: '' }), /quiescence/);
        await writeFile(join(dir, 'backups', 'test.sha256'), 'bad');
        await assert.rejects(execute(), /verified backup/);
        await assert.rejects(readFile(join(dir, 'calls'), 'utf8'), { code: 'ENOENT' });
    });
});

test('cutover audits, seeds and starts the new API only after a clean old API stop', async () => {
    await withFixture(async ({ dir, execute }) => {
        const result = await execute();
        assert.match(result.stdout, /New API is healthy/);
        const calls = await readFile(join(dir, 'calls'), 'utf8');
        assert.ok(calls.indexOf('stop --timeout 60 app') < calls.indexOf('--apply'));
        assert.ok(calls.indexOf('State.ExitCode') < calls.indexOf('--apply'));
        assert.ok(calls.indexOf('--apply') < calls.indexOf('up -d --no-deps --no-build app'));
        assert.equal((await readFile(join(dir, 'marker'), 'utf8')).trim(), 'ready');
    });
});

test('failed new API invalidates local marker before starting the old API', async () => {
    await withFixture(async ({ dir, execute }) => {
        await assert.rejects(execute({ TEST_FAIL_UP: '1' }));
        const calls = await readFile(join(dir, 'calls'), 'utf8');
        assert.ok(calls.indexOf('--verify-no-pending') < calls.indexOf('--invalidate'));
        assert.ok(calls.indexOf('--invalidate') < calls.indexOf('image=ewh-calendar/rollback:test'));
        assert.equal((await readFile(join(dir, 'marker'), 'utf8')).trim(), 'invalidated');
    });
});

test('unclean stop or pending local update blocks unsafe old API rollback', async () => {
    await withFixture(async ({ dir, execute }) => {
        await assert.rejects(execute({ TEST_EXIT_CODE: '137' }), /did not exit cleanly/);
        const calls = await readFile(join(dir, 'calls'), 'utf8');
        assert.doesNotMatch(calls, /--apply|--invalidate|image=ewh-calendar\/rollback:test/);
    });
    await withFixture(async ({ dir, execute }) => {
        await assert.rejects(execute({ TEST_FAIL_UP: '1', TEST_PENDING: '1' }), /rollback is blocked/);
        const calls = await readFile(join(dir, 'calls'), 'utf8');
        assert.doesNotMatch(calls, /--invalidate|image=ewh-calendar\/rollback:test/);
    });
    await withFixture(async ({ dir, execute }) => {
        await assert.rejects(execute({ TEST_FAIL_UP: '1', TEST_NEW_EXIT_CODE: '137' }), /did not stop cleanly/);
        const calls = await readFile(join(dir, 'calls'), 'utf8');
        assert.doesNotMatch(calls, /--invalidate|image=ewh-calendar\/rollback:test/);
    });
    await withFixture(async ({ dir, execute }) => {
        await assert.rejects(execute({ TEST_SEEDABLE: '0' }));
        const calls = await readFile(join(dir, 'calls'), 'utf8');
        assert.doesNotMatch(calls, /stop --timeout 60 app|--apply/);
    });
});
