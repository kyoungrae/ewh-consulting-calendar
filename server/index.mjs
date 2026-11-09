import { MongoClient } from 'mongodb';
import { readConfig } from './config.mjs';
import { ensureIndexes } from './db.mjs';
import { createApp } from './app.mjs';
import { createFirebaseAuth } from './firebase-auth.mjs';
import { createFirebaseDirectory } from './firebase-directory.mjs';

const config = readConfig();
const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(config.database);
await ensureIndexes(db);
if (config.authProvider === 'firebase') {
    // Refuse to start against an empty or partially initialized local directory.
    // The deployment must complete the controlled cutover before this API can
    // replace the existing Firebase-backed service.
    const marker = await db.collection('local_state_metadata').findOne({ _id: 'firebase-user-states-v1', status: 'ready' });
    if (!marker) throw new Error('Firebase user state initialization is required before startup.');
}
const firebaseAuth = config.authProvider === 'firebase' ? createFirebaseAuth(config.firebase) : undefined;
const firebaseDirectory = firebaseAuth ? createFirebaseDirectory(firebaseAuth.adminAuth) : undefined;
const server = createApp({ db, client, config, firebaseAuth, firebaseDirectory }).listen(config.port, '0.0.0.0', () => console.log(`Consulting server listening on port ${config.port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(async () => { await client.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
});
