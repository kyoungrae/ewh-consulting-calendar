import { parseArgs } from 'node:util';
import { MongoClient } from 'mongodb';
import { hashPassword } from '../server/security.mjs';
import { ensureIndexes } from '../server/db.mjs';
import { randomUUID } from 'node:crypto';

const { values } = parseArgs({ options: { 'user-id': { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, 'reset-password': { type: 'boolean', default: false } } });
if (!values['user-id'] || !process.env.ADMIN_PASSWORD) throw new Error('Use --user-id ID [--name NAME --email EMAIL] [--reset-password] and provide ADMIN_PASSWORD via environment.');
const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD);
const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/?replicaSet=rs0');
try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'ewh_consulting');
    await ensureIndexes(db);
    const users = db.collection('users');
    if (values['reset-password']) {
        const result = await users.updateOne({ userId: values['user-id'] }, { $set: { passwordHash, mustResetPassword: false, updatedAt: new Date().toISOString() }, $inc: { authVersion: 1 } });
        if (!result.matchedCount) throw new Error('User not found.');
        console.log('Password updated; existing sessions revoked.');
    } else {
        if (!values.name || !values.email) throw new Error('Creating an administrator requires --name and --email.');
        const uid = randomUUID();
        const now = new Date().toISOString();
        await users.insertOne({ _id: uid, uid, userId: values['user-id'], name: values.name, email: values.email.toLowerCase(), role: 'admin', status: 'approved', passwordHash, authVersion: 0, createdAt: now, updatedAt: now });
        console.log('Administrator created.');
    }
} finally { await client.close(); }
