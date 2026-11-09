import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const execFileAsync = promisify(execFile);
test('failed candidate reports a recognized reason without disclosing container logs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'calendar-deploy-test-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'bin'));
        await writeFile(join(dir, 'scripts', 'jenkins-deploy.sh'), await readFile(new URL('./jenkins-deploy.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), `COMPOSE_PROJECT_NAME=calendar-test\nFIREBASE_PROJECT=calendar-test\nFIREBASE_WEB_API_KEY=public-key\nBACKUP_DIR=${dir}/backups\n`);
        await writeFile(join(dir, 'runtime.env'), 'APP_ORIGIN=https://example.test\n');
        await writeFile(join(dir, 'firebase-key.json'), '{"fake":"key"}');
        await mkdir(join(dir, 'backups'));
        const backup = join(dir, 'backups', 'test.archive.gz');
        const archive = gzipSync('simulated backup');
        await writeFile(backup, archive);
        await writeFile(join(dir, 'backups', 'test.sha256'), `${createHash('sha256').update(archive).digest('hex')}  ${backup}\n`);
        const docker = join(dir, 'bin', 'docker');
        await writeFile(docker, `#!/bin/sh
case "$1" in
  compose)
    case "$*" in
      *' ps -q mongo') echo mongo-id ;;
      *' ps -q app') echo app-id ;;
      *' run --detach '*) echo candidate-id ;;
    esac ;;
  inspect)
    case "$*" in
      *Config.Labels*) echo false ;;
      *State.Status*) echo exited ;;
      *'.Image'*) echo old-image ;;
    esac ;;
  exec) exit 1 ;;
  logs) echo 'Error: Firebase authentication requires FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_BASE64 secret-value-should-not-appear' ;;
  image|rm) exit 0 ;;
esac
`);
        await chmod(docker, 0o755);
        let output = '';
        try {
            await execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'deploy', 'test'], {
                cwd: dir,
                env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, RUNTIME_ENV_FILE: join(dir, 'runtime.env'), FIREBASE_SERVICE_ACCOUNT_FILE: join(dir, 'firebase-key.json') },
            });
            assert.fail('deployment should fail');
        } catch (error) {
            assert.equal(error.code, 1);
            output = `${error.stdout}${error.stderr}`;
        }
        assert.match(output, /Firebase runtime configuration is missing/);
        assert.match(output, /current API was kept/);
        assert.doesNotMatch(output, /secret-value-should-not-appear/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Hosting-only build creates only the Firebase image and needs no runtime credential', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'calendar-hosting-test-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'bin'));
        await writeFile(join(dir, 'scripts', 'jenkins-deploy.sh'), await readFile(new URL('./jenkins-deploy.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), 'COMPOSE_PROJECT_NAME=calendar-test\nFUNNEL_API_BASE_URL=https://example.test/ewh-calendar/api\n');
        const log = join(dir, 'docker-calls');
        const docker = join(dir, 'bin', 'docker');
        await writeFile(docker, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DOCKER_TEST_LOG"\n');
        await chmod(docker, 0o755);
        const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, DOCKER_TEST_LOG: log };
        delete env.RUNTIME_ENV_FILE;
        await execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'build-hosting', 'test'], { cwd: dir, env });
        const calls = (await readFile(log, 'utf8')).trim().split('\n');
        assert.equal(calls.length, 1);
        assert.match(calls[0], /build --target firebase/);
        assert.match(calls[0], /FUNNEL_API_BASE_URL=https:\/\/example\.test\/ewh-calendar\/api/);
        assert.doesNotMatch(calls[0], /--target runtime/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Jenkins requires backup before API and Hosting deployment', async () => {
    const pipeline = await readFile(new URL('../Jenkinsfile', import.meta.url), 'utf8');
    assert.match(pipeline, /jenkins-deploy\.sh verify /);
    assert.match(pipeline, /jenkins-deploy\.sh build /);
    assert.match(pipeline, /ewh-calendar-runtime-env/);
    assert.match(pipeline, /ewh-calendar-firebase-admin/);
    assert.match(pipeline, /ewh-calendar-gateway-hmac/);
    assert.match(pipeline, /gatewayEnabled == 'true'/);
    assert.match(pipeline, /jenkins-deploy\.sh backup /);
    assert.match(pipeline, /jenkins-deploy\.sh deploy /);
    assert.match(pipeline, /jenkins-deploy\.sh firebase /);
    assert.match(pipeline, /jenkins-deploy\.sh smoke /);
    assert.ok(pipeline.indexOf('jenkins-deploy.sh backup ') < pipeline.indexOf('jenkins-deploy.sh deploy '));
    assert.ok(pipeline.indexOf('jenkins-deploy.sh deploy ') < pipeline.indexOf('jenkins-deploy.sh firebase '));
});

