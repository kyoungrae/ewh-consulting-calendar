#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A TTY prompt replaces the old, silent read -s instructions. Never echo secrets.
async function prompt(label, secret = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Jenkins 인증 정보가 없습니다. 터미널에서 node scripts/jenkins-register-job.mjs --interactive --build를 실행해 로그인하세요.');
  }
  let muted = false;
  const output = new Writable({ write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  } });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  try {
    return await new Promise((resolveAnswer, reject) => {
      input.on('SIGINT', () => reject(new Error('로그인 입력을 취소했습니다.')));
      input.on('close', () => reject(new Error('로그인 입력이 종료되었습니다.')));
      input.question(label, answer => resolveAnswer(answer));
      muted = secret;
    });
  } finally {
    input.close();
    if (secret) process.stdout.write('\n');
  }
}

export class JenkinsClient {
  constructor({ url, user, secret, timeoutMs = 15000 }) {
    this.base = new URL(url.endsWith('/') ? url : `${url}/`);
    if (!['http:', 'https:'].includes(this.base.protocol) || this.base.username ||
        this.base.password || this.base.search || this.base.hash) {
      throw new Error('JENKINS_URL은 인증 정보나 쿼리가 없는 HTTP(S) 주소여야 합니다.');
    }
    if (!user || /[:\r\n]/.test(user) || !secret) throw new Error('Jenkins 로그인 정보를 확인하세요.');
    if (/^(github_pat_|gh[pousr]_)/.test(secret)) {
      throw new Error('GitHub 토큰을 입력했습니다. 여기에는 Jenkins 로그인 비밀번호 또는 Jenkins API 토큰을 입력하세요.');
    }
    this.authorization = `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`;
    this.timeoutMs = timeoutMs;
    this.cookies = new Map();
    this.crumb = {};
  }

  url(path = '') { return new URL(path, this.base).href; }

  async request(path, { method = 'GET', body, headers = {}, allowed = [200] } = {}) {
    const url = new URL(path, this.base);
    if (url.origin !== this.base.origin || !url.pathname.startsWith(this.base.pathname)) {
      throw new Error('다른 서버로 인증 정보를 전달하는 요청을 거부했습니다.');
    }
    let response, text;
    try {
      response = await fetch(url, {
        method, body, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Authorization: this.authorization,
          ...(this.cookies.size ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(method === 'POST' ? this.crumb : {}), ...headers,
        },
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';', 1)[0];
        const index = pair.indexOf('=');
        if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      text = await response.text();
    } catch (error) {
      throw new Error(`Jenkins 연결 실패: ${this.base.origin} (${error.cause?.code || error.name}). 사내망/VPN 연결 및 서버 주소를 확인하세요.`);
    }
    if (!allowed.includes(response.status)) {
      const reason = {
        401: 'Jenkins 아이디/비밀번호 또는 API 토큰이 올바르지 않습니다. GitHub 로그인과 다릅니다.',
        403: 'Jenkins 접근 권한 또는 CSRF 인증을 확인하세요. 작업 갱신에는 Configure/Create 권한이 필요합니다.',
        404: 'Jenkins 작업 또는 API를 찾을 수 없습니다.',
        302: 'Jenkins가 로그인 화면 등으로 이동시켰습니다. URL과 인증 정보를 확인하세요.',
      }[response.status] || 'Jenkins 요청이 실패했습니다.';
      throw new Error(`HTTP ${response.status}: ${reason} (${method} ${url.pathname})`);
    }
    return { status: response.status, headers: response.headers, text };
  }

  async json(path, options) {
    const response = await this.request(path, options);
    try { return JSON.parse(response.text); }
    catch { throw new Error('Jenkins에서 JSON 대신 로그인 페이지 등 잘못된 응답을 반환했습니다.'); }
  }

  async authenticate() {
    const identity = await this.json('whoAmI/api/json');
    if (!identity.authenticated) throw new Error('Jenkins 인증에 실패했습니다. Jenkins 로그인 정보를 확인하세요.');
    // Password clients need BOTH crumb and its session cookie. API tokens are exempt.
    const response = await this.request('crumbIssuer/api/json', { allowed: [200, 404] });
    if (response.status === 200) {
      const { crumbRequestField, crumb } = JSON.parse(response.text);
      if (!crumbRequestField || !crumb) throw new Error('Jenkins CSRF 응답이 올바르지 않습니다.');
      this.crumb = { [crumbRequestField]: crumb };
    }
    return identity.name;
  }
}

// Read the text-only <script> field used by Jenkins config.xml. Do not compare
// serialized XML: XStream converts CDATA/quotes/operators into XML entities.
export function extractPipelineScript(xml) {
  const withoutComments = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g,
    block => block.startsWith('<!--') ? '' : block);
  const scripts = [...withoutComments.matchAll(/<script\s*>((?:<!\[CDATA\[[\s\S]*?\]\]>|[^<])*)<\/script\s*>/g)];
  if (scripts.length !== 1) throw new Error('Pipeline XML에서 단일 script 항목을 찾을 수 없습니다.');
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return scripts[0][1].split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map(part => {
    // Entity-looking text inside CDATA is literal, not XML markup.
    if (part.startsWith('<![CDATA[')) return part.slice(9, -3);
    return part.replace(/&([^;\s]+);/g, (_, entity) => {
      if (Object.hasOwn(entities, entity)) return entities[entity];
      const numeric = /^#(?:x[0-9a-fA-F]+|[0-9]+)$/.test(entity);
      const code = numeric ? (entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))) : NaN;
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        throw new Error('Pipeline XML에 지원하지 않는 문자 참조가 있습니다.');
      }
      return String.fromCodePoint(code);
    });
  }).join('').replace(/\r\n?/g, '\n').trim();
}

