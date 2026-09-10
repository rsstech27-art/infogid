-- Схема БД для Telegram Mini App "Гид"
-- Одна основная сущность: пользователь Telegram + его доступ + прогресс по шагам

CREATE TABLE IF NOT EXISTS users (
    telegram_id     BIGINT PRIMARY KEY,        -- user_id из Telegram Web App initData
    username        TEXT,                      -- @username на момент первого входа (может быть NULL)
    first_name      TEXT,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),  -- момент первого захода — от него считаем 3 месяца
    access_expires_at TIMESTAMPTZ NOT NULL,     -- first_seen_at + 3 месяца, вычисляется при создании
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Прогресс по шагам инструкции. step_id — строковый идентификатор шага
-- (берётся из steps.json на фронте/бэке), не из отдельной таблицы шагов,
-- чтобы можно было менять контент инструкции, не трогая миграции.
CREATE TABLE IF NOT EXISTS step_progress (
    telegram_id     BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    step_id         TEXT NOT NULL,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (telegram_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_step_progress_telegram_id ON step_progress(telegram_id);
