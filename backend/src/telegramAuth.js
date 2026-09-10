// Проверка подписи initData, которую Telegram Web App передаёт на фронт.
// Алгоритм из официальной документации Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app

const crypto = require('crypto');

/**
 * Проверяет initData и возвращает распарсенные данные пользователя,
 * либо null, если подпись невалидна или данные устарели.
 *
 * @param {string} initData - сырая строка initData от Telegram.WebApp.initData
 * @param {string} botToken - токен бота
 * @param {number} maxAgeSeconds - максимальный возраст initData (защита от replay), по умолчанию 24 часа
 */
function verifyInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  // secret_key = HMAC_SHA256(bot_token, "WebAppData")
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    return null; // initData слишком старый — просим переоткрыть апп
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user'));
  } catch (e) {
    return null;
  }
  if (!user || !user.id) return null;

  return user; // { id, first_name, username, ... }
}

module.exports = { verifyInitData };
