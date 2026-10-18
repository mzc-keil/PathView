'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');

const { db, tx, bind, lastId, UPLOAD_DIR } = require('../db');
const { buildCsvResult } = require('../csv');

const router = express.Router();

const MAX_POINTS = 200000;
const FILE_ID_RE = /^[a-f0-9]{32}$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 数字收敛：只有真正有限的值才接受，其余返回 null（不再用 parseFloat(x) || 0） */
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeExtra(v) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  return Object.keys(v).length === 0 ? null : JSON.stringify(v);
}

function parseExtra(v) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function rowToPath(row) {
  return { ...row, has_orientation: !!row.has_orientation };
}

function rowToPoint(row) {
  return { ...row, extra: parseExtra(row.extra) };
}

function uploadPathOf(fileId) {
  if (!FILE_ID_RE.test(fileId)) throw new HttpError(400, 'fileId 非法');
  return path.join(UPLOAD_DIR, `${fileId}.csv`);
}

/** 启动时清掉 24 小时前的上传暂存（原实现的 data/uploads 只增不减） */
function sweepStaleUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  let removed = 0;
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
      const full = path.join(UPLOAD_DIR, name);
      if (now - fs.statSync(full).mtimeMs > maxAgeMs) {
        fs.unlinkSync(full);
        removed += 1;
      }
    }
  } catch {
    /* 清理失败不影响启动 */
  }
  return removed;
}

/* ------------------------------------------------------------------ *
 * GET /api/paths —— 列表（不 JOIN points）
 * ------------------------------------------------------------------ */

router.get('/', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM paths ORDER BY created_at DESC, id DESC').all();
    res.json(rows.map(rowToPath));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ *
 * POST /api/paths —— 创建（事务）
 * ------------------------------------------------------------------ */

const insertPathAndPoints = tx((name, sourceFile, points) => {
  const hasOrientation = points.some((p) => p.rx != null || p.ry != null || p.rz != null);
  const createdAt = new Date().toISOString();

  const info = db
    .prepare(
      `INSERT INTO paths (name, source_file, has_orientation, point_count, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, bind(sourceFile), hasOrientation ? 1 : 0, points.length, createdAt);

  const pathId = lastId(info);
  const stmt = db.prepare(
    `INSERT INTO points (path_id, seq, x, y, z, rx, ry, rz, extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  points.forEach((p, i) => {
    stmt.run(
      pathId,
      i,
      p.x,
      p.y,
      p.z,
      bind(p.rx),
      bind(p.ry),
      bind(p.rz),
      bind(normalizeExtra(p.extra))
    );
  });

  return { id: pathId, point_count: points.length, has_orientation: hasOrientation, created_at: createdAt };
});

router.post('/', (req, res, next) => {
  try {
    const { name, source_file, points } = req.body || {};
    if (!Array.isArray(points) || points.length === 0) {
      throw new HttpError(400, 'points 必须是非空数组');
    }
    if (points.length > MAX_POINTS) {
      throw new HttpError(400, `points 超过上限 ${MAX_POINTS}`);
    }

    const warnings = [];
    const normalized = points.map((p, i) => {
      const x = toNum(p.x);
      const y = toNum(p.y);
      const z = toNum(p.z);
      if (x === null || y === null || z === null) {
        if (warnings.length < 10) warnings.push(`#${i} 坐标非法，已按 0 处理`);
        else if (warnings.length === 10) warnings.push('…更多非法坐标已省略');
      }
      return {
        x: x ?? 0,
        y: y ?? 0,
        z: z ?? 0,
        rx: toNum(p.rx),
        ry: toNum(p.ry),
        rz: toNum(p.rz),
        extra: p.extra,
      };
    });

    const result = insertPathAndPoints(String(name || 'untitled').slice(0, 200), source_file, normalized);
    res.status(201).json({ id: result.id, warnings });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ *
 * GET /api/paths/:id —— 详情（含 points）
 * ------------------------------------------------------------------ */

router.get('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'id 非法');

    const pathRow = db.prepare('SELECT * FROM paths WHERE id = ?').get(id);
    if (!pathRow) throw new HttpError(404, '轨迹不存在');

    const pointRows = db.prepare('SELECT * FROM points WHERE path_id = ? ORDER BY seq').all(id);
    res.json({ ...rowToPath(pathRow), points: pointRows.map(rowToPoint) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ *
 * DELETE /api/paths/:id
 * ------------------------------------------------------------------ */

const deletePathTx = tx((id) => {
  db.prepare('DELETE FROM points WHERE path_id = ?').run(id);
  const info = db.prepare('DELETE FROM paths WHERE id = ?').run(id);
  return Number(info.changes);
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'id 非法');
    const removed = deletePathTx(id);
    // 前端把 404 当成功，保证批量删除幂等可重试
    if (removed === 0) throw new HttpError(404, '轨迹不存在');
    res.json({ ok: true, id });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ *
 * PATCH /api/paths/:id/color | /name
 * ------------------------------------------------------------------ */

function makePatch(field, column, sanitize) {
  return (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new HttpError(400, 'id 非法');
      const value = sanitize(req.body ? req.body[field] : undefined);
      const info = db.prepare(`UPDATE paths SET ${column} = ? WHERE id = ?`).run(value, id);
      if (Number(info.changes) === 0) throw new HttpError(404, '轨迹不存在');
      res.json({ ok: true, id, [field]: value });
    } catch (err) {
      next(err);
    }
  };
}

router.patch(
  '/:id/color',
  makePatch('color', 'color', (v) => {
    const s = String(v ?? '').trim();
    if (!/^#[0-9a-fA-F]{3,8}$/.test(s)) throw new HttpError(400, 'color 必须是 hex 色值');
    return s;
  })
);

router.patch(
  '/:id/name',
  makePatch('name', 'name', (v) => {
    const s = String(v ?? '').trim();
    if (!s) throw new HttpError(400, 'name 不能为空');
    return s.slice(0, 200);
  })
);

/* ------------------------------------------------------------------ *
 * POST /api/paths/upload —— 阶段 1：上传解析（不落库）
 * ------------------------------------------------------------------ */

router.post('/upload', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, '缺少上传文件（字段名必须为 file）');

    const fileId = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(uploadPathOf(fileId), req.file.buffer);

    const result = buildCsvResult({
      fileId,
      fileName: req.file.originalname || 'uploaded.csv',
      buffer: req.file.buffer,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ *
 * POST /api/paths/reparse —— 阶段 2：换表头行重新解析
 * ------------------------------------------------------------------ */

router.post('/reparse', (req, res, next) => {
  try {
    const { fileId } = req.body || {};
    const headerRow = Number(req.body ? req.body.headerRow : 0);
    if (!Number.isInteger(headerRow) || headerRow < -1) throw new HttpError(400, 'headerRow 非法');

    const file = uploadPathOf(fileId);
    if (!fs.existsSync(file)) throw new HttpError(404, '上传文件已过期，请重新上传');

    const result = buildCsvResult({
      fileId,
      fileName: path.basename(file),
      buffer: fs.readFileSync(file),
      headerRow,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = { router, sweepStaleUploads };
