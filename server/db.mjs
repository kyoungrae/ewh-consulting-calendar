export async function ensureIndexes(db) {
    await Promise.all([
        db.collection('users').createIndex({ uid: 1 }, { unique: true }),
        db.collection('users').createIndex({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'string', $gt: '' } } }),
        db.collection('users').createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } }),
        db.collection('schedules').createIndex({ slotKey: 1 }, { unique: true }),
        db.collection('schedules').createIndex({ consultantId: 1, month: 1, date: 1 }),
        db.collection('common_codes').createIndex({ code: 1 }, { unique: true }),
        db.collection('change_logs').createIndex({ timestamp: -1 }),
        db.collection('api_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
}
