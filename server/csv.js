'use strict';

const chardet = require('chardet');
const iconv = require('iconv-lite');

/* ------------------------------------------------------------------ *
 * 编码处理
 * ------------------------------------------------------------------ */

/**
 * 把上传的 CSV 字节流解码成字符串。
 * 顺序：BOM 优先 → chardet 探测 → 兜底链（utf-8 → gb18030 → latin1）。
 *
 * 为什么必须处理这些：
 *  - Excel 导出的中文 CSV 常带 UTF-8 BOM，第一列名会变成 '\ufeffx'，列名自动匹配全失效
 *  - 国内离线编程软件（含机器人示教器）导出多为 GBK/GB18030，按 UTF-8 读会乱码
 */
/** 纯 ASCII 的字节流，任何单字节编码解码结果都一样，直接按 utf-8 报告更干净。 */
function isPureAscii(buf) {
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] > 0x7f) return false;
  }
  return true;
}

/** 单字节编码永远不会产生 U+FFFD，所以不能靠替换字符判断是否解错——必须显式排除。 */
const SINGLE_BYTE_RE = /^(ascii|us-ascii|iso-8859|windows-125|cp125|ibm|macroman|koi8)/i;

function decodeCsvBuffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'utf-8 (BOM)' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: iconv.decode(buf.subarray(2), 'utf16le'), encoding: 'utf-16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: iconv.decode(buf, 'utf16be'), encoding: 'utf-16be' };
  }
  if (isPureAscii(buf)) {
    return { text: buf.toString('utf8'), encoding: 'utf-8' };
  }

  let detected = null;
  try {
    const raw = chardet.detect(buf);
    // chardet v0 返回 { encoding }，v1+ 直接返回字符串，两种都兼容
    detected = typeof raw === 'string' ? raw : raw && raw.encoding ? raw.encoding : null;
  } catch {
    detected = null;
  }

  const name = detected ? detected.toLowerCase() : '';
  const candidates = [];

  if (/^utf-?8/.test(name)) {
    candidates.push('utf8');
  } else if (name && !SINGLE_BYTE_RE.test(name)) {
    // 明确识别为多字节编码（gb18030 / big5 / shift_jis / euc-kr …），优先采信
    candidates.push(name);
  }
  // 单字节编码的判定不可信（GBK 短文件常被误判成 iso-8859-1），
  // 对中文场景直接退到 utf-8 → gb18030 这条最稳的链
  candidates.push('utf8', 'gb18030', 'big5');

  for (const enc of candidates) {
    if (!iconv.encodingExists(enc)) continue;
    const text = iconv.decode(buf, enc);
    if (text.includes('\uFFFD')) continue;
    return { text, encoding: enc === 'utf8' ? 'utf-8' : enc };
  }

  return { text: buf.toString('utf8'), encoding: 'utf-8 (lossy)' };
}

/* ------------------------------------------------------------------ *
 * RFC 4180 解析
 * ------------------------------------------------------------------ */

