// In-memory fake of `mysql2/promise` (Requirement 18.4).
//
// Makes no network connection and imports no network module. It implements the
// SQL subset the covered routes and transactions use:
//   CREATE TABLE [IF NOT EXISTS], ALTER TABLE ADD/MODIFY COLUMN, DROP/TRUNCATE,
//   SELECT (single table; WHERE, ORDER BY, LIMIT/OFFSET, COUNT/MAX/MIN/SUM, COALESCE),
//   INSERT [IGNORE] ... VALUES ... [ON DUPLICATE KEY UPDATE], UPDATE, DELETE,
//   START TRANSACTION / COMMIT / ROLLBACK, and pool.getConnection() transactions.
// Anything else (JOINs, sub-selects, GROUP BY) throws ER_NOT_SUPPORTED_YET so the gap
// is loud. Register a custom result with `fake.onQuery(matcher, handler)`.
//
// Usage:
//   import { createFakeMysql } from './helpers/fakeMysql.js';
//   const fake = createFakeMysql();
//   vi.mock('mysql2/promise', () => ({ default: fake.mysql, ...fake.mysql }));
//   fake.seed('portal_users', [{ id: 'u1', username: 'a' }]);
//   fake.rows('portal_users');  fake.queries;  fake.reset();
//   fake.failNext(/UPDATE `vps_servers`/, Object.assign(new Error('boom'), { code: 'ER_LOCK_DEADLOCK' }));
//   fake.setUnavailable(true);   // every call rejects with ECONNREFUSED (fatal)
//
// Semantics worth knowing: string `=`/LIKE/IN are case-insensitive (MySQL's default
// collation); UPDATE `affectedRows` counts matched rows (mysql2's default
// found-rows flag); transactions snapshot all tables at begin and restore on rollback
// (no isolation between concurrent connections).

/* ---------------------------------- errors --------------------------------- */

function sqlError(code, message, errno) {
  const e = new Error(message);
  e.code = code;
  e.errno = errno;
  e.sqlState = '42000';
  return e;
}
const notSupported = (what) => sqlError('ER_NOT_SUPPORTED_YET', `fakeMysql: unsupported SQL (${what})`, 1235);

/* -------------------------------- tokenizer -------------------------------- */

