import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function normalizeApiBaseUrl(raw) {
    let url;
    try { url = new URL(String(raw || '').trim()); }
    catch { throw new Error('FUNNEL_API_BASE_URL에 HTTPS API 주소를 지정하세요.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new Error('FUNNEL_API_BASE_URL은 인증 정보·쿼리·프래그먼트가 없는 HTTPS 주소여야 합니다.');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (!url.pathname.endsWith('/api')) {
        throw new Error('FUNNEL_API_BASE_URL에 전체 /api 경로를 포함하세요. 예: https://HOST/ewh-calendar/api');
    }
    return url.href.replace(/\/$/, '');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const root = fileURLToPath(new URL('../', import.meta.url));
        const envFile = resolve(root, '.env.hosting');
        if (existsSync(envFile)) process.loadEnvFile(envFile);
        const apiBaseUrl = normalizeApiBaseUrl(process.env.FUNNEL_API_BASE_URL);
        console.log(`Firebase Hosting 화면 빌드: API=${apiBaseUrl}`);
        const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
            cwd: root,
            env: { ...process.env, VITE_API_BASE_URL: apiBaseUrl },
            stdio: 'inherit',
        });
        if (result.error) throw result.error;
        process.exitCode = result.status ?? 1;
    } catch (error) {
        console.error(`Hosting 빌드 실패: ${error.message}`);
        process.exitCode = 1;
    }
}
