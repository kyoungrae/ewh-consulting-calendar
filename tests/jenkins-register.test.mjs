import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JenkinsClient, extractPipelineScript, registerJob } from '../scripts/jenkins-register-job.mjs';

const xml = await readFile(new URL('../infra/jenkins/ewh-calendar-deploy.xml', import.meta.url), 'utf8');

test('Jenkins registration saves and verifies the loader without starting a build', async () => {
    const requests = [];
    let stored;
    const client = {
        async request(path, options = {}) {
            requests.push({ path, ...options });
            if (options.method === 'POST') { stored = options.body; return { status: 200 }; }
            return stored ? { status: 200, text: stored } : { status: 404 };
        }
    };
    assert.equal(await registerJob(client, 'ewh-consulting-calendar-deploy', xml), 'job/ewh-consulting-calendar-deploy/');
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    assert.match(requests.find(request => request.method === 'POST').path, /^createItem\?/);
    assert.equal(requests.some(request => /\/build(?:WithParameters)?$/.test(request.path)), false);
    assert.match(extractPipelineScript(stored), /--branch main https:\/\/github\.com\/kyoungrae\/ewh-consulting-calendar\.git/);
});

test('Jenkins registration backs up old Pipeline settings and rejects a mismatched saved loader', async () => {
    const old = xml.replace('load \'Jenkinsfile\'', 'load \'old-Jenkinsfile\'');
    const events = [];
    let changed = false;
    const client = {
        async request(_path, options = {}) {
            if (options.method === 'POST') { events.push('write'); changed = true; return { status: 200 }; }
            return { status: 200, text: changed ? old : xml };
        }
    };
    await assert.rejects(registerJob(client, 'ewh-consulting-calendar-deploy', xml, async previous => {
        assert.equal(previous, xml);
        events.push('backup');
    }), /Pipeline 내용이 요청한 설정과 다릅니다/);
    assert.deepEqual(events, ['backup', 'write']);
});

test('Pipeline script parsing preserves CDATA operators and decodes XML text safely', () => {
    assert.equal(extractPipelineScript('<root><script><![CDATA[a < b && c > d]]></script></root>'), 'a < b && c > d');
    assert.equal(extractPipelineScript('<root><script>a &lt; b &amp;&amp; c &gt; d</script></root>'), 'a < b && c > d');
    assert.throws(() => extractPipelineScript('<root><script>&unknown;</script></root>'), /지원하지 않는 문자 참조/);
});

test('Jenkins credentials cannot be sent to another origin or confused with a GitHub token', async () => {
    const client = new JenkinsClient({ url: 'http://127.0.0.1:8081/', user: 'jenkins', secret: 'test-only-token' });
    await assert.rejects(client.request('https://other.example/config.xml'), /다른 서버/);
    assert.throws(() => new JenkinsClient({ url: 'http://127.0.0.1:8081/', user: 'jenkins', secret: 'ghp_test-only' }), /GitHub 토큰/);
});
