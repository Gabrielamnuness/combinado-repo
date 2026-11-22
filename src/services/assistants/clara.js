const { v4: uuid } = require('uuid');
const db = require('../../db/database');

function handle(userId, data) {
  if (data.query) {
    return proximosCompromissos(userId);
  }

  // Aceita "2026-11-26T15:00" ou "2026-11-26 15:00" e guarda sempre "YYYY-MM-DD HH:MM".
  const inicio = data.start_time ? String(data.start_time).replace('T', ' ').slice(0, 16) : null;

  const id = uuid();
  db.prepare(
    `INSERT INTO events (id, user_id, title, start_time) VALUES (?, ?, ?, ?)`
  ).run(id, userId, data.title, inicio);

  if (inicio && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(inicio)) {
    const [d, h] = inicio.split(' ');
    const [, mes, dia] = d.split('-');
    return `Combinado. "${data.title}" marcado para ${dia}/${mes} às ${h}. Aviso 1h antes.`;
  }
  return `Anotei "${data.title}" na agenda. Me diga o dia e a hora quando souber.`;
}

function proximosCompromissos(userId) {
  const eventos = db
    .prepare(
      `SELECT title, start_time FROM events
       WHERE user_id = ? AND (start_time IS NULL OR date(start_time) >= date('now'))
       ORDER BY start_time ASC LIMIT 5`
    )
    .all(userId);

  if (eventos.length === 0) {
    return 'Sua agenda está livre por enquanto.';
  }

  const linhas = eventos
    .map((e) => `• ${e.title}${e.start_time ? ' — ' + e.start_time : ''}`)
    .join('\n');
  return `Seus próximos compromissos:\n${linhas}`;
}

module.exports = { handle };
