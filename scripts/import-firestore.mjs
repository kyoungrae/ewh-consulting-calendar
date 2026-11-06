import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { hashPassword } from '../server/security.mjs';
import { ensureIndexes } from '../server/db.mjs';
import { prepareMigration } from './migration-data.mjs';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
if (args.includes('--help') || fileIndex === -1 || !args[fileIndex + 1]) {
    console.log('Usage: node --env-file=.env scripts/import-firestore.mjs --file /absolute/firestore-export.json [--current-layout] [--apply]');
    console.log('Default: dry run. --apply inserts new documents only; existing IDs are never overwritten.');
    console.log('--current-layout: use active monthly schedules, archive legacy rows, and archive superseded duplicates using the current calendar selection rule.');
    process.exit(args.includes('--help') ? 0 : 1);
}

let client;
try {
    const prepared = prepareMigration(JSON.parse(await readFile(args[fileIndex + 1], 'utf8')), { currentLayout: args.includes('--current-layout') });
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 환경 변수가 필요합니다.');
    client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'ewh_consulting');
    const counts = {};

    // Audit every collection before issuing a single write. Includes collisions
    // with other IDs already in the target DB, not only duplicates in the export.
    async function audit(session) {
        for (const [name, documents] of Object.entries(prepared.collections)) {
            let existing = 0;
            const collection = db.collection(name);
            const uniqueFields = name === 'users' ? ['email', 'userId', 'uid'] : name === 'schedules' ? ['slotKey'] : name === 'common_codes' ? ['code'] : [];
            for (const document of documents) {
                if (await collection.findOne({ _id: document._id }, { session, projection: { _id: 1 } })) {
                    existing += 1;
                    continue;
                }
                const uniqueQueries = uniqueFields.filter(field => document[field]).map(field => ({ [field]: document[field] }));
                if (uniqueQueries.length && await collection.findOne({ $or: uniqueQueries }, { session, projection: { _id: 1 } })) {
                    throw new Error(`${name}: 원본과 대상 DB의 고유 값이 서로 다른 식별자에 연결되어 있습니다. 가져오기를 중단했습니다.`);
                }
            }
            counts[name] = { total: documents.length, existing, insert: documents.length - existing };
        }
    }
    await audit();
    console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', collections: counts, report: prepared.report }, null, 2));

    if (args.includes('--apply')) {
        for (const document of prepared.collections.users) {
            const password = document._migrationPassword;
            delete document._migrationPassword;
            document.passwordHash = password ? await hashPassword(password, { minimumLength: 1 }) : null;
        }
        await ensureIndexes(db);
        const session = client.startSession();
        try {
            await session.withTransaction(async () => {
                await audit(session);
                for (const [name, documents] of Object.entries(prepared.collections)) {
                    if (!documents.length) continue;
                    await db.collection(name).bulkWrite(documents.map(document => ({
                        updateOne: { filter: { _id: document._id }, update: { $setOnInsert: document }, upsert: true },
                    })), { session });
                }
            });
        } finally {
            await session.endSession();
        }
        console.log('가져오기 완료. 기존 식별자의 문서는 유지했습니다. 비밀번호가 없는 사용자는 관리자 재설정 후 로그인할 수 있습니다.');
    } else {
        console.log('검사만 완료했습니다. 실제 가져오기는 동일 명령에 --apply 를 추가하세요.');
    }
} catch (error) {
    console.error(`가져오기 실패: ${error.code === 11000 ? '대상 DB의 고유 값 충돌입니다. 원본과 기존 문서를 확인하세요.' : error.message}`);
    process.exitCode = 1;
} finally {
    await client?.close();
}
