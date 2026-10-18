'use strict';

/**
 * 存储层：Node 22 内置 node:sqlite。
 *
 * 为什么不用 better-sqlite3：它在 Windows 上需要 node-gyp + VS Build Tools 原生编译，
 * 环境不具备时会在第一步就卡死。node:sqlite 是 Node 22.5+ 内置模块，零原生依赖，
 * 且 API 与 better-sqlite3 高度相似（prepare/run/get/all），迁移成本极低。
 * 唯一的差异是没有 db.transaction() 包装器，这里用 tx() 自己实现。
 */

const fs = require('node:fs');
const path = require('node:path');

/* node:sqlite 免标志可用的最低版本：22.13 / 23.4 / 24+。
   低版本直接报 ERR_UNKNOWN_BUILTIN_MODULE，栈里看不出是版本问题，这里先给出人话。 */
const [major, minor] = process.versions.node.split('.').map(Number);
const sqliteAvailable =
  major >= 24 || (major === 23 && minor >= 4) || (major === 22 && minor >= 13);
if (!sqliteAvailable) {
  console.error(
    `\n[pathview] 当前 Node ${process.versions.node}，本项目依赖内置 node:sqlite，` +
      `需要 Node 22.13+ / 23.4+ / 24+。\n` +
      `  升级建议：使用 Node 24 LTS（24.15+ 该模块已是 Release Candidate）。\n` +
      `  临时绕过：NODE_OPTIONS=--experimental-sqlite 启动。\n`
  );
  process.exit(1);
}

const { DatabaseSync } = require('node:sqlite');

/**
 * 数据目录：默认 server/data，可用环境变量 PV_DATA_DIR 指到别处。
 * 部署时（Docker 卷挂载 / systemd ProtectHome / 独立数据盘）把数据挪出代码目录，
 * 升级代码时不会碰坏数据库。
 */
const DATA_DIR = process.env.PV_DATA_DIR
  ? path.resolve(process.env.PV_DATA_DIR)
  : path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'paths.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS paths (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    source_file     TEXT,
    has_orientation INTEGER DEFAULT 0,
    point_count     INTEGER DEFAULT 0,
    color           TEXT DEFAULT '#3b82f6',
    created_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS points (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    path_id INTEGER NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
    seq     INTEGER NOT NULL,
    x REAL, y REAL, z REAL,
    rx REAL, ry REAL, rz REAL,
    extra   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_points_path ON points(path_id, seq);
  CREATE INDEX IF NOT EXISTS idx_paths_created ON paths(created_at DESC);
`);

/** 事务包装器：node:sqlite 没有 db.transaction()，这里手写 BEGIN/COMMIT/ROLLBACK。 */
function tx(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* rollback 失败就不再掩盖原始错误 */
      }
      throw err;
    }
  };
}

/**
 * node:sqlite 只接受 null / number / string / bigint / Uint8Array 作为绑定值，
 * 传 undefined 会直接抛错。统一在这里收敛成 null。
 */
function bind(v) {
  return v === undefined ? null : v;
}

/** 统一把 lastInsertRowid 收敛成 number（node:sqlite 在部分配置下返回 bigint）。 */
function lastId(info) {
  return Number(info.lastInsertRowid);
}

module.exports = { db, tx, bind, lastId, DATA_DIR, UPLOAD_DIR };