/**
 * 手写 RFC 4180 解析器。不用 csv-parse 的原因：需要精确控制
 * 「引号内换行 / 引号内逗号 / 双引号转义 / CRLF 与 LF 混用 / 空行丢弃」
 * 这几个边界，手写反而更好验证。
 */
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 丢掉完全空白的行
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/** 列名去重：CSV 里出现同名列时，后面的加 _2 _3 后缀，避免对象键互相覆盖。 */
function dedupeColumns(columns) {
  const seen = new Map();
  return columns.map((name) => {
    const base = name === '' ? 'unnamed' : name;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

/* ------------------------------------------------------------------ *
 * 列名自动匹配
 * ------------------------------------------------------------------ */

const POSITION_ALIASES = {
  x: ['x', 'pos_x', 'position_x', 'px', 'x_pos', 'x_position', 'x坐标', 'x轴', 'x值', '横坐标'],
  y: ['y', 'pos_y', 'position_y', 'py', 'y_pos', 'y_position', 'y坐标', 'y轴', 'y值', '纵坐标'],
  z: ['z', 'pos_z', 'position_z', 'pz', 'z_pos', 'z_position', 'z坐标', 'z轴', 'z值', '高度'],
};

const ROTATION_ALIASES = {
  rx: ['rx', 'rot_x', 'rotation_x', 'roll', 'r_x', 'x_rot', 'rx角', 'x角度', 'rx_deg'],
  ry: ['ry', 'rot_y', 'rotation_y', 'pitch', 'r_y', 'y_rot', 'ry角', 'y角度', 'ry_deg'],
  rz: ['rz', 'rot_z', 'rotation_z', 'yaw', 'r_z', 'z_rot', 'rz角', 'z角度', 'rz_deg', '姿态'],
};

function autoMatch(columns) {
  const mapping = {};
  const lowerCols = columns.map((c) => c.toLowerCase().trim());
  for (const table of [POSITION_ALIASES, ROTATION_ALIASES]) {
    for (const [key, aliases] of Object.entries(table)) {
      for (const alias of aliases) {
        const idx = lowerCols.indexOf(alias.toLowerCase());
        // 命中后必须回写**原始大小写**的列名，因为后续 rows[row[mapping.x]] 用的是原始键
        if (idx >= 0) {
          mapping[key] = columns[idx];
          break;
        }
      }
    }
  }
  return mapping;
}

/* ------------------------------------------------------------------ *
 * 表头行自动探测（新增能力）
 * ------------------------------------------------------------------ */

/**
 * 离线编程软件导出的 CSV 前几行常是元信息/注释（工件号、坐标系、时间戳），
 * 真正的表头在第 N 行。原实现要用户手动逐行试；这里自动打分推荐。
 *
 * 打分规则：
 *  - 命中别名表 +10 分（这是最强信号）
 *  - 该行单元格「非纯数字」比例高 + 每格 1~3 分（表头通常是文字）
 *  - 与下一行「类型分布」差异大 + 最多 5 分（表头行 vs 数据行的分界）
 */
function detectHeaderRow(rows) {
  const limit = Math.min(rows.length, 12);
  let best = { index: 0, score: -Infinity };

  for (let r = 0; r < limit; r += 1) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    let score = 0;
    const lower = row.map((c) => String(c).toLowerCase().trim());
    for (const table of [POSITION_ALIASES, ROTATION_ALIASES]) {
      for (const aliases of Object.values(table)) {
        if (aliases.some((a) => lower.includes(a.toLowerCase()))) score += 10;
      }
    }

    let nonNumeric = 0;
    for (const cell of row) {
      const s = String(cell).trim();
      if (s === '') continue;
      if (Number.isFinite(Number(s))) {
        score -= 0.5;
      } else {
        nonNumeric += 1;
        score += Math.min(s.length, 3);
      }
    }
    if (nonNumeric === 0 && row.length > 0) score -= 4;

    const next = rows[r + 1];
    if (next && next.length > 0) {
      const nextNumeric = next.filter((c) => Number.isFinite(Number(String(c).trim())) && String(c).trim() !== '').length;
      if (nextNumeric > nonNumeric) score += 5;
    }

    if (score > best.score) best = { index: r, score };
  }

  // 没有任何一行打出足够的分数，说明这个文件压根没有表头（纯数值数据），
  // 返回 -1 而不是 0 —— 否则会把第一行真实数据当成表头吃掉
  return best.score >= 10 ? best.index : -1;
}

/* ------------------------------------------------------------------ *
 * 组装上传结果
 * ------------------------------------------------------------------ */

const MAX_ROWS = 200000;

/**
 * @param {object} opts
 * @param {string} opts.fileId
 * @param {string} opts.fileName
 * @param {Buffer} opts.buffer
 * @param {number} [opts.headerRow] -1 表示无表头；不传则自动探测
 */
function buildCsvResult({ fileId, fileName, buffer, headerRow }) {
  const decoded = decodeCsvBuffer(buffer);
  const matrix = parseCsvText(decoded.text);

  if (matrix.length === 0) {
    const err = new Error('CSV 文件没有可解析的内容');
    err.status = 400;
    throw err;
  }

  const totalColumns = Math.max(...matrix.map((r) => r.length));
  const autoHeader = headerRow == null ? detectHeaderRow(matrix) : headerRow;
  const useHeader = autoHeader >= 0;
  const headerIndex = useHeader ? Math.min(autoHeader, matrix.length - 1) : -1;

  let columns;
  if (useHeader) {
    const raw = matrix[headerIndex].map((c) => String(c).trim());
    while (raw.length < totalColumns) raw.push('');
    columns = dedupeColumns(raw);
  } else {
    columns = Array.from({ length: totalColumns }, (_, i) => `col${i}`);
  }

  const dataRows = useHeader ? matrix.slice(headerIndex + 1) : matrix;
  if (dataRows.length > MAX_ROWS) {
    const err = new Error(`CSV 行数 ${dataRows.length} 超过上限 ${MAX_ROWS}，请先拆分文件`);
    err.status = 400;
    throw err;
  }

  const rows = dataRows.map((r) => {
    const obj = {};
    for (let i = 0; i < columns.length; i += 1) {
      obj[columns[i]] = r[i] === undefined ? '' : String(r[i]);
    }
    return obj;
  });

  let mapping = autoMatch(columns);

  // 无表头时给一个合理默认：前三列当 XYZ，紧接着三列当 RPY（用户可以改）
  if (!useHeader) {
    if (!mapping.x && columns.length > 0) mapping.x = columns[0];
    if (!mapping.y && columns.length > 1) mapping.y = columns[1];
    if (!mapping.z && columns.length > 2) mapping.z = columns[2];
    if (columns.length > 5) {
      mapping.rx = mapping.rx || columns[3];
      mapping.ry = mapping.ry || columns[4];
      mapping.rz = mapping.rz || columns[5];
    }
  }

  return {
    fileId,
    fileName,
    columns,
    rows,
    rowCount: rows.length,
    mapping,
    hasHeader: useHeader,
    headerRow: headerIndex,
    detectedHeaderRow: detectHeaderRow(matrix),
    encoding: decoded.encoding,
    rawPreview: matrix.slice(0, 3),
    totalColumns,
  };
}

module.exports = {
  decodeCsvBuffer,
  parseCsvText,
  dedupeColumns,
  autoMatch,
  detectHeaderRow,
  buildCsvResult,
  POSITION_ALIASES,
  ROTATION_ALIASES,
};
