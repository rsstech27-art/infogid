# Деплой на vps.su

Ниже — пошагово, что сделать на сервере, чтобы гид заработал на поддомене (например, `gid.ai-rss.ru`).

## 1. DNS

В панели, где управляется домен `ai-rss.ru`, добавить A-запись:

```
gid.ai-rss.ru → IP твоего VPS
```

Подождать, пока запись разойдётся (обычно от нескольких минут до пары часов).

## 2. Node.js и PM2

На сервере (Ubuntu/Debian):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

## 3. Postgres

```bash
sudo apt-get install -y postgresql
sudo -u postgres psql -c "CREATE USER gid_user WITH PASSWORD 'придумай_пароль';"
sudo -u postgres psql -c "CREATE DATABASE gid_db OWNER gid_user;"
```

## 4. Код на сервере

Залить папку `backend/` и `frontend/` на сервер (через git, scp или rsync — как удобнее). Дальше в `backend/`:

```bash
cp .env.example .env
# открыть .env и вписать:
#   BOT_TOKEN — токен от @BotFather
#   DATABASE_URL — postgres://gid_user:пароль@localhost:5432/gid_db
npm install
npm run migrate
pm2 start src/index.js --name gid-backend
pm2 save
```

## 5. Nginx + HTTPS

Установить nginx и certbot, если ещё нет:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Конфиг `/etc/nginx/sites-available/gid.ai-rss.ru`:

```nginx
server {
    listen 80;
    server_name gid.ai-rss.ru;

    # Отдаём фронт мини-аппа как статику
    root /var/www/gid/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Скопировать `frontend/index.html` в `/var/www/gid/frontend/`, включить конфиг и выпустить сертификат:

```bash
sudo ln -s /etc/nginx/sites-available/gid.ai-rss.ru /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gid.ai-rss.ru
```

Telegram Web App **обязательно** требует HTTPS — без сертификата приложение не откроется.

## 6. Бот в @BotFather

1. Написать @BotFather → `/newbot` (если бота ещё нет) или выбрать существующего.
2. `/mybots` → выбрать бота → `Bot Settings` → `Menu Button` → `Configure Menu Button` → указать URL: `https://gid.ai-rss.ru`.
3. Токен бота, который выдаст BotFather, — это и есть `BOT_TOKEN` в `.env` на сервере.

После этого в чате с ботом появится кнопка меню, открывающая гид.

## 7. Проверка

Открыть бота в Telegram, нажать кнопку меню — должен открыться список шагов. Пройти шаг, закрыть и снова открыть апп — прогресс должен сохраниться (это можно проверить в step_progress через psql).

## Что нужно будет от тебя перед запуском

- Реальный контент шагов вместо заглушек в `backend/steps.json`.
- Скриншоты — положить в `/var/www/gid/frontend/screenshots/` под именами, указанными в `steps.json` (`step-1.png` и т.д.).
