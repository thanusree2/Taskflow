const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'taskflow.db');
let _db = null;

function save() {
  if (_db) fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

class Stmt {
  constructor(sql) { this.sql = sql; }
  _p(args) {
    if (!args.length) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }
  run(...args) {
    _db.run(this.sql, this._p(args));
    save();
    const r = _db.exec('SELECT last_insert_rowid()');
    return { lastInsertRowid: r[0]?.values[0][0] ?? null, changes: _db.getRowsModified() };
  }
  get(...args) {
    const s = _db.prepare(this.sql);
    try { s.bind(this._p(args)); return s.step() ? s.getAsObject() : undefined; }
    finally { s.free(); }
  }
  all(...args) {
    const rows = [], s = _db.prepare(this.sql);
    try { s.bind(this._p(args)); while (s.step()) rows.push(s.getAsObject()); }
    finally { s.free(); }
    return rows;
  }
}

const db = {
  prepare: (sql) => new Stmt(sql),
  exec:    (sql) => _db.exec(sql),
  pragma:  (str) => _db.run(`PRAGMA ${str}`),
};

async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  _db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();
  _db.run('PRAGMA foreign_keys = ON');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      owner_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      project_id INTEGER NOT NULL,
      assigned_to INTEGER,
      created_by INTEGER NOT NULL,
      status   TEXT NOT NULL DEFAULT 'todo'   CHECK(status   IN ('todo','in_progress','done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      due_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to) REFERENCES users(id)    ON DELETE SET NULL,
      FOREIGN KEY (created_by)  REFERENCES users(id)    ON DELETE CASCADE
    );
  `);
  save();
  console.log('Database initialised');
}

module.exports = { db, initDB };