function tokenize(sql) {
  const toks = [];
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && sql[i + 1] === '-' && (i + 2 >= n || /\s/.test(sql[i + 2]))) {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '#') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    const start = i;
    if (c === "'" || c === '"') {
      let v = '';
      i++;
      while (i < n) {
        const d = sql[i];
        if (d === '\\' && i + 1 < n) {
          const e = sql[i + 1];
          v += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === '0' ? '\0' : e;
          i += 2;
        } else if (d === c && sql[i + 1] === c) { v += c; i += 2; }
        else if (d === c) { i++; break; }
        else { v += d; i++; }
      }
      toks.push({ t: 'str', v, pos: start, end: i });
      continue;
    }
    if (c === '`') {
      let v = '';
      i++;
      while (i < n && sql[i] !== '`') v += sql[i++];
      i++;
      // allow `a`.`b` and `a`.*
      let full = v;
      while (sql[i] === '.' && (sql[i + 1] === '`' || sql[i + 1] === '*' || /[A-Za-z_]/.test(sql[i + 1] || ''))) {
        i++;
        if (sql[i] === '*') { full += '.*'; i++; break; }
        let part = '';
        if (sql[i] === '`') { i++; while (i < n && sql[i] !== '`') part += sql[i++]; i++; }
        else while (i < n && /[A-Za-z0-9_$]/.test(sql[i])) part += sql[i++];
        full += '.' + part;
      }
      toks.push({ t: 'id', v: full, quoted: true, pos: start, end: i });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] || ''))) {
      while (i < n && /[0-9.]/.test(sql[i])) i++;
      toks.push({ t: 'num', v: Number(sql.slice(start, i)), pos: start, end: i });
      continue;
    }
    if (/[A-Za-z_@]/.test(c)) {
      while (i < n && /[A-Za-z0-9_$@]/.test(sql[i])) i++;
      let v = sql.slice(start, i);
      while (sql[i] === '.' && (/[A-Za-z_`*]/.test(sql[i + 1] || ''))) {
        i++;
        if (sql[i] === '*') { v += '.*'; i++; break; }
        let part = '';
        if (sql[i] === '`') { i++; while (i < n && sql[i] !== '`') part += sql[i++]; i++; }
        else while (i < n && /[A-Za-z0-9_$]/.test(sql[i])) part += sql[i++];
        v += '.' + part;
      }
      toks.push({ t: 'id', v, pos: start, end: i });
      continue;
    }
    const two = sql.slice(i, i + 2);
    if (['<>', '!=', '<=', '>=', '<=>', '||', '&&'].includes(two)) {
      toks.push({ t: 'op', v: two, pos: start, end: i + 2 });
      i += 2;
      continue;
    }
    i++;
    toks.push({ t: 'op', v: c, pos: start, end: i });
  }
  return toks;
}

/* ---------------------------------- values --------------------------------- */

const isNil = (v) => v === null || v === undefined;

function toComparable(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

// SQL three-valued compare. Returns null when either side is NULL.
function compare(a, b) {
  if (isNil(a) || isNil(b)) return null;
  a = toComparable(a);
  b = toComparable(b);
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = String(a).toLowerCase().replace(/ +$/, '');
  const y = String(b).toLowerCase().replace(/ +$/, '');
  return x < y ? -1 : x > y ? 1 : 0;
}

function likeToRegex(pattern) {
  let re = '^';
  const p = String(pattern);
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '\\' && i + 1 < p.length) { re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    else if (ch === '%') re += '[\\s\\S]*';
    else if (ch === '_') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(re + '$', 'i');
}

const truthy = (v) => (isNil(v) ? null : typeof v === 'string' ? Number(v) !== 0 : Boolean(toComparable(v)));

function escapeValue(v) {
  if (isNil(v)) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Array.isArray(v)) return v.map(escapeValue).join(', ');
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return "'" + s.replace(/[\0\n\r\b\t\\'"\x1a]/g, (ch) => {
    switch (ch) {
      case '\0': return '\\0';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\b': return '\\b';
      case '\t': return '\\t';
      case '\x1a': return '\\Z';
      default: return '\\' + ch;
    }
  }) + "'";
}

/* ----------------------------------- parser -------------------------------- */

const KEYWORDS_END_FROM = new Set(['WHERE', 'ORDER', 'GROUP', 'LIMIT', 'HAVING', 'FOR', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'CROSS', 'UNION', 'SET', 'ON', 'LOCK']);

class Parser {
  constructor(sql, params) {
    this.sql = sql;
    this.toks = tokenize(sql);
    this.i = 0;
    this.params = params || [];
    this.pi = 0;
  }
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  eof() { return this.i >= this.toks.length; }
  isKw(w, o = 0) {
    const t = this.peek(o);
    return !!t && t.t === 'id' && !t.quoted && t.v.toUpperCase() === w;
  }
  isOp(v, o = 0) {
    const t = this.peek(o);
    return !!t && t.t === 'op' && t.v === v;
  }
  acceptKw(w) { if (this.isKw(w)) { this.i++; return true; } return false; }
  acceptOp(v) { if (this.isOp(v)) { this.i++; return true; } return false; }
  expectKw(w) { if (!this.acceptKw(w)) throw this.syntax(`expected ${w}`); }
  expectOp(v) { if (!this.acceptOp(v)) throw this.syntax(`expected ${v}`); }
  syntax(msg) {
    const t = this.peek();
    return sqlError('ER_PARSE_ERROR', `fakeMysql: parse error (${msg}) near '${t ? this.sql.slice(t.pos, t.pos + 30) : '<end>'}'`, 1064);
  }
  ident() {
    const t = this.next();
    if (!t || t.t !== 'id') throw this.syntax('expected identifier');
    return t.v;
  }
  nextParam() {
    if (this.pi >= this.params.length) {
      throw sqlError('ER_WRONG_VALUE_COUNT', 'fakeMysql: fewer parameters than placeholders', 1136);
    }
    return this.params[this.pi++];
  }

  // ---- expressions: each returns (row, ctx) => value
  parseExpr() { return this.parseOr(); }
  parseOr() {
    let l = this.parseAnd();
    while (this.isKw('OR') || this.isOp('||')) {
      this.next();
      const a = l; const b = this.parseAnd();
      l = (r, c) => {
        const x = truthy(a(r, c)); const y = truthy(b(r, c));
        if (x === true || y === true) return 1;
        return x === null || y === null ? null : 0;
      };
    }
    return l;
  }
  parseAnd() {
    let l = this.parseNot();
    while (this.isKw('AND') || this.isOp('&&')) {
      this.next();
      const a = l; const b = this.parseNot();
      l = (r, c) => {
        const x = truthy(a(r, c)); const y = truthy(b(r, c));
        if (x === false || y === false) return 0;
        return x === null || y === null ? null : 1;
      };
    }
    return l;
  }
  parseNot() {
    if (this.isKw('NOT') || this.isOp('!')) {
      this.next();
      const a = this.parseNot();
      return (r, c) => { const x = truthy(a(r, c)); return x === null ? null : x ? 0 : 1; };
    }
    return this.parseCmp();
  }
  parseCmp() {
    const l = this.parseAdd();
    // IS [NOT] NULL / TRUE / FALSE
    if (this.isKw('IS')) {
      this.next();
      const neg = this.acceptKw('NOT');
      if (this.acceptKw('NULL')) return (r, c) => (isNil(l(r, c)) !== neg ? 1 : 0);
      if (this.acceptKw('TRUE')) return (r, c) => ((truthy(l(r, c)) === true) !== neg ? 1 : 0);
      if (this.acceptKw('FALSE')) return (r, c) => ((truthy(l(r, c)) === false) !== neg ? 1 : 0);
      throw this.syntax('expected NULL after IS');
    }
    let neg = false;
    if (this.isKw('NOT') && (this.isKw('IN', 1) || this.isKw('LIKE', 1) || this.isKw('BETWEEN', 1))) { this.next(); neg = true; }
    if (this.acceptKw('IN')) {
      this.expectOp('(');
      if (this.isKw('SELECT')) throw notSupported('sub-select');
      const items = [];
      do { items.push(this.parseAdd()); } while (this.acceptOp(','));
      this.expectOp(')');
      return (r, c) => {
        const v = l(r, c);
        if (isNil(v)) return null;
        const list = items.flatMap((f) => { const x = f(r, c); return Array.isArray(x) ? x : [x]; });
        const hit = list.some((x) => compare(v, x) === 0);
        if (hit) return neg ? 0 : 1;
        return list.some(isNil) ? null : neg ? 1 : 0;
      };
    }
    if (this.acceptKw('LIKE')) {
      const p = this.parseAdd();
      return (r, c) => {
        const v = l(r, c); const pat = p(r, c);
        if (isNil(v) || isNil(pat)) return null;
        const m = likeToRegex(pat).test(String(v));
        return m !== neg ? 1 : 0;
      };
    }
    if (this.acceptKw('BETWEEN')) {
      const lo = this.parseAdd(); this.expectKw('AND'); const hi = this.parseAdd();
      return (r, c) => {
        const v = l(r, c); const a = compare(v, lo(r, c)); const b = compare(v, hi(r, c));
        if (a === null || b === null) return null;
        return (a >= 0 && b <= 0) !== neg ? 1 : 0;
      };
    }
    const t = this.peek();
    if (t && t.t === 'op' && ['=', '<>', '!=', '<', '>', '<=', '>=', '<=>'].includes(t.v)) {
      this.next();
      const op = t.v;
      const rhs = this.parseAdd();
      return (r, c) => {
        const a = l(r, c); const b = rhs(r, c);
        if (op === '<=>') return isNil(a) && isNil(b) ? 1 : isNil(a) || isNil(b) ? 0 : compare(a, b) === 0 ? 1 : 0;
        const k = compare(a, b);
        if (k === null) return null;
        switch (op) {
          case '=': return k === 0 ? 1 : 0;
          case '<>': case '!=': return k !== 0 ? 1 : 0;
          case '<': return k < 0 ? 1 : 0;
          case '>': return k > 0 ? 1 : 0;
          case '<=': return k <= 0 ? 1 : 0;
          default: return k >= 0 ? 1 : 0;
        }
      };
    }
    return l;
  }
  parseAdd() {
    let l = this.parsePrimary();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().v;
      const a = l; const b = this.parsePrimary();
      l = (r, c) => {
        const x = a(r, c); const y = b(r, c);
        if (isNil(x) || isNil(y)) return null;
        return op === '+' ? Number(x) + Number(y) : Number(x) - Number(y);
      };
    }
    return l;
  }
  parsePrimary() {
    const t = this.next();
    if (!t) throw this.syntax('unexpected end');
    if (t.t === 'op') {
      if (t.v === '(') {
        if (this.isKw('SELECT')) throw notSupported('sub-select');
        const e = this.parseExpr();
        this.expectOp(')');
        return e;
      }
      if (t.v === '?') { const v = this.nextParam(); return () => v; }
      if (t.v === '-') { const e = this.parsePrimary(); return (r, c) => { const x = e(r, c); return isNil(x) ? null : -Number(x); }; }
      throw this.syntax(`unexpected '${t.v}'`);
    }
    if (t.t === 'num') return () => t.v;
    if (t.t === 'str') return () => t.v;
    // identifier / keyword / function
    const up = t.v.toUpperCase();
    if (!t.quoted) {
      if (up === 'NULL') return () => null;
      if (up === 'TRUE') return () => 1;
      if (up === 'FALSE') return () => 0;
      if (up === 'CURRENT_TIMESTAMP' && !this.isOp('(')) return (r, c) => c.now;
      if (up === 'EXISTS') throw notSupported('EXISTS');
      if (this.isOp('(')) {
        this.next();
        return this.parseFunction(up);
      }
    }
    const col = t.v.includes('.') ? t.v.slice(t.v.lastIndexOf('.') + 1) : t.v;
    return (r) => {
      if (r && t.v.includes('.') && t.v in r) return r[t.v];
      if (!r || !(col in r)) throw sqlError('ER_BAD_FIELD_ERROR', `Unknown column '${t.v}' in 'where clause'`, 1054);
      return r[col];
    };
  }
  parseFunction(name) {
    if (name === 'VALUES') {
      const col = this.ident();
      this.expectOp(')');
      const key = col.includes('.') ? col.slice(col.lastIndexOf('.') + 1) : col;
      return (r, c) => (c.insertRow ? c.insertRow[key] : null);
    }
    const args = [];
    if (!this.isOp(')')) {
      if (this.isOp('*')) { this.next(); args.push(() => 1); }
      else do { args.push(this.parseExpr()); } while (this.acceptOp(','));
    }
    this.expectOp(')');
    const ev = (r, c) => args.map((a) => a(r, c));
    switch (name) {
      case 'LOWER': case 'LCASE': return (r, c) => { const [x] = ev(r, c); return isNil(x) ? null : String(x).toLowerCase(); };
      case 'UPPER': case 'UCASE': return (r, c) => { const [x] = ev(r, c); return isNil(x) ? null : String(x).toUpperCase(); };
      case 'TRIM': return (r, c) => { const [x] = ev(r, c); return isNil(x) ? null : String(x).trim(); };
      case 'LENGTH': case 'CHAR_LENGTH': return (r, c) => { const [x] = ev(r, c); return isNil(x) ? null : String(x).length; };
      case 'NOW': case 'CURRENT_TIMESTAMP': case 'UTC_TIMESTAMP': return (r, c) => c.now;
      case 'DATABASE': return () => 'fake_db';
      case 'COALESCE': case 'IFNULL': return (r, c) => { for (const v of ev(r, c)) if (!isNil(v)) return v; return null; };
      case 'CONCAT': return (r, c) => { const v = ev(r, c); return v.some(isNil) ? null : v.join(''); };
      case 'IF': return (r, c) => { const [a, b, d] = ev(r, c); return truthy(a) ? b : d; };
      case 'COUNT': case 'MAX': case 'MIN': case 'SUM': case 'AVG':
        throw notSupported(`aggregate ${name} outside the select list`);
      default:
        throw notSupported(`function ${name}`);
    }
  }
}

/* ----------------------------------- tables -------------------------------- */

function cloneRow(r) { return { ...r }; }

class Table {
  constructor(name) {
    this.name = name;
    this.columns = new Map(); // name -> { def, notNull, auto, onUpdateNow, len }
    this.indexes = []; // arrays of column names that must be unique
    this.rows = [];
    this.autoInc = 0;
  }
  addColumn(name, meta = {}) {
    this.columns.set(name, { def: null, notNull: false, auto: false, onUpdateNow: false, len: null, ...meta });
  }
  colName(name) {
    if (this.columns.has(name)) return name;
    for (const k of this.columns.keys()) if (k.toLowerCase() === String(name).toLowerCase()) return k;
    return null;
  }
  defaultFor(meta, now) {
    return meta.def === '__NOW__' ? now : meta.def;
  }
  blankRow(now) {
    const row = {};
    for (const [k, m] of this.columns) row[k] = this.defaultFor(m, now);
    return row;
  }
  checkUnique(row, ignore) {
    for (const idx of this.indexes) {
      if (idx.some((c) => isNil(row[c]))) continue;
      const dup = this.rows.find((o) => o !== ignore && idx.every((c) => compare(o[c], row[c]) === 0));
      if (dup) return { idx, dup };
    }
    return null;
  }
  dupError(idx, row) {
    const v = idx.map((c) => row[c]).join('-');
    return sqlError('ER_DUP_ENTRY', `Duplicate entry '${v}' for key '${this.name}.${idx.join('_')}'`, 1062);
  }
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0; let cur = ''; let q = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q) { cur += ch; if (ch === q && body[i - 1] !== '\\') q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseColumnDef(text) {
  const m = text.trim().match(/^`?([A-Za-z0-9_$]+)`?\s+([A-Za-z]+)(?:\s*\(\s*(\d+)[^)]*\))?([\s\S]*)$/);
  if (!m) return null;
  const [, name, , len, rest] = m;
  const meta = { len: len ? Number(len) : null };
  meta.notNull = /\bNOT\s+NULL\b/i.test(rest);
  meta.auto = /\bAUTO_INCREMENT\b/i.test(rest);
  meta.onUpdateNow = /\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i.test(rest);
  const d = rest.match(/\bDEFAULT\s+(?:'((?:[^'\\]|\\.|'')*)'|"([^"]*)"|(CURRENT_TIMESTAMP(?:\(\))?|NOW\(\))|(NULL)|(-?[0-9.]+))/i);
  if (d) {
    if (d[1] !== undefined) meta.def = d[1].replace(/''/g, "'");
    else if (d[2] !== undefined) meta.def = d[2];
    else if (d[3] !== undefined) meta.def = '__NOW__';
    else if (d[4] !== undefined) meta.def = null;
    else meta.def = Number(d[5]);
  } else meta.def = null;
  return { name, meta, primary: /\bPRIMARY\s+KEY\b/i.test(rest), unique: /\bUNIQUE\b/i.test(rest) };
}

/* --------------------------------- database -------------------------------- */

class Database {
  constructor() {
    this.tables = new Map();
    this.queries = [];
    this.handlers = [];
    this.failures = [];
    this.unavailable = null;
    this.connectionCount = 0;
  }
  table(name, { create = false } = {}) {
    const key = String(name).toLowerCase();
    let t = this.tables.get(key);
    if (!t && create) { t = new Table(name); this.tables.set(key, t); }
    if (!t) throw sqlError('ER_NO_SUCH_TABLE', `Table 'fake_db.${name}' doesn't exist`, 1146);
    return t;
  }
  snapshot() {
    return new Map([...this.tables].map(([k, t]) => {
      const c = new Table(t.name);
      c.columns = new Map([...t.columns].map(([n, m]) => [n, { ...m }]));
      c.indexes = t.indexes.map((i) => [...i]);
      c.rows = t.rows.map(cloneRow);
      c.autoInc = t.autoInc;
      return [k, c];
    }));
  }
  restore(snap) { this.tables = snap; }

  async run(sql, params, conn) {
    sql = String(sql);
    this.queries.push({ sql, params: params === undefined ? [] : params });
    if (this.unavailable) {
      throw Object.assign(new Error('connect ECONNREFUSED fake-mysql'), { code: 'ECONNREFUSED', errno: -111, fatal: true });
    }
    const fi = this.failures.findIndex((f) => f.match(sql, params));
    if (fi !== -1) {
      const [f] = this.failures.splice(fi, 1);
      throw f.error;
    }
    for (const h of this.handlers) {
      if (h.match(sql, params)) {
        const out = await h.handler(sql, params, this);
        if (out !== undefined) return out;
      }
    }
    const trimmed = sql.trim().replace(/;+\s*$/, '');
    const head = trimmed.split(/\s+/)[0].toUpperCase();
    const flat = Array.isArray(params) ? params : params === undefined ? [] : [params];
    switch (head) {
      case 'SELECT': return this.select(trimmed, flat);
      case 'INSERT': case 'REPLACE': return this.insert(trimmed, flat);
      case 'UPDATE': return this.update(trimmed, flat);
      case 'DELETE': return this.del(trimmed, flat);
      case 'CREATE': return this.create(trimmed);
      case 'ALTER': return this.alter(trimmed);
      case 'DROP': return this.drop(trimmed);
      case 'TRUNCATE': return this.truncate(trimmed);
      case 'START': case 'BEGIN':
        if (conn) conn.__tx.begin(); return [header(), undefined];
      case 'COMMIT': if (conn) conn.__tx.commit(); return [header(), undefined];
      case 'ROLLBACK': if (conn) conn.__tx.rollback(); return [header(), undefined];
      case 'SET': case 'USE': case 'LOCK': case 'UNLOCK': case 'SHOW': case 'ANALYZE': case 'OPTIMIZE':
        return [head === 'SHOW' ? [] : header(), undefined];
      default:
        throw notSupported(`statement ${head}`);
    }
  }

  // ---- DDL
  create(sql) {
    const m = sql.match(/^CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_$]+)`?\s*\(([\s\S]*)\)[^)]*$/i);
    if (!m) {
      if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(sql) || /^CREATE\s+(DATABASE|SCHEMA)/i.test(sql)) return [header(), undefined];
      throw notSupported('CREATE form');
    }
    const [, ine, name, body] = m;
    if (this.tables.has(name.toLowerCase())) {
      if (ine) return [header(), undefined];
      throw sqlError('ER_TABLE_EXISTS_ERROR', `Table '${name}' already exists`, 1050);
    }
    const t = this.table(name, { create: true });
    const pk = [];
    for (const part of splitTopLevel(body)) {
      const p = part.trim();
      const pkm = p.match(/^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i);
      const uqm = p.match(/^(?:CONSTRAINT\s+\S+\s+)?UNIQUE(?:\s+(?:KEY|INDEX))?\s*(?:`?[A-Za-z0-9_$]+`?)?\s*\(([^)]*)\)/i);
      const cols = (s) => s.split(',').map((c) => c.trim().replace(/`/g, '').replace(/\(\d+\)$/, ''));
      if (pkm) { pk.push(...cols(pkm[1])); continue; }
      if (uqm) { t.indexes.push(cols(uqm[1])); continue; }
      if (/^(KEY|INDEX|FULLTEXT|CONSTRAINT|FOREIGN)\b/i.test(p)) continue;
      const def = parseColumnDef(p);
      if (!def) continue;
      t.addColumn(def.name, def.meta);
      if (def.primary) pk.push(def.name);
      if (def.unique) t.indexes.push([def.name]);
    }
    if (pk.length) { t.indexes.unshift(pk); t.pk = pk; for (const c of pk) t.columns.get(c).notNull = true; }
    return [header(), undefined];
  }
  alter(sql) {
    const m = sql.match(/^ALTER\s+TABLE\s+`?([A-Za-z0-9_$]+)`?\s+([\s\S]*)$/i);
    if (!m) throw notSupported('ALTER form');
    const t = this.table(m[1]);
    const rest = m[2];
    const add = rest.match(/^ADD\s+(?:COLUMN\s+)?(?!PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN)([\s\S]+)$/i);
    if (add) {
      const def = parseColumnDef(add[1].replace(/\s+(AFTER|FIRST)\b[\s\S]*$/i, ''));
      if (!def) throw notSupported('ADD COLUMN definition');
      if (t.colName(def.name)) throw sqlError('ER_DUP_FIELDNAME', `Duplicate column name '${def.name}'`, 1060);
      t.addColumn(def.name, def.meta);
      const now = new Date();
      for (const r of t.rows) r[def.name] = t.defaultFor(def.meta, now);
      return [header(), undefined];
    }
    const mod = rest.match(/^(?:MODIFY|CHANGE)\s+(?:COLUMN\s+)?([\s\S]+)$/i);
    if (mod) {
      const def = parseColumnDef(mod[1]);
      if (!def) throw notSupported('MODIFY COLUMN definition');
      const existing = t.colName(def.name);
      if (!existing) throw sqlError('ER_BAD_FIELD_ERROR', `Unknown column '${def.name}' in '${t.name}'`, 1054);
      const prev = t.columns.get(existing);
      t.columns.set(existing, { ...def.meta, auto: def.meta.auto || prev.auto });
      return [header(), undefined];
    }
    const drop = rest.match(/^DROP\s+(?:COLUMN\s+)?`?([A-Za-z0-9_$]+)`?$/i);
    if (drop && !/^(PRIMARY|INDEX|KEY|FOREIGN)$/i.test(drop[1])) {
      const col = t.colName(drop[1]);
      if (!col) throw sqlError('ER_CANT_DROP_FIELD_OR_KEY', `Can't DROP '${drop[1]}'`, 1091);
      t.columns.delete(col);
      for (const r of t.rows) delete r[col];
      return [header(), undefined];
    }
    if (/^(ADD|DROP)\s+(UNIQUE|INDEX|KEY|CONSTRAINT|PRIMARY|FOREIGN)/i.test(rest)) return [header(), undefined];
    throw notSupported('ALTER action');
  }
  drop(sql) {
    const m = sql.match(/^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?`?([A-Za-z0-9_$]+)`?/i);
    if (!m) throw notSupported('DROP form');
    const key = m[2].toLowerCase();
    if (!this.tables.has(key) && !m[1]) throw sqlError('ER_BAD_TABLE_ERROR', `Unknown table '${m[2]}'`, 1051);
    this.tables.delete(key);
    return [header(), undefined];
  }
  truncate(sql) {
    const m = sql.match(/^TRUNCATE\s+(?:TABLE\s+)?`?([A-Za-z0-9_$]+)`?/i);
    if (!m) throw notSupported('TRUNCATE form');
    const t = this.table(m[1]);
    t.rows = []; t.autoInc = 0;
    return [header(), undefined];
  }

  // ---- DML
  parseTableRef(p) {
    const name = p.ident();
    if (name.includes('.')) throw notSupported('schema-qualified table');
    let alias = null;
    if (p.acceptKw('AS')) alias = p.ident();
    else if (p.peek() && p.peek().t === 'id' && !p.peek().quoted && !KEYWORDS_END_FROM.has(p.peek().v.toUpperCase())) alias = p.ident();
    return { name, alias };
  }
  where(p) {
    return p.acceptKw('WHERE') ? p.parseExpr() : null;
  }

  // information_schema.COLUMNS lookups (`... WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`),
  // answered from the fake's own column metadata. Other information_schema tables stay unsupported.
  infoSchemaColumns(sql, params) {
    if (!/\bFROM\s+`?information_schema`?\.`?COLUMNS`?\b/i.test(sql)) throw notSupported('information_schema table');
    const tbl = /TABLE_NAME\s*=\s*\?/i.test(sql) ? params[0] : (sql.match(/TABLE_NAME\s*=\s*'([^']*)'/i) || [])[1];
    const colIdx = /TABLE_NAME\s*=\s*\?/i.test(sql) ? 1 : 0;
    const col = /COLUMN_NAME\s*=\s*\?/i.test(sql) ? params[colIdx] : (sql.match(/COLUMN_NAME\s*=\s*'([^']*)'/i) || [])[1];
    const t = this.tables.get(String(tbl).toLowerCase());
    const rows = [];
    if (t) {
      for (const [name, m] of t.columns) {
        if (col !== undefined && name.toLowerCase() !== String(col).toLowerCase()) continue;
        const def = m.def === '__NOW__' ? 'CURRENT_TIMESTAMP' : m.def;
        rows.push({
          COLUMN_NAME: name,
          CHARACTER_MAXIMUM_LENGTH: m.len ?? null,
          len: m.len ?? null,
          IS_NULLABLE: m.notNull ? 'NO' : 'YES',
          nullable: m.notNull ? 'NO' : 'YES',
          COLUMN_DEFAULT: isNil(def) ? null : String(def),
          def: isNil(def) ? null : String(def),
        });
      }
    }
    return [rows, []];
  }

  select(sql, params) {
    if (/\binformation_schema\b/i.test(sql)) return this.infoSchemaColumns(sql, params);
    const p = new Parser(sql, params);
    p.expectKw('SELECT');
    p.acceptKw('DISTINCT');
    // select list: collect raw items first (params consumed in order, FROM-less selects too)
    const itemsStart = p.i;
    let depth = 0;
    while (!p.eof()) {
      if (p.isOp('(')) depth++;
      else if (p.isOp(')')) depth--;
      else if (depth === 0 && p.isKw('FROM')) break;
      p.i++;
    }
    const itemsEnd = p.i;
    const hasFrom = p.acceptKw('FROM');
    let table = null;
    const joinRefs = []; // [{ ref, table }] base table first
    const joins = [];
    if (hasFrom) {
      if (p.isOp('(')) throw notSupported('sub-select in FROM');
      const ref = this.parseTableRef(p);
      table = this.table(ref.name);
      joinRefs.push({ ref, table });
      for (;;) {
        let left = false;
        if (p.isKw('INNER')) { p.next(); }
        else if (p.isKw('LEFT')) { p.next(); p.acceptKw('OUTER'); left = true; }
        else if (p.isOp(',') || p.isKw('RIGHT') || p.isKw('CROSS')) throw notSupported('JOIN type (only INNER / LEFT ... JOIN ... ON)');
        if (!p.acceptKw('JOIN')) break;
        const jref = this.parseTableRef(p);
        const jt = this.table(jref.name);
        p.expectKw('ON');
        joins.push({ ref: jref, table: jt, left, on: p.parseExpr() });
        joinRefs.push({ ref: jref, table: jt });
      }
    }
    // Params in the select list precede those in WHERE; parse the list now by rewinding.
    const afterFrom = p.i;
    p.i = itemsStart;
    const lim = { end: itemsEnd };
    const items = this.parseSelectItems(p, lim, table);
    p.i = afterFrom;
    const ctx = { now: new Date() };
    const whereFn = this.where(p);
    if (p.isKw('GROUP')) throw notSupported('GROUP BY');
    if (p.isKw('HAVING')) throw notSupported('HAVING');
    const order = [];
    if (p.acceptKw('ORDER')) {
      p.expectKw('BY');
      do {
        const e = p.parseExpr();
        let desc = false;
        if (p.acceptKw('DESC')) desc = true; else p.acceptKw('ASC');
        order.push({ e, desc });
      } while (p.acceptOp(','));
    }
    let limit = null; let offset = 0;
    if (p.acceptKw('LIMIT')) {
      const a = p.parsePrimary()(null, ctx);
      if (p.acceptOp(',')) { offset = Number(a); limit = Number(p.parsePrimary()(null, ctx)); }
      else { limit = Number(a); if (p.acceptKw('OFFSET')) offset = Number(p.parsePrimary()(null, ctx)); }
    }
    if (p.acceptKw('FOR')) { p.acceptKw('UPDATE'); }
    else if (p.isKw('LOCK')) { p.next(); p.acceptKw('IN'); p.next(); p.next(); p.next(); }
    if (!p.eof()) throw p.syntax('unsupported trailing clause');

    let rows = table ? table.rows : [{}];
    if (joins.length) {
      // Composite rows: bare column names (first table wins) plus `alias.col` / `table.col` keys.
      const qualify = (row, ref, tbl, into) => {
        for (const k of tbl.columns.keys()) {
          const v = row ? row[k] : null;
          if (!(k in into)) into[k] = v;
          into[`${ref.alias || ref.name}.${k}`] = v;
          into[`${ref.name}.${k}`] = v;
        }
        return into;
      };
      rows = rows.map((r) => qualify(r, joinRefs[0].ref, joinRefs[0].table, {}));
      for (const j of joins) {
        const next = [];
        for (const l of rows) {
          let hit = false;
          for (const rr of j.table.rows) {
            const merged = qualify(rr, j.ref, j.table, { ...l });
            if (truthy(j.on(merged, ctx)) === true) { next.push(merged); hit = true; }
          }
          if (!hit && j.left) next.push(qualify(null, j.ref, j.table, { ...l }));
        }
        rows = next;
      }
    }
    if (whereFn) rows = rows.filter((r) => truthy(whereFn(r, ctx)) === true);
    if (order.length) {
      rows = rows.map((r, idx) => ({ r, idx })).sort((x, y) => {
        for (const o of order) {
          const a = o.e(x.r, ctx); const b = o.e(y.r, ctx);
          // NULLs sort first ascending, as in MySQL
          const k = isNil(a) && isNil(b) ? 0 : isNil(a) ? -1 : isNil(b) ? 1 : compare(a, b);
          if (k !== 0) return o.desc ? -k : k;
        }
        return x.idx - y.idx;
      }).map((x) => x.r);
    }
    const hasAgg = items.some((i) => i.agg);
    let out;
    if (hasAgg) {
      const row = {};
      for (const it of items) {
        if (!it.agg) { row[it.name] = rows.length ? it.fn(rows[0], ctx) : null; continue; }
        const vals = rows.map((r) => it.fn(r, ctx)).filter((v) => !isNil(v));
        if (it.agg === 'COUNT') row[it.name] = it.star ? rows.length : vals.length;
        else if (!vals.length) row[it.name] = null;
        else if (it.agg === 'SUM') row[it.name] = vals.reduce((s, v) => s + Number(v), 0);
        else if (it.agg === 'AVG') row[it.name] = vals.reduce((s, v) => s + Number(v), 0) / vals.length;
        else row[it.name] = vals.reduce((m, v) => ((it.agg === 'MAX' ? compare(v, m) > 0 : compare(v, m) < 0) ? v : m));
      }
      out = [row];
    } else {
      if (limit !== null) rows = rows.slice(offset, offset + limit);
      out = rows.map((r) => {
        const o = {};
        for (const it of items) {
          if (it.star && joins.length) {
            for (const { ref, table: tbl } of joinRefs) {
              if (it.qual && it.qual.toLowerCase() !== (ref.alias || ref.name).toLowerCase() && it.qual.toLowerCase() !== ref.name.toLowerCase()) continue;
              for (const k of tbl.columns.keys()) o[k] = r[`${ref.alias || ref.name}.${k}`];
            }
          }
          else if (it.star) { for (const k of table.columns.keys()) o[k] = r[k]; }
          else o[it.name] = it.fn(r, ctx);
        }
        return o;
      });
    }
    return [out, items.map((i) => ({ name: i.name }))];
  }

  parseSelectItems(p, lim, table) {
    const items = [];
    while (p.i < lim.end) {
      const first = p.peek();
      if (first.t === 'op' && first.v === '*') { p.next(); items.push({ star: true }); }
      else if (first.t === 'id' && first.v.endsWith('.*')) { p.next(); items.push({ star: true, qual: first.v.slice(0, -2) }); }
      else {
        const fname = first.t === 'id' && !first.quoted ? first.v.toUpperCase() : null;
        let item;
        if (['COUNT', 'MAX', 'MIN', 'SUM', 'AVG'].includes(fname) && p.isOp('(', 1)) {
          p.next(); p.next();
          p.acceptKw('DISTINCT');
          let star = false; let fn;
          if (p.isOp('*')) { p.next(); star = true; fn = () => 1; } else fn = p.parseExpr();
          p.expectOp(')');
          item = { agg: fname, star, fn };
        } else {
          item = { fn: p.parseExpr() };
        }
        const last = p.toks[p.i - 1];
        let name = p.sql.slice(first.pos, last.end);
        if (p.i - 1 === p.toks.indexOf(first) && first.t === 'id') name = first.v.includes('.') ? first.v.slice(first.v.lastIndexOf('.') + 1) : first.v;
        if (p.acceptKw('AS')) name = p.next().v;
        else if (p.i < lim.end && p.peek().t === 'id' && !p.isKw('FROM')) name = p.next().v;
        item.name = name;
        items.push(item);
      }
      if (p.i < lim.end && !p.acceptOp(',')) throw p.syntax('expected , in select list');
    }
    if (items.some((i) => i.star) && !table) throw p.syntax('* without FROM');
    return items;
  }

  insert(sql, params) {
    const p = new Parser(sql, params);
    const replace = p.isKw('REPLACE');
    p.next();
    const ignore = p.acceptKw('IGNORE');
    p.acceptKw('INTO');
    const t = this.table(p.ident());
    let cols;
    const ctx = { now: new Date() };
    const valueRows = [];
    if (p.isOp('(')) {
      p.next();
      cols = [];
      do { cols.push(p.ident()); } while (p.acceptOp(','));
      p.expectOp(')');
    }
    if (p.acceptKw('SET')) {
      cols = []; const row = [];
      do {
        cols.push(p.ident()); p.expectOp('=');
        row.push(p.parseExpr()(null, ctx));
      } while (p.acceptOp(','));
      valueRows.push(row);
    } else {
      if (p.isKw('SELECT')) throw notSupported('INSERT ... SELECT');
      if (!p.acceptKw('VALUES') && !p.acceptKw('VALUE')) throw p.syntax('expected VALUES');
      do {
        p.expectOp('(');
        const row = [];
        if (!p.isOp(')')) do { row.push(p.parseExpr()(null, ctx)); } while (p.acceptOp(','));
        p.expectOp(')');
        valueRows.push(row);
      } while (p.acceptOp(','));
    }
    const colList = (cols || [...t.columns.keys()]).map((c) => {
      const real = t.colName(c.includes('.') ? c.slice(c.lastIndexOf('.') + 1) : c);
      if (!real) throw sqlError('ER_BAD_FIELD_ERROR', `Unknown column '${c}' in 'field list'`, 1054);
      return real;
    });
    // ON DUPLICATE KEY UPDATE assignments are parsed lazily per conflicting row
    let dupStart = -1;
    if (p.isKw('ON')) {
      p.next(); p.expectKw('DUPLICATE'); p.expectKw('KEY'); p.expectKw('UPDATE');
      dupStart = p.i;
      // consume params for the assignments once so the cursor ends cleanly
    }
    const dupPi = p.pi;
    let affected = 0; let insertId = 0;
    for (const vals of valueRows) {
      if (vals.length !== colList.length) throw sqlError('ER_WRONG_VALUE_COUNT_ON_ROW', "Column count doesn't match value count", 1136);
      const row = t.blankRow(ctx.now);
      colList.forEach((c, i) => {
        let v = vals[i];
        if (v === undefined) v = null;
        if (v instanceof Date || (v !== null && typeof v === 'object')) v = v instanceof Date ? v : JSON.stringify(v);
        row[c] = v;
      });
      for (const [k, m] of t.columns) {
        if (m.auto && isNil(row[k])) row[k] = ++t.autoInc;
        else if (m.auto && Number(row[k]) > t.autoInc) t.autoInc = Number(row[k]);
        if (m.notNull && isNil(row[k]) && !m.auto) {
          throw sqlError('ER_BAD_NULL_ERROR', `Column '${k}' cannot be null`, 1048);
        }
      }
      const conflict = t.checkUnique(row, null);
      if (conflict) {
        if (replace) {
          t.rows = t.rows.filter((o) => o !== conflict.dup);
          t.rows.push(row); affected += 2; continue;
        }
        if (dupStart !== -1) {
          p.i = dupStart; p.pi = dupPi;
          const sets = [];
          const dctx = { now: ctx.now, insertRow: row };
          do {
            const c = p.ident(); p.expectOp('=');
            const real = t.colName(c.includes('.') ? c.slice(c.lastIndexOf('.') + 1) : c);
            if (!real) throw sqlError('ER_BAD_FIELD_ERROR', `Unknown column '${c}' in 'field list'`, 1054);
            sets.push([real, p.parseExpr()]);
          } while (p.acceptOp(','));
          const next = cloneRow(conflict.dup);
          for (const [c, f] of sets) next[c] = f(conflict.dup, dctx);
          const again = t.checkUnique(next, conflict.dup);
          if (again) throw t.dupError(again.idx, next);
          const changed = Object.keys(next).some((k) => compare(next[k], conflict.dup[k]) !== 0 || isNil(next[k]) !== isNil(conflict.dup[k]));
          Object.assign(conflict.dup, next);
          affected += changed ? 2 : 0;
          continue;
        }
        if (ignore) continue;
        throw t.dupError(conflict.idx, row);
      }
      t.rows.push(row);
      affected += 1;
      insertId = t.autoInc || 0;
    }
    return [header({ affectedRows: affected, insertId }), undefined];
  }

  update(sql, params) {
    const p = new Parser(sql, params);
    p.expectKw('UPDATE');
    const ref = this.parseTableRef(p);
    const t = this.table(ref.name);
    p.expectKw('SET');
    const ctx = { now: new Date() };
    const sets = [];
    do {
      const c = p.ident(); p.expectOp('=');
      const real = t.colName(c.includes('.') ? c.slice(c.lastIndexOf('.') + 1) : c);
      if (!real) throw sqlError('ER_BAD_FIELD_ERROR', `Unknown column '${c}' in 'field list'`, 1054);
      sets.push([real, p.parseExpr()]);
    } while (p.acceptOp(','));
    const whereFn = this.where(p);
    if (p.isKw('ORDER') || p.isKw('LIMIT')) {
      // honor LIMIT n on the matched set (ORDER BY ignored: insertion order)
      p.acceptKw('ORDER') && (p.expectKw('BY'), p.parseExpr());
    }
    let limit = null;
    if (p.acceptKw('LIMIT')) limit = Number(p.parsePrimary()(null, ctx));
    if (!p.eof()) throw p.syntax('unsupported trailing clause');
    let matched = t.rows.filter((r) => !whereFn || truthy(whereFn(r, ctx)) === true);
    if (limit !== null) matched = matched.slice(0, limit);
    // evaluate against pre-update rows, then check uniqueness, then apply
    const staged = matched.map((r) => {
      const next = cloneRow(r);
      for (const [c, f] of sets) {
        let v = f(r, ctx);
        if (v === undefined) v = null;
        if (v !== null && typeof v === 'object' && !(v instanceof Date)) v = JSON.stringify(v);
        const m = t.columns.get(c);
        if (m.notNull && isNil(v)) throw sqlError('ER_BAD_NULL_ERROR', `Column '${c}' cannot be null`, 1048);
        next[c] = v;
      }
      return { r, next };
    });
    let changedRows = 0;
    for (const s of staged) {
      const dup = t.checkUnique(s.next, s.r);
      if (dup) throw t.dupError(dup.idx, s.next);
      const changed = Object.keys(s.next).some((k) => compare(s.next[k], s.r[k]) !== 0 || isNil(s.next[k]) !== isNil(s.r[k]));
      if (changed) {
        for (const [k, m] of t.columns) {
          if (m.onUpdateNow && !sets.some(([c]) => c === k)) s.next[k] = ctx.now;
        }
        changedRows++;
      }
      Object.assign(s.r, s.next);
    }
    return [header({ affectedRows: matched.length, changedRows }), undefined];
  }

  del(sql, params) {
    const p = new Parser(sql, params);
    p.expectKw('DELETE');
    p.expectKw('FROM');
    const ref = this.parseTableRef(p);
    const t = this.table(ref.name);
    const ctx = { now: new Date() };
    const whereFn = this.where(p);
    let limit = null;
    if (p.acceptKw('LIMIT')) limit = Number(p.parsePrimary()(null, ctx));
    if (!p.eof()) throw p.syntax('unsupported trailing clause');
    let doomed = t.rows.filter((r) => !whereFn || truthy(whereFn(r, ctx)) === true);
    if (limit !== null) doomed = doomed.slice(0, limit);
    const set = new Set(doomed);
    t.rows = t.rows.filter((r) => !set.has(r));
    return [header({ affectedRows: doomed.length }), undefined];
  }
}

