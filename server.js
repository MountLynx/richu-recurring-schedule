'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'schedule.db');
const MAX_BODY_BYTES = 1024 * 1024;
const COLORS = new Set(['moss', 'clay', 'ocean', 'plum', 'ochre']);
const SESSION_COOKIE = 'richu_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;
const MAX_TIME_POINTS = 12;
const DEFAULT_TIME_POINTS = ['09:00', '12:00', '18:00', '21:00'];
const rateLimitBuckets = new Map();

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    interval_days INTEGER NOT NULL,
    color TEXT NOT NULL DEFAULT 'moss',
    note TEXT NOT NULL DEFAULT '',
    task_type TEXT NOT NULL DEFAULT 'fixed',
    window_mode TEXT,
    time_slot INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS time_points (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    time_value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, time_value),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_time_points_user
    ON time_points(user_id, time_value);

  CREATE TABLE IF NOT EXISTS task_completions (
    task_id TEXT NOT NULL,
    occurrence_key TEXT NOT NULL,
    completed_date TEXT NOT NULL,
    completed_at INTEGER NOT NULL,
    PRIMARY KEY (task_id, occurrence_key),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_task_completions_task
    ON task_completions(task_id);

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

migrateSchema();
cleanupExpiredSessions();

const PUBLIC_FILES = new Set(['/index.html', '/styles.css', '/app.js']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, requestUrl);
      return;
    }

    serveStatic(req, res, requestUrl.pathname);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) {
      sendJson(res, status, { error: status === 500 ? '服务器内部错误' : error.message });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`日序服务已启动: http://${HOST}:${PORT}`);
  console.log(`SQLite 数据库: ${DB_PATH}`);
});

function migrateSchema() {
  const columns = db.prepare('PRAGMA table_info(tasks)').all();
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('task_type')) {
    db.exec("ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'fixed'");
  }
  if (!names.has('window_mode')) {
    db.exec('ALTER TABLE tasks ADD COLUMN window_mode TEXT');
  }
  if (!names.has('user_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN user_id TEXT');
  }
  if (!names.has('time_slot')) {
    db.exec('ALTER TABLE tasks ADD COLUMN time_slot INTEGER NOT NULL DEFAULT 0');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, created_at)');
}