export async function registerJob(client, jobName, xml, backup = async () => {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(jobName)) throw new Error('작업 이름은 영문, 숫자, -, _만 사용할 수 있습니다.');
  const expectedScript = extractPipelineScript(xml);
  if (!xml.includes('<flow-definition') || !expectedScript.includes('withCredentials') ||
      !expectedScript.includes("GITHUB_CREDENTIAL_ID = 'consultingManager'")) {
    throw new Error('consultingManager 인증을 포함한 Pipeline XML인지 확인하세요.');
  }
  const jobPath = `job/${encodeURIComponent(jobName)}/`;
  const current = await client.request(`${jobPath}config.xml`, { allowed: [200, 404] });
  if (current.status === 200 && !current.text.includes('<flow-definition')) {
    throw new Error('기존 작업이 Pipeline이 아니므로 자동으로 덮어쓰지 않았습니다.');
  }
  if (current.status === 200) await backup(current.text);
  await client.request(current.status === 200 ? `${jobPath}config.xml` : `createItem?name=${encodeURIComponent(jobName)}`, {
    // Jenkins reads config.xml via ServletRequest.getReader(). The HTTP charset
    // must be explicit; an XML encoding declaration alone cannot prevent Latin-1 decoding.
    method: 'POST', body: xml, headers: { 'Content-Type': 'application/xml; charset=UTF-8' }, allowed: [200, 201],
  });
  const saved = await client.request(`${jobPath}config.xml`);
  const savedScript = extractPipelineScript(saved.text);
  if (savedScript !== expectedScript) {
    let position = 0;
    while (position < expectedScript.length && expectedScript[position] === savedScript[position]) position++;
    const line = expectedScript.slice(0, position).split('\n').length;
    throw new Error(`Jenkins 저장 요청은 완료됐지만 다시 읽은 Pipeline 내용이 요청한 설정과 다릅니다 (${line}행부터 다름). 빌드를 시작하지 않았습니다.`);
  }
  return jobPath;
}

export async function startBuild(client, jobPath) {
  const job = await client.json(`${jobPath}api/json?tree=buildable,property[parameterDefinitions[name]]`);
  if (job.buildable === false) throw new Error('작업이 비활성 상태여서 빌드할 수 없습니다.');
  const parameterized = job.property?.some(p => p.parameterDefinitions?.some(v => v.name === 'FORCE_DEPLOY'));
  // New Pipeline jobs acquire parameter definitions only after the first run.
  const queued = await client.request(`${jobPath}${parameterized ? 'buildWithParameters' : 'build'}`, {
    method: 'POST', ...(parameterized ? { body: new URLSearchParams({ FORCE_DEPLOY: 'true' }) } : {}), allowed: [201],
  });
  const location = queued.headers.get('location');
  const match = location && new URL(location, client.base).pathname.match(/\/queue\/item\/(\d+)\/?$/);
  if (!match) throw new Error('빌드는 요청됐으나 대기열 주소가 없습니다. 중복 요청하지 말고 Jenkins에서 확인하세요.');
  // Jenkins may advertise localhost as its canonical URL. Use the configured host.
  return `queue/item/${match[1]}/api/json`;
}

