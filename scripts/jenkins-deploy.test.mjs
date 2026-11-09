import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
test('failed candidate reports a recognized reason without disclosing container logs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'calendar-deploy-test-'));
    try {
        await mkdir(join(dir, 'scripts'));
        await mkdir(join(dir, 'infra', 'jenkins'), { recursive: true });
        await mkdir(join(dir, 'bin'));
        await writeFile(join(dir, 'scripts', 'jenkins-deploy.sh'), await readFile(new URL('./jenkins-deploy.sh', import.meta.url)));
        await writeFile(join(dir, 'infra', 'jenkins', 'deploy.env'), 'COMPOSE_PROJECT_NAME=calendar-test\n');
        await writeFile(join(dir, 'runtime.env'), 'APP_ORIGIN=https://example.test\n');
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
                env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, RUNTIME_ENV_FILE: join(dir, 'runtime.env') },
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

test('default Jenkins pipeline deploys Hosting without a runtime secret or API deployment', async () => {
    const pipeline = await readFile(new URL('../Jenkinsfile', import.meta.url), 'utf8');
    assert.match(pipeline, /jenkins-deploy\.sh build-hosting/);
    assert.match(pipeline, /jenkins-deploy\.sh firebase /);
    assert.match(pipeline, /jenkins-deploy\.sh smoke-hosting/);
    assert.doesNotMatch(pipeline, /ewh-calendar-runtime-env/);
    assert.doesNotMatch(pipeline, /jenkins-deploy\.sh deploy /);
    assert.doesNotMatch(pipeline, /jenkins-deploy\.sh verify /);
    assert.doesNotMatch(pipeline, /jenkins-deploy\.sh firebase-check /);
});