test('API deployment refuses to run when a backup is missing or corrupted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'calendar-backup-test-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'backups'));
        await writeFile(join(dir, 'scripts', 'jenkins-deploy.sh'), await readFile(new URL('./jenkins-deploy.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), `COMPOSE_PROJECT_NAME=calendar-test\nFIREBASE_PROJECT=calendar-test\nFIREBASE_WEB_API_KEY=public-key\nBACKUP_DIR=${dir}/backups\n`);
        await writeFile(join(dir, 'runtime.env'), 'test=1\n');
        await writeFile(join(dir, 'firebase-key.json'), '{"fake":"key"}');
        const env = { ...process.env, RUNTIME_ENV_FILE: join(dir, 'runtime.env') };
        const run = () => execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'deploy', 'test'], { cwd: dir, env });
        await assert.rejects(run(), error => error.code === 1 && /verified MongoDB backup is required/.test(error.stderr));
        await writeFile(join(dir, 'backups', 'test.archive.gz'), 'not gzip');
        await writeFile(join(dir, 'backups', 'test.sha256'), 'invalid');
        await assert.rejects(run(), error => error.code === 1 && /backup is corrupt/.test(error.stderr));
        await writeFile(join(dir, 'backups', 'test.archive.gz'), gzipSync('backup'));
        await assert.rejects(run(), error => error.code === 1 && /checksum verification failed/.test(error.stderr));
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('failed test network creation never removes a pre-existing network or container', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'calendar-network-test-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'bin'));
        await writeFile(join(dir, 'scripts', 'jenkins-deploy.sh'), await readFile(new URL('./jenkins-deploy.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), 'COMPOSE_PROJECT_NAME=calendar-test\n');
        const log = join(dir, 'docker-calls');
        const docker = join(dir, 'bin', 'docker');
        await writeFile(docker, `#!/bin/sh
printf '%s\n' "$*" >> "$DOCKER_TEST_LOG"
case "$*" in 'network create '*) exit 1 ;; esac
`);
        await chmod(docker, 0o755);
        const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, DOCKER_TEST_LOG: log };
        await assert.rejects(execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'verify', 'test'], { cwd: dir, env }));
        const calls = await readFile(log, 'utf8');
        assert.match(calls, /network create/);
        assert.doesNotMatch(calls, /network rm/);
        assert.doesNotMatch(calls, /\nrm -f/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('successful API deploy replaces only the app and never deletes MongoDB or its volumes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'calendar-cutover-test-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'backups'));
        await mkdir(join(dir, 'bin'));
        await writeFile(join(dir, 'scripts', 'jenkins-deploy.sh'), await readFile(new URL('./jenkins-deploy.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), `COMPOSE_PROJECT_NAME=calendar-test\nFIREBASE_PROJECT=calendar-test\nFIREBASE_WEB_API_KEY=public-key\nBACKUP_DIR=${dir}/backups\n`);
        await writeFile(join(dir, 'runtime.env'), 'test=1\n');
        await writeFile(join(dir, 'firebase-key.json'), '{"fake":"key"}');
        const backup = join(dir, 'backups', 'test.archive.gz');
        const archive = gzipSync('simulated backup');
        await writeFile(backup, archive);
        await writeFile(join(dir, 'backups', 'test.sha256'), `${createHash('sha256').update(archive).digest('hex')}  ${backup}\n`);
        const log = join(dir, 'docker-calls');
        const docker = join(dir, 'bin', 'docker');
        await writeFile(docker, `#!/bin/sh
printf '%s\n' "$*" >> "$DOCKER_TEST_LOG"
case "$1" in
  compose)
    case "$*" in
      *' ps -q mongo') echo mongo-id ;;
      *' ps -q app') echo app-id ;;
      *' run --detach '*)
        test "$AUTH_PROVIDER" = firebase && test "$FIREBASE_PROJECT_ID" = calendar-test && test -n "$FIREBASE_SERVICE_ACCOUNT_BASE64" || exit 1
        if [ "\${TEST_ENSURE_NO_GATEWAY_SECRET:-}" = 1 ]; then test -z "\${GATEWAY_HMAC_SECRET:-}" || exit 1; fi
        if [ -n "\${TEST_EXPECT_GATEWAY_SECRET:-}" ]; then test "$GATEWAY_HMAC_SECRET" = "$TEST_EXPECT_GATEWAY_SECRET" || exit 1; fi
        echo candidate-id ;;
      *' up -d --no-deps --no-build app'*)
        if [ "\${TEST_ENSURE_NO_GATEWAY_SECRET:-}" = 1 ]; then test -z "\${GATEWAY_HMAC_SECRET:-}" || exit 1; fi
        if [ -n "\${TEST_EXPECT_GATEWAY_SECRET:-}" ]; then test "$GATEWAY_HMAC_SECRET" = "$TEST_EXPECT_GATEWAY_SECRET" || exit 1; fi ;;
    esac ;;
  inspect)
    case "$*" in
      *Config.Labels*) echo false ;;
      *'.Image'*) echo old-image ;;
    esac ;;
esac
`);
        await chmod(docker, 0o755);
        const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, DOCKER_TEST_LOG: log, RUNTIME_ENV_FILE: join(dir, 'runtime.env'), FIREBASE_SERVICE_ACCOUNT_FILE: join(dir, 'firebase-key.json'), GATEWAY_HMAC_SECRET: 'stale-secret-from-shell', TEST_ENSURE_NO_GATEWAY_SECRET: '1' };
        const result = await execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'deploy', 'test'], { cwd: dir, env });
        assert.match(result.stdout, /API healthy/);
        const calls = await readFile(log, 'utf8');
        assert.match(calls, /up -d --no-deps --no-build app/);
        assert.match(calls, /rm -f candidate-id/);
        assert.doesNotMatch(calls, /rm -f mongo-id|volume rm|\bdown\b|--volumes/);
        assert.equal(await readFile(join(dir, 'runtime.env'), 'utf8'), 'test=1\n');

        // Once the gateway is enabled, refuse a cutover until its secret is
        // supplied; on success it must reach candidate and production compose
        // without appearing in command arguments or logs.
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), `COMPOSE_PROJECT_NAME=calendar-test\nGATEWAY_ENABLED=true\nFIREBASE_PROJECT=calendar-test\nFIREBASE_WEB_API_KEY=public-key\nBACKUP_DIR=${dir}/backups\n`);
        delete env.GATEWAY_HMAC_SECRET;
        delete env.TEST_ENSURE_NO_GATEWAY_SECRET;
        await assert.rejects(execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'deploy', 'test'], { cwd: dir, env }), error => error.code === 1 && /Configure the gateway secret/.test(error.stderr));
        env.GATEWAY_HMAC_SECRET = 'short';
        await assert.rejects(execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'deploy', 'test'], { cwd: dir, env }), error => error.code === 1 && /Configure the gateway secret/.test(error.stderr));
        const secret = 'gateway-test-secret-with-at-least-32-characters';
        env.GATEWAY_HMAC_SECRET = secret;
        env.TEST_EXPECT_GATEWAY_SECRET = secret;
        const enabled = await execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'deploy', 'test'], { cwd: dir, env });
        assert.match(enabled.stdout, /API healthy/);
        assert.doesNotMatch(`${enabled.stdout}${enabled.stderr}${await readFile(log, 'utf8')}`, /gateway-test-secret-with-at-least-32-characters/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('backup failure leaves no partial archive and never starts an API cutover', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'calendar-failed-backup-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'bin'));
        await writeFile(join(dir, 'scripts', 'jenkins-deploy.sh'), await readFile(new URL('./jenkins-deploy.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), `COMPOSE_PROJECT_NAME=calendar-test\nBACKUP_DIR=${dir}/backups\n`);
        await writeFile(join(dir, 'runtime.env'), 'test=1\n');
        const log = join(dir, 'docker-calls');
        const docker = join(dir, 'bin', 'docker');
        await writeFile(docker, `#!/bin/sh
printf '%s\n' "$*" >> "$DOCKER_TEST_LOG"
case "$1" in
  compose) echo mongo-id ;;
  inspect) echo false ;;
  exec) printf 'incomplete'; exit 1 ;;
esac
`);
        await chmod(docker, 0o755);
        const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, DOCKER_TEST_LOG: log, RUNTIME_ENV_FILE: join(dir, 'runtime.env') };
        await assert.rejects(execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'backup', 'test'], { cwd: dir, env }), error => error.code === 1 && /MongoDB backup failed/.test(error.stderr));
        const { readdir } = await import('node:fs/promises');
        assert.deepEqual(await readdir(join(dir, 'backups')), []);
        const calls = await readFile(log, 'utf8');
        assert.doesNotMatch(calls, /up -d|volume rm|\bdown\b/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('backup retention removes only older verified pairs after the new backup succeeds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'calendar-retention-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'bin'));
        await mkdir(join(dir, 'backups'));
        await writeFile(join(dir, 'scripts', 'jenkins-deploy.sh'), await readFile(new URL('./jenkins-deploy.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), `COMPOSE_PROJECT_NAME=calendar-test\nBACKUP_DIR=${dir}/backups\n`);
        await writeFile(join(dir, 'runtime.env'), 'test=1\n');
        const archive = gzipSync('simulated backup');
        const fixture = join(dir, 'fixture.gz');
        await writeFile(fixture, archive);
        const name = n => `jenkins-ewh-consulting-calendar-deploy-${n}`;
        const makePair = async n => {
            const file = join(dir, 'backups', `${name(n)}.archive.gz`);
            await writeFile(file, archive);
            await writeFile(join(dir, 'backups', `${name(n)}.sha256`), `${createHash('sha256').update(archive).digest('hex')}  ${file}\n`);
        };
        await makePair(1);
        await makePair(99); // A newer build must never be removed.
        await writeFile(join(dir, 'backups', `${name(2)}.archive.gz`), archive); // Orphan.
        await writeFile(join(dir, 'backups', `${name(3)}.archive.gz`), archive);
        await writeFile(join(dir, 'backups', `${name(3)}.sha256`), 'invalid');
        await symlink(fixture, join(dir, 'backups', `${name(4)}.archive.gz`));
        await writeFile(join(dir, 'backups', 'unrelated.archive.gz'), archive);
        const docker = join(dir, 'bin', 'docker');
        await writeFile(docker, `#!/bin/sh
case "$1" in
  compose) echo mongo-id ;;
  inspect) echo false ;;
  exec) if [ "\${FAIL_DUMP:-}" = yes ]; then exit 1; fi; cat "$DUMP_FIXTURE" ;;
esac
`);
        await chmod(docker, 0o755);
        const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, RUNTIME_ENV_FILE: join(dir, 'runtime.env'), DUMP_FIXTURE: fixture };
        const run = vars => execFileAsync('sh', [join(dir, 'scripts', 'jenkins-deploy.sh'), 'backup', name(10)], { cwd: dir, env: { ...env, ...vars } });
        const before = await readdir(join(dir, 'backups'));
        await assert.rejects(run({ FAIL_DUMP: 'yes' }), /MongoDB backup failed/);
        assert.deepEqual(await readdir(join(dir, 'backups')), before);
        await run({});
        const after = await readdir(join(dir, 'backups'));
        assert.ok(!after.includes(`${name(1)}.archive.gz`));
        assert.ok(!after.includes(`${name(1)}.sha256`));
        for (const file of before.filter(file => !file.startsWith(name(1) + '.'))) assert.ok(after.includes(file), file);
        assert.ok(after.includes(`${name(10)}.archive.gz`));
        assert.ok(after.includes(`${name(10)}.sha256`));
    } finally { await rm(dir, { recursive: true, force: true }); }
});