export async function waitForBuild(client, jobPath, queuePath, { interval = 5000, timeoutMs = 1800000, log = console.log } = {}) {
  const deadline = Date.now() + timeoutMs;
  let buildPath, previous;
  while (Date.now() < deadline) {
    if (!buildPath) {
      const queue = await client.json(queuePath);
      if (queue.cancelled) throw new Error('Jenkins 빌드 대기가 취소됐습니다.');
      if (Number.isInteger(queue.executable?.number)) {
        buildPath = `${jobPath}${queue.executable.number}/`;
        log(`빌드 시작: ${client.url(buildPath)}`);
      } else if (queue.why && previous !== queue.why) {
        previous = queue.why;
        log(`빌드 대기: ${queue.why}`);
      }
    }
    if (buildPath) {
      const build = await client.json(`${buildPath}api/json?tree=building,result,number`);
      if (build.building === false && build.result) {
        if (build.result !== 'SUCCESS') throw new Error(`빌드 ${build.result}: ${client.url(`${buildPath}console`)}`);
        log(`빌드 성공: ${client.url(buildPath)}`);
        return build;
      }
    }
    await delay(interval);
  }
  throw new Error(`빌드 확인 제한 시간 초과. Jenkins 작업은 계속 실행될 수 있습니다: ${client.url(buildPath || jobPath)}`);
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('사용법: node scripts/jenkins-register-job.mjs [--interactive] [--build]\n--interactive: 기존 환경변수 대신 Jenkins 로그인을 직접 입력\n--build: 작업 갱신 후 빌드를 요청하고 성공/실패까지 확인');
    return;
  }
  if (args.some(a => !['--interactive', '--build'].includes(a))) throw new Error('알 수 없는 옵션입니다. --help를 확인하세요.');
  const url = process.env.JENKINS_URL || 'http://192.168.0.47:8081';
  const jobName = process.env.JENKINS_JOB_NAME || 'ewh-consulting-calendar-deploy';
  const xml = await readFile(resolve(projectRoot, process.env.JENKINS_JOB_CONFIG || 'infra/jenkins/ewh-calendar-deploy.xml'), 'utf8');
  console.log(`Jenkins 작업 등록: ${url} / ${jobName}`);
  const interactive = args.includes('--interactive');
  const user = (interactive ? '' : process.env.JENKINS_USER) || await prompt('Jenkins 로그인 아이디 (GitHub 아이디 아님): ');
  const secret = (interactive ? '' : process.env.JENKINS_API_TOKEN) || await prompt('Jenkins 비밀번호 또는 Jenkins API 토큰 (입력은 표시되지 않음, 입력 후 Enter): ', true);
  const client = new JenkinsClient({ url, user: user.trim(), secret });
  console.log('Jenkins 인증 확인 중 (요청당 최대 15초)...');
  await client.authenticate();
  console.log('인증 성공. GitHub 자격 증명 consultingManager를 사용하는 작업을 저장합니다.');
  const jobPath = await registerJob(client, jobName, xml, async previousXml => {
    const backupDir = resolve(projectRoot, '.cache/jenkins');
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    await writeFile(resolve(backupDir, `${jobName}-${Date.now()}.xml`), previousXml, { mode: 0o600, flag: 'wx' });
  });
  console.log(`작업 설정 저장·재확인 완료: ${client.url(jobPath)}`);
  if (args.includes('--build')) {
    const queuePath = await startBuild(client, jobPath);
    console.log('빌드 요청 완료. Checkout main → Verify → API → Hosting 결과를 확인합니다.');
    await waitForBuild(client, jobPath, queuePath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`오류: ${error.message}`);
    process.exitCode = 1;
  });
}
