const { v4: uuid } = require('uuid');
const db = require('../../db/database');

function handle(userId, data) {
  if (data.query) {
    return listaPendencias(userId);
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO tasks (id, user_id, title, due_date, priority) VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, data.title, data.due_date || null, data.priority || 'normal');

  const prioridade = data.priority === 'alta' ? ' Marquei como prioridade.' : '';
  return `Guardei: "${data.title}".${prioridade}${data.due_date ? ` Aviso antes de ${data.due_date}.` : ''}`;
}

function listaPendencias(userId) {
  const tarefas = db
    .prepare(
      `SELECT title, due_date, priority FROM tasks
       WHERE user_id = ? AND status = 'pendente'
       ORDER BY (priority = 'alta') DESC, due_date ASC LIMIT 8`
    )
    .all(userId);

  if (tarefas.length === 0) {
    return 'Nenhuma pendência aberta no momento. 🎉';
  }

  const linhas = tarefas
    .map((t) => `• ${t.title}${t.due_date ? ' — até ' + t.due_date : ''}${t.priority === 'alta' ? ' (prioridade)' : ''}`)
    .join('\n');
  return `O que está pendente:\n${linhas}`;
}

module.exports = { handle };
