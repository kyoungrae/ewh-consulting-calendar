import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const requireMigration = createRequire(new URL('../migration/package.json', import.meta.url));
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--out');
const projectIndex = args.indexOf('--project');

if (args.includes('--help') || outputIndex === -1 || !args[outputIndex + 1]) {
    console.log('Usage: GOOGLE_APPLICATION_CREDENTIALS=/absolute/service-account.json node scripts/export-firestore.mjs --project PROJECT_ID --out /absolute/firestore-export.json');
    process.exit(args.includes('--help') ? 0 : 1);
}

function serialize(value) {
    if (value == null || typeof value !== 'object') return value;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(serialize);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
}

try {
    const { initializeApp, applicationDefault, deleteApp } = await import(requireMigration.resolve('firebase-admin/app'));
    const { getFirestore } = await import(requireMigration.resolve('firebase-admin/firestore'));
    const projectId = projectIndex === -1 ? process.env.GOOGLE_CLOUD_PROJECT : args[projectIndex + 1];
    if (!projectId) throw new Error('--project PROJECT_ID를 지정하세요.');
    const app = initializeApp({ credential: applicationDefault(), projectId });
    try {
        const firestore = getFirestore(app);
        const collections = {};
        // Read-only: export both the current arrays and historical individual documents.
        for (const name of ['users', 'schedules_by_month', 'schedules', 'special_schedules_by_year', 'special_schedules', 'common_codes', 'change_logs']) {
            const snapshot = await firestore.collection(name).get();
            collections[name] = snapshot.docs.map(document => ({ id: document.id, data: serialize(document.data()) }));
            console.log(`${name}: ${snapshot.size}`);
        }
        const exportData = { version: 1, projectId, exportedAt: new Date().toISOString(), collections };
        // Exclusive creation and restricted permissions: never replace a previous backup.
        await writeFile(args[outputIndex + 1], JSON.stringify(exportData, null, 2), { flag: 'wx', mode: 0o600 });
        console.log('내보내기 완료. 개인정보와 기존 비밀번호가 포함될 수 있으므로 파일을 안전하게 보관하세요.');
    } finally {
        await deleteApp(app);
    }
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
        console.error('먼저 npm --prefix migration install 을 실행하세요.');
    } else {
        console.error(`내보내기 실패: ${error.message}`);
    }
    process.exitCode = 1;
}
