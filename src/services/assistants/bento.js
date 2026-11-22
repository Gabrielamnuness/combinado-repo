const { v4: uuid } = require('uuid');
const db = require('../../db/database');

// Formato brasileiro: 1234.5 -> "1.234,50"
const reais = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function handle(userId, data) {
  if (data.query) {
    return resumoDoMes(userId);
  }

  const valor = Number(data.amount);
  if (!Number.isFinite(valor) || valor <= 0) {
    return 'Não consegui identificar o valor. Pode mandar de novo com o número? Ex: "gastei 45 no mercado".';
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO expenses (id, user_id, amount, category, description, payment_method)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, valor, data.category || 'Outros', data.description || '', data.payment_method || null);

  const total = totalDoMes(userId);

  return `Anotado em ${data.category || 'Outros'}. Esse mês já foram R$ ${reais(total)}.`;
}

function totalDoMes(userId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) as total FROM expenses
       WHERE user_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    )
    .get(userId);
  return row.total;
}

function resumoDoMes(userId) {
  const total = totalDoMes(userId);
  const porCategoria = db
    .prepare(
      `SELECT category, SUM(amount) as total FROM expenses
       WHERE user_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
       GROUP BY category ORDER BY total DESC`
    )
    .all(userId);

  if (porCategoria.length === 0) {
    return 'Ainda não tenho nenhum gasto registrado esse mês.';
  }

  const linhas = porCategoria.map((c) => `• ${c.category}: R$ ${reais(c.total)}`).join('\n');
  return `Esse mês, R$ ${reais(total)} no total:\n${linhas}`;
}

module.exports = { handle };
