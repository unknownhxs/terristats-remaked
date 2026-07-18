// https://github.com/viktorexe/terristats-discord-bot
// MongoDB access layer. Wraps the official `mongodb` driver and exposes a
// single shared connection plus a small `initDb()` helper that creates the
// indexes used across every stats command.
const { MongoClient } = require('mongodb');
require('dotenv').config();

/**
 * Build the connection string from the available environment variables.
 * Priority:
 *   1. A ready-to-use MONGO_URI (anything starting with "mongodb").
 *   2. A SRV connection built from MONGO_USERNAME / MONGO_PASSWORD / MONGO_HOST.
 *   3. A plain local connection to MONGO_HOST (defaults to localhost).
 */
function buildMongoUri() {
  const mongoUri = process.env.MONGO_URI;
  if (mongoUri && mongoUri.startsWith('mongodb')) {
    return mongoUri;
  }

  const username = encodeURIComponent(process.env.MONGO_USERNAME || '');
  const password = encodeURIComponent(process.env.MONGO_PASSWORD || '');
  const host = process.env.MONGO_HOST || 'localhost';

  if (username && password) {
    return `mongodb+srv://${username}:${password}@${host}/?retryWrites=true&w=majority`;
  }
  return `mongodb://${host}:27017/`;
}

class Database {
  constructor() {
    this.client = new MongoClient(buildMongoUri(), {
      maxPoolSize: 5,
      minPoolSize: 1,
    });
    // All collections live inside the "terristats" database.
    this.db = this.client.db('terristats');
  }

  /** Shorthand accessor so command files can call `db.collection('clanwins')`. */
  collection(name) {
    return this.db.collection(name);
  }

  /**
   * Open the connection, verify it works and make sure the indexes exist.
   * Index creation is wrapped individually because some may already exist
   * (for example the unique index on `time`) and we do not want a single
   * failure to abort the whole startup.
   */
  async initDb() {
    await this.client.connect();

    // Round-trip write/delete to confirm we really have access.
    await this.collection('test').insertOne({ test: 'connection' });
    await this.collection('test').deleteOne({ test: 'connection' });

    const indexes = [
      { key: { time: 1 }, options: { unique: true } },
      { key: { clan_name: 1 } },
      { key: { timestamp: 1 } },
      { key: { clan_winners: 1 } },
      { key: { map: 1 } },
      { key: { contest: 1 } },
    ];

    for (const idx of indexes) {
      try {
        await this.collection('clanwins').createIndex(idx.key, idx.options || {});
      } catch (err) {
        // Index already exists or conflicts; safe to ignore.
      }
    }

    const collections = await this.db.listCollections().toArray();
    const names = collections.map((c) => c.name);

    console.log(`Database: 'terristats'`);
    console.log(`Collections: ${names.length ? names.join(', ') : 'None'}`);
    console.log(`Database connection confirmed - Access granted to 'terristats'`);
    console.log('Clanwins scraper ready - monitoring territorial.io every 60 seconds');
  }

  async close() {
    await this.client.close();
  }
}

// Export a single shared instance, mirroring the Python `db` singleton.
module.exports = new Database();
