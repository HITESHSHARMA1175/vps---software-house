import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeMysql } from './helpers/fakeMysql.js';

describe('fakeMysql', () => {
  let fake;
  let pool;
  beforeEach(async () => {
    fake = createFakeMysql();
    pool = fake.mysql.createPool({ host: 'nowhere' });
    await pool.query(`CREATE TABLE IF NOT EXISTS \`portal_users\` (
      \`id\` VARCHAR(100) PRIMARY KEY,
      \`username\` VARCHAR(100) NOT NULL,
      \`status\` VARCHAR(50) DEFAULT 'ACTIVE',
      \`createdAt\` VARCHAR(100)
    )`);
  });

  it('inserts, selects with WHERE/ORDER/LIMIT, updates and deletes', async () => {
    for (const [id, u, c] of [['1', 'Alice', 'b'], ['2', 'bob', 'a'], ['3', 'carol', 'c']]) {
      await pool.query('INSERT INTO `portal_users` (id, username, createdAt) VALUES (?, ?, ?)', [id, u, c]);
    }
    const [rows] = await pool.query('SELECT * FROM `portal_users` WHERE LOWER(username) = ? OR id = ? ORDER BY createdAt DESC LIMIT 1', ['alice', '3']);
    expect(rows.map((r) => r.id)).toEqual(['3']);
    expect(rows[0].status).toBe('ACTIVE'); // column default

    const [res] = await pool.query('UPDATE `portal_users` SET status = ? WHERE id IN (?)', ['OFF', ['1', '2', '9']]);
    expect(res.affectedRows).toBe(2);
    const [cnt] = await pool.query('SELECT COUNT(*) AS n FROM `portal_users` WHERE status = ?', ['OFF']);
    expect(cnt[0].n).toBe(2);
    const [del] = await pool.query('DELETE FROM `portal_users` WHERE id = ?', ['3']);
    expect(del.affectedRows).toBe(1);
    expect(fake.rows('portal_users')).toHaveLength(2);
  });

  it('enforces primary keys, INSERT IGNORE and ON DUPLICATE KEY UPDATE', async () => {
    await pool.query('INSERT INTO `portal_users` (id, username) VALUES (?, ?)', ['1', 'a']);
    await expect(pool.query('INSERT INTO `portal_users` (id, username) VALUES (?, ?)', ['1', 'b'])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    const [ig] = await pool.query('INSERT IGNORE INTO `portal_users` (id, username) VALUES (?, ?)', ['1', 'b']);
    expect(ig.affectedRows).toBe(0);
    await pool.query('INSERT INTO `portal_users` (id, username) VALUES (?, ?) ON DUPLICATE KEY UPDATE username=VALUES(username)', ['1', 'c']);
    expect(fake.rows('portal_users')[0].username).toBe('c');
  });

  it('treats repeated ADD COLUMN as a duplicate-field error and fills existing rows', async () => {
    await pool.query('INSERT INTO `portal_users` (id, username) VALUES (?, ?)', ['1', 'a']);
    await pool.query("ALTER TABLE `portal_users` ADD COLUMN `two_factor_enabled` TINYINT(1) DEFAULT 0");
    await expect(pool.query("ALTER TABLE `portal_users` ADD COLUMN `two_factor_enabled` TINYINT(1) DEFAULT 0")).rejects.toMatchObject({ code: 'ER_DUP_FIELDNAME' });
    expect(fake.rows('portal_users')[0].two_factor_enabled).toBe(0);
  });

  it('rolls back a transaction and keeps a committed one', async () => {
    const c1 = await pool.getConnection();
    await c1.beginTransaction();
    await c1.query('INSERT INTO `portal_users` (id, username) VALUES (?, ?)', ['1', 'a']);
    await c1.rollback();
    c1.release();
    expect(fake.rows('portal_users')).toHaveLength(0);

    const c2 = await pool.getConnection();
    await c2.beginTransaction();
    await c2.query('INSERT INTO `portal_users` (id, username) VALUES (?, ?)', ['2', 'b']);
    await c2.commit();
    c2.release();
    expect(fake.rows('portal_users')).toHaveLength(1);
  });

  it('joins sessions to portal_users like validateSession and filters expired/unknown tokens', async () => {
    fake.seed('portal_users', [{ id: 'u1', name: 'Ann', username: 'ann', email: 'a@x', role: 'admin', status: null }]);
    fake.seed('sessions', [
      { id: 's1', employee_id: 'u1', session_token_hash: 'good', status: 'ACTIVE', expires_at: new Date(Date.now() + 60000) },
      { id: 's2', employee_id: 'u1', session_token_hash: 'old', status: 'ACTIVE', expires_at: new Date(Date.now() - 60000) },
      { id: 's3', employee_id: 'nobody', session_token_hash: 'orphan', status: 'ACTIVE', expires_at: new Date(Date.now() + 60000) },
    ]);
    const q = "SELECT s.*, p.name, p.username, p.email, p.role, COALESCE(p.status, 'ACTIVE') as employee_status FROM `sessions` s JOIN `portal_users` p ON s.employee_id = p.id WHERE s.session_token_hash = ? AND s.status = 'ACTIVE' AND s.expires_at > NOW()";
    const [ok] = await pool.query(q, ['good']);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ id: 's1', employee_id: 'u1', name: 'Ann', username: 'ann', role: 'admin', employee_status: 'ACTIVE' });
    expect((await pool.query(q, ['old']))[0]).toHaveLength(0);
    expect((await pool.query(q, ['orphan']))[0]).toHaveLength(0);
    expect((await pool.query(q, ['missing']))[0]).toHaveLength(0);
    const [left] = await pool.query('SELECT s.id, p.name FROM `sessions` s LEFT JOIN `portal_users` p ON s.employee_id = p.id ORDER BY s.id');
    expect(left).toEqual([{ id: 's1', name: 'Ann' }, { id: 's2', name: 'Ann' }, { id: 's3', name: null }]);
  });

  it('accepts ALTER ... MODIFY COLUMN and answers information_schema.COLUMNS', async () => {
    fake.seed('portal_users', [{ id: 'u1' }]);
    await pool.query('ALTER TABLE `portal_users` ADD COLUMN `tok` VARCHAR(64) NOT NULL DEFAULT \'x\'');
    await pool.query('ALTER TABLE `portal_users` MODIFY COLUMN `tok` VARCHAR(512) NOT NULL DEFAULT \'x\'');
    const [cols] = await pool.query(
      'SELECT CHARACTER_MAXIMUM_LENGTH AS len, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      ['portal_users', 'tok']
    );
    expect(cols[0]).toMatchObject({ len: 512, nullable: 'NO', def: 'x' });
    const [none] = await pool.query('SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ?', ['nope', 'tok']);
    expect(none).toEqual([]);
  });

  it('supports failure injection, unavailability and unsupported SQL', async () => {
    fake.failNext(/UPDATE/, Object.assign(new Error('boom'), { code: 'ER_LOCK_DEADLOCK' }));
    await expect(pool.query('UPDATE `portal_users` SET status = ? WHERE id = ?', ['x', '1'])).rejects.toMatchObject({ code: 'ER_LOCK_DEADLOCK' });
    await expect(pool.query('SELECT * FROM `portal_users` a RIGHT JOIN `portal_users` b ON a.id=b.id')).rejects.toMatchObject({ code: 'ER_NOT_SUPPORTED_YET' });
    await expect(pool.query('SELECT * FROM `missing`')).rejects.toMatchObject({ code: 'ER_NO_SUCH_TABLE' });
    fake.setUnavailable(true);
    await expect(pool.query('SELECT 1')).rejects.toMatchObject({ code: 'ECONNREFUSED', fatal: true });
    fake.setUnavailable(false);
    const [r] = await pool.query('SELECT 1');
    expect(r).toEqual([{ 1: 1 }]);
  });
});
