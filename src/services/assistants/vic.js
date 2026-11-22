const { v4: uuid } = require('uuid');
const db = require('../../db/database');

function handle(userId, data) {
  if (data.query) {
    return buscarDocumento(userId, data.description);
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO documents (id, user_id, filename, description, category) VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, data.filename || null, data.description, data.category || 'Geral');

  return `Guardado em ${data.category}. Quando precisar, é só pedir pra eu achar.`;
}

function buscarDocumento(userId, termo) {
  const docs = db
    .prepare(
      `SELECT description, category, created_at FROM documents
       WHERE user_id = ? AND description LIKE ?
       ORDER BY created_at DESC LIMIT 5`
    )
    .all(userId, `%${termo.split(' ').slice(-3).join(' ')}%`);

  if (docs.length === 0) {
    return 'Não achei nada parecido nos seus documentos. Pode descrever de outro jeito?';
  }

  const linhas = docs.map((d) => `• ${d.description} (${d.category})`).join('\n');
  return `Achei isso:\n${linhas}`;
}

module.exports = { handle };
