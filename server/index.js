'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const cors = require('cors');

const { router: pathsRouter, sweepStaleUploads } = require('./routes/paths');

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

const app = express();
app.disable('x-powered-by');

app.use(cors());
// 单条轨迹动辄上万点，POST /api/paths 的 body 会很大
app.use(express.json({ limit: '64mb' }));

/* ---------------- API ---------------- */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'pathview-server', time: new Date().toISOString() });
});

app.use('/api/paths', pathsRouter);

// API 未命中一律返回 JSON 404，不要掉进 SPA fallback
app.use('/api', (req, res) => {
  res.status(404).json({ error: `接口不存在: ${req.method} ${req.originalUrl}` });
});

/* ---------------- 生产环境静态托管 ---------------- */

const hasDist = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));
if (hasDist) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

/* ---------------- 统一错误处理 ---------------- */

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  const message = err.message || '服务器内部错误';
  if (status >= 500) console.error('[pathview]', err);
  res.status(status).json({ error: message });
});

/* ---------------- 启动 ---------------- */

const removed = sweepStaleUploads();
if (removed > 0) console.log(`[pathview] 清理过期上传暂存 ${removed} 个`);

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddress();
  console.log('');
  console.log('  PathView server 已启动');
  console.log(`  本机    http://localhost:${PORT}`);
  if (lan) console.log(`  局域网  http://${lan}:${PORT}`);
  console.log(`  前端静态资源  ${hasDist ? '已托管 (client/dist)' : '未构建 (开发模式请另起 vite)'}`);
  console.log('');
});