function seedTasksForUser(userId) {
  const today = startOfDay(new Date());
  const monday = startOfWeek(today);
  const now = Date.now();
  const seeds = [
    {
      title: '晨间拉伸',
      startDate: toISO(addDays(today, -8)),
      interval: 1,
      color: 'moss',
      note: '十分钟，唤醒身体。',
      createdAt: now - 5000
    },
    {
      title: '深度阅读',
      startDate: toISO(addDays(today, -2)),
      interval: 2,
      color: 'clay',
      note: '关掉通知，专注读三十分钟。',
      createdAt: now - 4000
    },
    {
      title: '给植物浇水',
      startDate: toISO(addDays(today, -3)),
      interval: 3,
      color: 'ocean',
      note: '',
      createdAt: now - 3000
    },
    {
      title: '周复盘',
      startDate: toISO(monday),
      interval: 7,
      color: 'plum',
      note: '回看这一周，为下一周留一点余地。',
      createdAt: now - 2000
    },
    {
      title: '房间整理',
      startDate: toISO(addDays(today, 1)),
      interval: 14,
      color: 'ochre',
      note: '',
      createdAt: now - 1000
    },
    {
      title: '每周采购',
      startDate: toISO(monday),
      interval: 7,
      color: 'ochre',
      type: 'window',
      windowMode: 'flexible',
      note: '本周内挑一天完成即可。',
      createdAt: now - 500
    },
    {
      title: '项目冲刺',
      startDate: toISO(monday),
      interval: 14,
      color: 'plum',
      type: 'window',
      windowMode: 'continuous',
      note: '跨越两周的持续任务。',
      createdAt: now
    }
  ];

  const insert = db.prepare(`
    INSERT INTO tasks (
      id, user_id, title, start_date, interval_days, color, note,
      task_type, window_mode, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const task of seeds) {
    insert.run(
      crypto.randomUUID(),
      userId,
      task.title,
      task.startDate,
      task.interval,
      task.color,
      task.note,
      task.type || 'fixed',
      task.windowMode || null,
      task.createdAt
    );
  }
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)')
    .run('tasks_seeded', String(Date.now()));
}

async function handleApi(req, res, requestUrl) {
  const { pathname } = requestUrl;
  assertSameOrigin(req);

  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/auth/register') {
    if (req.method !== 'POST') throw methodNotAllowed('POST');
    await handleRegister(req, res);
    return;
  }

  if (pathname === '/api/auth/login') {
    if (req.method !== 'POST') throw methodNotAllowed('POST');
    await handleLogin(req, res);
    return;
  }

  if (pathname === '/api/auth/logout') {
    if (req.method !== 'POST') throw methodNotAllowed('POST');
    handleLogout(req, res);
    return;
  }

  if (pathname === '/api/auth/me') {
    if (req.method !== 'GET') throw methodNotAllowed('GET');
    const user = getSessionUser(req);
    if (!user) throw new HttpError(401, '请先登录');
    sendJson(res, 200, { user });
    return;
  }

  const user = getSessionUser(req);
  if (!user) throw new HttpError(401, '请先登录');

  if (pathname === '/api/time-points') {
    if (req.method === 'GET') {
      ensureDefaultTimePoints(user.id);
      sendJson(res, 200, { timePoints: getTimePoints(user.id) });
      return;
    }

    if (req.method === 'PUT') {
      enforceRateLimit(req, 'time-points-write', 60, 60 * 1000);
      const body = await readJsonBody(req);
      const timePoints = validateTimePoints(body.timePoints);

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM time_points WHERE user_id = ?').run(user.id);
        const insert = db.prepare(`
          INSERT INTO time_points (id, user_id, time_value, created_at)
          VALUES (?, ?, ?, ?)
        `);
        const now = Date.now();
        timePoints.forEach((timeValue) => {
          insert.run(crypto.randomUUID(), user.id, timeValue, now);
        });
        db.prepare(`
          UPDATE tasks SET time_slot = ?
          WHERE user_id = ? AND time_slot > ?
        `).run(timePoints.length, user.id, timePoints.length);
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch (rollbackError) { /* no-op */ }
        throw error;
      }

      sendJson(res, 200, { timePoints: getTimePoints(user.id) });
      return;
    }

    throw methodNotAllowed('GET, PUT');
  }

  if (pathname === '/api/tasks' && req.method === 'GET') {
    const rows = db.prepare(`
      SELECT * FROM tasks
      WHERE user_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(user.id);
    const completionsByTask = getCompletionsByTask(user.id);
    sendJson(res, 200, {
      tasks: rows.map((row) => rowToTask(row, completionsByTask.get(row.id) || []))
    });
    return;
  }

  if (pathname === '/api/tasks' && req.method === 'POST') {
    enforceRateLimit(req, 'task-write', 300, 60 * 1000);
    const body = await readJsonBody(req);
    const input = validateTaskInput(body);
    const id = crypto.randomUUID();
    const createdAt = Date.now();

    db.prepare(`
      INSERT INTO tasks (
        id, user_id, title, start_date, interval_days, color, note,
        task_type, window_mode, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      user.id,
      input.title,
      input.startDate,
      input.interval,
      input.color,
      input.note,
      input.type,
      input.windowMode,
      createdAt
    );

    sendJson(res, 201, {
      task: {
        id,
        title: input.title,
        startDate: input.startDate,
        interval: input.interval,
        color: input.color,
        note: input.note,
        type: input.type,
        windowMode: input.windowMode,
        timeSlot: 0,
        completions: [],
        createdAt
      }
    });
    return;
  }

  const slotMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/slot$/);
  if (slotMatch) {
    if (req.method !== 'PUT') throw methodNotAllowed('PUT');
    enforceRateLimit(req, 'task-write', 300, 60 * 1000);

    const id = decodeURIComponent(slotMatch[1]);
    const taskRow = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(id, user.id);
    if (!taskRow) throw new HttpError(404, '事项不存在');

    ensureDefaultTimePoints(user.id);
    const pointCount = Number(db.prepare(
      'SELECT COUNT(*) AS count FROM time_points WHERE user_id = ?'
    ).get(user.id).count);

    const body = await readJsonBody(req);
    const slot = Number(body.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > pointCount) {
      throw new HttpError(400, '时间区间位置不正确');
    }

    db.prepare('UPDATE tasks SET time_slot = ? WHERE id = ? AND user_id = ?')
      .run(slot, id, user.id);
    sendJson(res, 200, { taskId: id, timeSlot: slot });
    return;
  }

  const completionMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/completion$/);
  if (completionMatch) {
    if (req.method !== 'PUT' && req.method !== 'POST') throw methodNotAllowed('PUT, POST');

    const id = decodeURIComponent(completionMatch[1]);
    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, user.id);
    if (!taskRow) throw new HttpError(404, '事项不存在');

    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || typeof body.completed !== 'boolean') {
      throw new HttpError(400, 'completed 必须是布尔值');
    }
    if (!isValidISODate(body.date)) {
      throw new HttpError(400, '完成日期格式不正确');
    }

    const task = rowToTask(taskRow, []);
    const occurrenceKey = getOccurrenceKeyForDate(task, body.date);
    if (!occurrenceKey) {
      throw new HttpError(400, '该日期不属于此事项的出现区间');
    }

    if (body.completed) {
      const completedAt = Date.now();
      db.prepare(`
        INSERT INTO task_completions (task_id, occurrence_key, completed_date, completed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(task_id, occurrence_key) DO UPDATE SET
          completed_date = excluded.completed_date,
          completed_at = excluded.completed_at
      `).run(id, occurrenceKey, body.date, completedAt);

      sendJson(res, 200, {
        completion: {
          taskId: id,
          occurrenceKey,
          completedDate: body.date,
          completedAt
        }
      });
      return;
    }

    db.prepare('DELETE FROM task_completions WHERE task_id = ? AND occurrence_key = ?')
      .run(id, occurrenceKey);
    sendJson(res, 200, { completion: null, occurrenceKey });
    return;
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch) {
    const id = decodeURIComponent(taskMatch[1]);
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, user.id);
    if (!existing) throw new HttpError(404, '事项不存在');

    if (req.method === 'PUT' || req.method === 'PATCH') {
      enforceRateLimit(req, 'task-write', 300, 60 * 1000);
      const body = await readJsonBody(req);
      const input = validateTaskInput(body);
      db.prepare(`
        UPDATE tasks
        SET title = ?, start_date = ?, interval_days = ?, color = ?, note = ?,
            task_type = ?, window_mode = ?
        WHERE id = ? AND user_id = ?
      `).run(
        input.title,
        input.startDate,
        input.interval,
        input.color,
        input.note,
        input.type,
        input.windowMode,
        id,
        user.id
      );

      sendJson(res, 200, {
        task: {
          id,
          title: input.title,
          startDate: input.startDate,
          interval: input.interval,
          color: input.color,
          note: input.note,
          type: input.type,
          windowMode: input.windowMode,
          timeSlot: Number(existing.time_slot) || 0,
          completions: getTaskCompletions(id, user.id),
          createdAt: existing.created_at
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      enforceRateLimit(req, 'task-write', 300, 60 * 1000);
      db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, user.id);
      sendJson(res, 200, { ok: true });
      return;
    }

    throw methodNotAllowed('GET, PUT, PATCH, DELETE');
  }

  throw new HttpError(404, '接口不存在');
}

async function handleRegister(req, res) {
  enforceRateLimit(req, 'register', 5, 60 * 60 * 1000);

  const body = await readJsonBody(req);
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) throw new HttpError(409, '用户名已被使用');

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = await hashPassword(password, salt);
  const createdAt = Date.now();

  try {
    db.exec('BEGIN IMMEDIATE');
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    db.prepare(`
      INSERT INTO users (id, username, password_hash, password_salt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, username, passwordHash, salt, createdAt);

    if (Number(userCount) === 0) {
      if (process.env.CLAIM_LEGACY_TASKS === '1') {
        db.prepare('UPDATE tasks SET user_id = ? WHERE user_id IS NULL').run(id);
      }
      const legacySeeded = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('tasks_seeded');
      const ownedTaskCount = db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE user_id = ?').get(id).count;
      const unownedTaskCount = db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE user_id IS NULL').get().count;
      if (!legacySeeded && Number(ownedTaskCount) === 0 && Number(unownedTaskCount) === 0) {
        seedTasksForUser(id);
      }
    }

    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) { /* no-op */ }
    if (String(error.message).includes('UNIQUE')) {
      throw new HttpError(409, '用户名已被使用');
    }
    throw error;
  }

  createSession(req, res, id);
  sendJson(res, 201, { user: { id, username, createdAt } });
}

async function handleLogin(req, res) {
  enforceRateLimit(req, 'login', 10, 10 * 60 * 1000);

  const body = await readJsonBody(req);
  const username = typeof body.username === 'string' ? body.username.trim().normalize('NFKC') : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password || password.length > 128) {
    throw new HttpError(401, '用户名或密码不正确');
  }

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) {
    await hashPassword(password, '00000000000000000000000000000000');
    throw new HttpError(401, '用户名或密码不正确');
  }

  if (!(await verifyPassword(password, row.password_salt, row.password_hash))) {
    throw new HttpError(401, '用户名或密码不正确');
  }

  createSession(req, res, row.id);
  sendJson(res, 200, {
    user: { id: row.id, username: row.username, createdAt: row.created_at }
  });
}

