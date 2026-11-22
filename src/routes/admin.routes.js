const express = require('express');
const crypto = require('crypto');
const config = require('../config/env');
const db = require('../db/database');

const router = express.Router();

// Acesso por token secreto (ADMIN_TOKEN) enviado no cabeçalho x-admin-token.
function exigirAdmin(req, res, next) {
  const esperado = config.adminToken;
  const recebido = req.get('x-admin-token') || '';
  if (!esperado || esperado.length < 16) return res.sendStatus(404);
  const ok =
    recebido.length === esperado.length &&
    crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
  if (!ok) return res.sendStatus(401);
  next();
}

router.get('/resumo', exigirAdmin, (req, res) => {
  const cadastros = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END) AS com_conta
         FROM users`
    )
    .get();

  const porStatus = db
    .prepare('SELECT status, plan, COUNT(*) AS total FROM subscriptions GROUP BY status, plan ORDER BY status, plan')
    .all();

  const recebidoNoMes = db
    .prepare(
      `SELECT COALESCE(SUM(valor_centavos), 0) AS centavos, COUNT(*) AS pagamentos
         FROM recebimentos
        WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    )
    .get();

  const ultimosRecebimentos = db
    .prepare(
      `SELECT r.plan, r.valor_centavos, r.recebedor, r.created_at, u.name, u.whatsapp_number
         FROM recebimentos r JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at DESC LIMIT 20`
    )
    .all();

  res.json({
    recebedor: config.owner.recebedor,
    cadastros,
    assinaturas: porStatus,
    recebidoNoMes: {
      reais: recebidoNoMes.centavos / 100,
      pagamentos: recebidoNoMes.pagamentos,
    },
    ultimosRecebimentos,
  });
});

module.exports = router;
