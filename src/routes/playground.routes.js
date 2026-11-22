const express = require('express');
const config = require('../config/env');
const conversation = require('../services/conversation.service');

const router = express.Router();

// Simulador de WhatsApp. Não tem autenticação, então em produção fica desligado
// (PLAYGROUND_ENABLED=1 liga, se for preciso).
router.post('/message', async (req, res) => {
  if (!config.playgroundEnabled) return res.sendStatus(404);

  const { phone, text } = req.body || {};
  if (!phone || !text) return res.status(400).json({ error: 'Envie phone e text.' });

  try {
    const reply = await conversation.processIncomingMessage(phone, String(text));
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar a mensagem.' });
  }
});

module.exports = router;