function handleLogout(req, res) {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  clearSessionCookie(req, res);
  sendJson(res, 200, { ok: true });
}

function validateUsername(value) {
  const username = typeof value === 'string' ? value.trim().normalize('NFKC') : '';
  if (username.length < 3 || username.length > 24) {
    throw new HttpError(400, '用户名需为 3–24 个字符');
  }
  if (!/^[\p{L}\p{N}_-]+$/u.test(username)) {
    throw new HttpError(400, '用户名只能包含文字、数字、下划线或短横线');
  }
  return username;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8) {
    throw new HttpError(400, '密码至少需要 8 个字符');
  }
  if (value.length > 128) {
    throw new HttpError(400, '密码不能超过 128 个字符');
  }
  return value;
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(salt, 'hex'), PASSWORD_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString('hex'));
    });
  });
}

async function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(await hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createSession(req, res, userId) {
  cleanupExpiredSessions();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, tokenHash, now, expiresAt);

  const cookieParts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isSecureRequest(req)) cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearSessionCookie(req, res) {
  const cookieParts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isSecureRequest(req)) cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function getSessionUser(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const now = Date.now();
  const row = db.prepare(`
    SELECT u.id, u.username, u.created_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(hashToken(token));

  if (!row) return null;
  if (Number(row.expires_at) <= now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    return null;
  }
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

function cleanupExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const pairs = header.split(';');
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return null;
}

function isSecureRequest(req) {
  if (process.env.COOKIE_SECURE === '1') return true;
  if (process.env.COOKIE_SECURE === '0') return false;
  return Boolean(req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https';
}

function assertSameOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  const origin = req.headers.origin;
  if (!origin) return;

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const expected = `${protocol}://${host}`;
  if (origin !== expected) throw new HttpError(403, '跨站请求已被拒绝');
}

function enforceRateLimit(req, scope, limit, windowMs) {
  const now = Date.now();
  const key = `${scope}:${getClientIp(req)}`;
  const previous = rateLimitBuckets.get(key) || [];
  const recent = previous.filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    throw new HttpError(429, '操作过于频繁，请稍后再试');
  }
  recent.push(now);
  rateLimitBuckets.set(key, recent);

  if (rateLimitBuckets.size > 5000) {
    for (const [bucketKey, timestamps] of rateLimitBuckets) {
      if (!timestamps.some((timestamp) => now - timestamp < windowMs)) {
        rateLimitBuckets.delete(bucketKey);
      }
    }
  }
}

function getClientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

function methodNotAllowed(allow) {
  return new HttpError(405, `不支持的请求方法，允许：${allow}`);
}

function validateTaskInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, '请求内容格式不正确');
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw new HttpError(400, '请填写事项名称');
  if (title.length > 40) throw new HttpError(400, '事项名称不能超过 40 个字符');

  const startDate = typeof body.startDate === 'string' ? body.startDate : '';
  if (!isValidISODate(startDate)) throw new HttpError(400, '开始日期格式不正确');

  const type = body.type === 'window'
    ? 'window'
    : (body.type === 'once' ? 'once' : 'fixed');

  let interval = 1;
  if (type !== 'once') {
    interval = Number(body.interval);
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
      throw new HttpError(400, '重复间隔必须是 1–365 之间的整数');
    }
  }

  const color = typeof body.color === 'string' ? body.color : 'moss';
  if (!COLORS.has(color)) throw new HttpError(400, '标记颜色不正确');

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 120) throw new HttpError(400, '备注不能超过 120 个字符');

  const windowMode = type === 'window'
    ? (body.windowMode === 'continuous' ? 'continuous' : 'flexible')
    : null;

  return { title, startDate, interval, color, note, type, windowMode };
}

function getCompletionsByTask(userId) {
  const rows = db.prepare(`
    SELECT c.task_id, c.occurrence_key, c.completed_date, c.completed_at
    FROM task_completions c
    JOIN tasks t ON t.id = c.task_id
    WHERE t.user_id = ?
    ORDER BY c.completed_at ASC
  `).all(userId);
  const byTask = new Map();
  rows.forEach((row) => {
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, []);
    byTask.get(row.task_id).push({
      occurrenceKey: row.occurrence_key,
      completedDate: row.completed_date,
      completedAt: row.completed_at
    });
  });
  return byTask;
}