function header(extra = {}) {
  return { fieldCount: 0, affectedRows: 0, insertId: 0, info: '', serverStatus: 2, warningStatus: 0, changedRows: 0, ...extra };
}

/* ---------------------------- pool and connections -------------------------- */

function makeConnection(db, pool) {
  let snap = null;
  // Sync transaction primitives; `db.run` drives these for START TRANSACTION / COMMIT / ROLLBACK.
  const tx = {
    begin() { snap = db.snapshot(); },
    commit() { snap = null; },
    rollback() { if (snap) { db.restore(snap); snap = null; } },
  };
  const conn = {
    threadId: ++db.connectionCount,
    __fake: true,
    __pool: pool,
    __tx: tx,
    async beginTransaction() { await db.run('START TRANSACTION', [], conn); },
    async commit() { await db.run('COMMIT', [], conn); },
    async rollback() { await db.run('ROLLBACK', [], conn); },
    async query(sql, params) { return db.run(sql, params, conn); },
    async execute(sql, params) { return db.run(sql, params, conn); },
    escape: escapeValue,
    escapeId: (id) => '`' + String(id).replace(/`/g, '``') + '`',
    format: formatSql,
    async ping() {
      if (db.unavailable) throw Object.assign(new Error('connect ECONNREFUSED fake-mysql'), { code: 'ECONNREFUSED', fatal: true });
    },
    // A connection returned to the pool with an open transaction is rolled back, like a reset connection.
    release() { tx.rollback(); },
    destroy() { tx.rollback(); },
    async end() { tx.rollback(); },
    on() { return conn; },
    once() { return conn; },
    off() { return conn; },
    removeListener() { return conn; },
    pause() {},
    resume() {},
  };
  return conn;
}
function formatSql(sql, values) {
  let i = 0;
  const vals = Array.isArray(values) ? values : values === undefined ? [] : [values];
  return String(sql).replace(/\?/g, () => (i < vals.length ? escapeValue(vals[i++]) : '?'));
}

function makePool(db) {
  const pool = {
    __fake: true,
    async query(sql, params) { return db.run(sql, params, null); },
    async execute(sql, params) { return db.run(sql, params, null); },
    async getConnection() {
      if (db.unavailable) {
        throw Object.assign(new Error('connect ECONNREFUSED fake-mysql'), { code: 'ECONNREFUSED', errno: -111, fatal: true });
      }
      return makeConnection(db, pool);
    },
    escape: escapeValue,
    escapeId: (id) => '`' + String(id).replace(/`/g, '``') + '`',
    format: formatSql,
    async end() {},
    on() { return pool; },
    once() { return pool; },
    off() { return pool; },
    removeListener() { return pool; },
    pool: { config: { connectionLimit: 10 } },
  };
  return pool;
}

/* ----------------------------------- public -------------------------------- */

export function createFakeMysql() {
  const db = new Database();

  const mysql = {
    createPool: (config) => { db.lastConfig = config; return makePool(db); },
    createConnection: async (config) => {
      db.lastConfig = config;
      if (db.unavailable) {
        throw Object.assign(new Error('connect ECONNREFUSED fake-mysql'), { code: 'ECONNREFUSED', errno: -111, fatal: true });
      }
      return makeConnection(db, null);
    },
    escape: escapeValue,
    escapeId: (id) => '`' + String(id).replace(/`/g, '``') + '`',
    format: formatSql,
  };

  const asMatcher = (m) => {
    if (typeof m === 'function') return m;
    if (m instanceof RegExp) return (sql) => m.test(sql);
    return (sql) => sql.includes(String(m));
  };

  return {
    mysql,
    /** Shape for `vi.mock('mysql2/promise', () => fake.moduleExports)` */
    get moduleExports() { return { default: mysql, ...mysql }; },
    /** Every executed statement: `{ sql, params }` (in order). */
    get queries() { return db.queries; },
    /** Number of connections handed out (pool.getConnection / createConnection). */
    get connections() { return db.connectionCount; },
    get lastConfig() { return db.lastConfig; },
    pool: () => makePool(db),
    /** Copy of a table's rows (throws if the table does not exist). */
    rows: (table) => db.table(table).rows.map(cloneRow),
    tables: () => [...db.tables.values()].map((t) => t.name),
    /** Create `table` if needed and add rows. Columns are inferred from the rows when the table is new. */
    seed(table, rows = [], { primaryKey = 'id' } = {}) {
      const t = db.table(table, { create: true });
      for (const r of rows) {
        for (const k of Object.keys(r)) if (!t.columns.has(k)) t.addColumn(k);
      }
      if (!t.indexes.length && primaryKey && t.columns.has(primaryKey)) { t.indexes.push([primaryKey]); t.pk = [primaryKey]; }
      const now = new Date();
      for (const r of rows) {
        const row = t.blankRow(now);
        Object.assign(row, r);
        const dup = t.checkUnique(row, null);
        if (dup) throw t.dupError(dup.idx, row);
        t.rows.push(row);
      }
      return this;
    },
    /** Run SQL directly (DDL helpers for tests). */
    exec: (sql, params) => db.run(sql, params, null),
    /** Replace default handling for statements matching `matcher` (string | RegExp | fn). Return undefined to fall through. */
    onQuery(matcher, handler) {
      const h = { match: asMatcher(matcher), handler };
      db.handlers.push(h);
      return () => { db.handlers = db.handlers.filter((x) => x !== h); };
    },
    /** Make the next statement matching `matcher` reject with `error`. */
    failNext(matcher, error = Object.assign(new Error('fakeMysql injected failure'), { code: 'ER_FAKE_FAILURE' })) {
      db.failures.push({ match: asMatcher(matcher), error });
    },
    /** While true every call rejects with a fatal ECONNREFUSED error. */
    setUnavailable(flag = true) { db.unavailable = flag ? true : null; },
    /** Drop all tables, history, handlers, and injected failures. */
    reset() {
      db.tables = new Map(); db.queries = []; db.handlers = []; db.failures = []; db.unavailable = null; db.connectionCount = 0; db.lastConfig = undefined;
    },
    clearQueries() { db.queries.length = 0; },
  };
}

export default createFakeMysql;
