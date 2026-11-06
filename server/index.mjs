import { MongoClient } from 'mongodb';
import { readConfig } from './config.mjs';
import { ensureIndexes } from './db.mjs';
import { createApp } from './app.mjs';

const config = readConfig();
const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(config.database);
await ensureIndexes(db);
const server = createApp({ db, client, config }).listen(config.port, '0.0.0.0', () => console.log(`Consulting server listening on port ${config.port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(async () => { await client.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
});