function getTaskCompletions(taskId, userId) {
  return db.prepare(`
    SELECT c.occurrence_key, c.completed_date, c.completed_at
    FROM task_completions c
    JOIN tasks t ON t.id = c.task_id
    WHERE c.task_id = ? AND t.user_id = ?
    ORDER BY c.completed_at ASC
  `).all(taskId, userId).map((row) => ({
    occurrenceKey: row.occurrence_key,
    completedDate: row.completed_date,
    completedAt: row.completed_at
  }));
}

function getOccurrenceKeyForDate(task, dateStr) {
  if (dateStr < task.startDate) return null;
  const start = parseISODate(task.startDate);
  const date = parseISODate(dateStr);
  const distance = diffDays(start, date);
  if (distance < 0) return null;

  if (task.type === 'once') {
    return dateStr === task.startDate ? dateStr : null;
  }

  if (task.type === 'window') {
    const cycleIndex = Math.floor(distance / task.interval);
    return toISODate(addDays(start, cycleIndex * task.interval));
  }

  if (distance % task.interval !== 0) return null;
  return dateStr;
}

function getTimePoints(userId) {
  return db.prepare(`
    SELECT id, time_value
    FROM time_points
    WHERE user_id = ?
    ORDER BY time_value ASC
  `).all(userId).map((row) => ({
    id: row.id,
    time: row.time_value
  }));
}

function ensureDefaultTimePoints(userId) {
  const count = Number(db.prepare(
    'SELECT COUNT(*) AS count FROM time_points WHERE user_id = ?'
  ).get(userId).count);
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO time_points (id, user_id, time_value, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const now = Date.now();
  DEFAULT_TIME_POINTS.forEach((timeValue) => {
    insert.run(crypto.randomUUID(), userId, timeValue, now);
  });
}

function validateTimePoints(value) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new HttpError(400, '至少需要保留一个时间点');
  }
  if (value.length > MAX_TIME_POINTS) {
    throw new HttpError(400, `最多支持 ${MAX_TIME_POINTS} 个时间点`);
  }

  const normalized = value.map((item) => {
    const timeValue = typeof item === 'string' ? item.trim() : '';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) {
      throw new HttpError(400, '时间点格式应为 HH:MM');
    }
    return timeValue;
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new HttpError(400, '时间点不能重复');
  }

  return normalized.sort();
}

function rowToTask(row, completions = []) {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    interval: row.interval_days,
    color: row.color,
    note: row.note,
    type: row.task_type || 'fixed',
    windowMode: row.window_mode || null,
    timeSlot: Number(row.time_slot) || 0,
    completions,
    createdAt: row.created_at
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, '请求内容过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new HttpError(400, 'JSON 格式不正确'));
      }
    });

    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { error: '不支持的请求方法' });
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname);
  } catch (error) {
    throw new HttpError(400, '路径格式不正确');
  }

  if (relativePath === '/' || relativePath === '') relativePath = '/index.html';

  if (!PUBLIC_FILES.has(relativePath)) {
    throw new HttpError(404, '页面不存在');
  }

  const filePath = path.resolve(ROOT_DIR, `.${relativePath}`);
  const relativeToRoot = path.relative(ROOT_DIR, filePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new HttpError(403, '禁止访问');
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    throw new HttpError(404, '页面不存在');
  }

  if (!stat.isFile()) throw new HttpError(404, '页面不存在');

  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  applySecurityHeaders(res);
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=300');

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  applySecurityHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseISODate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function diffDays(startDate, endDate) {
  const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((end - start) / 86400000);
}

function toISODate(date) {
  return toISO(date);
}

function startOfWeek(date) {
  const dayIndex = (date.getDay() + 6) % 7;
  return addDays(startOfDay(date), -dayIndex);
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务…`);
  server.close(() => {
    try {
      db.close();
    } catch (error) {
      console.error(error);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
