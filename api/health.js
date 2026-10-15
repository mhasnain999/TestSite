'use strict';
/* Vercel function: GET /api/health shows whether the assistant loaded and which engine it uses (never shows keys). */
const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { createChatService } = require('../simplied-server/lib/chat-service');
    const dirs = [path.join(process.cwd(), 'simplied-server', 'knowledge'), path.join(__dirname, '..', 'simplied-server', 'knowledge')];
    const svc = createChatService({ env: process.env, knowledgeDir: dirs.find(d => fs.existsSync(d)) || dirs[0] });
    res.statusCode = 200; res.end(JSON.stringify({ ...svc.status(), runtime: 'vercel' }));
  } catch (e) {
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e && e.message).slice(0, 160) }));
  }
};
