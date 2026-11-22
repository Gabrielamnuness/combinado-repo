const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db/database');
const config = require('../config/env');
const { createRateLimit } = require('../middleware/rateLimit');
const { normalizarTelefone, telefoneValido } = require('../utils/phone');
const owner = require('../services/owner.service');

const router = express.Router();
const limiteLogin = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

const emitirToken = (userId) => jwt.sign({ userId }, config.jwtSecret, { expiresIn: '30d' });

// Cria a conta do cliente e liga ela ao número de WhatsApp.
// Se o número já tiver conversado com a turma sem conta (cadastro via WhatsApp),
// a conta é completada, sem duplicar.
router.post('/register', limiteLogin, async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const whatsapp = normalizarTelefone(req.body?.whatsappNumber);

  if (!email || !password || !whatsapp) {
    return res.status(400).json({ error: 'Preencha e-mail, senha e número de WhatsApp.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Esse e-mail não parece válido.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  }
  if (!telefoneValido(whatsapp)) {
    return res.status(400).json({ error: 'WhatsApp inválido. Use DDD + número, ex.: 11 99999-9999.' });
  }

  const porEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (porEmail) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });

  const porWhatsapp = db.prepare('SELECT * FROM users WHERE whatsapp_number = ?').get(whatsapp);
  if (porWhatsapp?.password_hash) {
    return res.status(409).json({ error: 'Esse número de WhatsApp já tem uma conta. Entre com seu e-mail.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let userId;
  if (porWhatsapp) {
    db.prepare('UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?').run(
      name,
      email,
      passwordHash,
      porWhatsapp.id
    );
    userId = porWhatsapp.id;
  } else {
    userId = uuid();
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash, whatsapp_number) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, name, email, passwordHash, whatsapp);
  }

  owner.notificarCadastro({ nome: name, whatsapp, email }).catch(() => {});
  res.json({ token: emitirToken(userId), userId });
});

router.post('/login', limiteLogin, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.password_hash) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });

  res.json({ token: emitirToken(user.id), userId: user.id });
});

module.exports = router;
