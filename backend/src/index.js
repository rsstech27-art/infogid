require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { verifyInitData } = require('./telegramAuth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const ACCESS_DAYS = Number(process.env.ACCESS_DAYS || 90);

const stepsPath = path.join(__dirname, '..', 'steps.json');

// Достаём и проверяем initData из заголовка на каждый защищённый запрос.
// Фронт кладёт его в заголовок X-Telegram-Init-Data.
function requireTelegramUser(req, res, next) {
  const initData = req.header('X-Telegram-Init-Data');
  const user = verifyInitData(initData, BOT_TOKEN);
  if (!user) {
    return res.status(401).json({ error: 'invalid_init_data' });
  }
  req.telegramUser = user;
  next();
}

// Рекурсивно собирает id "листовых" шагов (без подшагов) — только они
// реально отмечаются пройденными и считаются в прогресс.
function collectLeafIds(steps) {
  let out = [];
  (steps || []).forEach((s) => {
    if (s.children && s.children.length) {
      out = out.concat(collectLeafIds(s.children));
    } else {
      out.push(s.id);
    }
  });
  return out;
}

// GET /api/steps — отдаёт контент инструкции (без привязки к пользователю)
app.get('/api/steps', (req, res) => {
  const data = JSON.parse(fs.readFileSync(stepsPath, 'utf8'));
  res.json(data);
});

// POST /api/init — вызывается при каждом открытии мини-аппа.
// Если пользователь новый — создаёт запись и запускает отсчёт доступа.
// Возвращает статус доступа и текущий прогресс.
app.post('/api/init', requireTelegramUser, async (req, res) => {
  const { id, username, first_name: firstName } = req.telegramUser;

  const existing = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [id]);

  let userRow;
  if (existing.rows.length === 0) {
    const insertResult = await pool.query(
      `INSERT INTO users (telegram_id, username, first_name, first_seen_at, access_expires_at)
       VALUES ($1, $2, $3, now(), now() + ($4 || ' days')::interval)
       RETURNING *`,
      [id, username || null, firstName || null, ACCESS_DAYS]
    );
    userRow = insertResult.rows[0];
  } else {
    userRow = existing.rows[0];
  }

  const accessExpired = new Date(userRow.access_expires_at).getTime() < Date.now();

  if (accessExpired) {
    return res.json({
      access: {
        expired: true,
        expiresAt: userRow.access_expires_at,
      },
    });
  }

  const progressResult = await pool.query(
    'SELECT step_id FROM step_progress WHERE telegram_id = $1',
    [id]
  );
  const completedSteps = progressResult.rows.map((r) => r.step_id);

  res.json({
    access: {
      expired: false,
      expiresAt: userRow.access_expires_at,
    },
    completedSteps,
  });
});

// POST /api/progress { stepId } — отметить шаг пройденным.
// Принимает только id "листовых" шагов — у шага с подшагами своей
// собственной галочки нет, прогресс идёт по вложенным.
app.post('/api/progress', requireTelegramUser, async (req, res) => {
  const { id } = req.telegramUser;
  const { stepId } = req.body;
  if (!stepId) return res.status(400).json({ error: 'stepId_required' });

  const data = JSON.parse(fs.readFileSync(stepsPath, 'utf8'));
  const leafIds = collectLeafIds(data.steps);
  if (!leafIds.includes(stepId)) {
    return res.status(400).json({ error: 'unknown_or_non_leaf_step' });
  }

  // Проверяем доступ ещё раз — на случай, если он истёк между открытием аппа и этим запросом
  const userResult = await pool.query('SELECT access_expires_at FROM users WHERE telegram_id = $1', [id]);
  if (userResult.rows.length === 0) return res.status(404).json({ error: 'user_not_found' });
  const expired = new Date(userResult.rows[0].access_expires_at).getTime() < Date.now();
  if (expired) return res.status(403).json({ error: 'access_expired' });

  await pool.query(
    `INSERT INTO step_progress (telegram_id, step_id)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id, step_id) DO NOTHING`,
    [id, stepId]
  );

  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});
