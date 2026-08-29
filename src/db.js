const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Folderul în care va fi salvată baza de date
const dataDir = path.join(__dirname, '..', 'data');

// Creează automat folderul dacă nu există
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Calea bazei de date
const dbPath = path.join(dataDir, 'diicot.db');

// Deschide / creează baza de date
const db = new Database(dbPath);

// Creează tabelul pentru rapoarte dacă nu există
db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        rank_name TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        participants TEXT,
        evidence_url TEXT,
        status TEXT NOT NULL DEFAULT 'În așteptare',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
`);

module.exports = db;
