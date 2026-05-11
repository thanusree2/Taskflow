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
  prepare: (sql) => new St
