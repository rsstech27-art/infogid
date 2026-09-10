// Простой раннер миграций: выполняет все .sql файлы из папки migrations по порядку.
// Для проекта такого размера полноценный migration-фреймворк избыточен.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function main() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`Применяю миграцию: ${file}`);
    await pool.query(sql);
  }

  console.log('Миграции применены.');
  await pool.end();
}

main().catch((err) => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
