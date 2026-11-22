const express = require('express');
const crypto = require('crypto');
const config = require('../config/env');
const db = require('../db/database');
const conversation = require('../services/conversation.service');
const whatsapp = require('../services/whatsapp.service');

const router = express.Router();

// A Meta chama esse GET uma vez, para confirmar que o webhook é seu.
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && config.whatsapp.verifyToken && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret).
// Sem App Secret: aceita só em desenvolvimento. Em produção, recusa.
function assinaturaValida(req) {
  const segredo = config.whatsapp.appSecret;
  if (!segredo) return !config.isProduction;

  const recebida = req.get('x-hub-signature-256') || '';
  const esperada = 'sha256=' + crypto.createHmac('sha256', segredo).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  if (recebida.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recebida), Buffer.from(esperada));
}

// Mensagens reais dos clientes chegam aqui.
router.post('/webhook', async (req, res) => {
  if (!assinaturaValida(req)) {
    console.error('[whatsapp] webhook com assinatura inválida, ignorado');
    return res.sendStatus(403);
  }
  res.sendStatus(200); // responde rápido: a Meta reenvia se demorar

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return; // ex.: atualização de status de entrega

    // Dedupe: se já processamos esse id, ignora o reenvio.
    const novo = db
      .prepare('INSERT OR IGNORE INTO whatsapp_mensagens_processadas (message_id) VALUES (?)')
      .run(message.id);
    if (novo.changes === 0) return;

    const from = message.from;
    let reply;
    const textoDoBotao =
      message.button?.text ||
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      '';

    if (message.type === 'text' && message.text?.body) {
      reply = await conversation.processIncomingMessage(from, message.text.body);
    } else if (textoDoBotao) {
      reply = await conversation.processIncomingMessage(from, textoDoBotao);
    } else {
      reply = conversation.respostaParaMidia(from, message.type);
    }

    if (reply) await whatsapp.sendMessage(from, reply);
  } catch (err) {
    console.error('Erro processando mensagem do WhatsApp:', err);
  }
});

module.exports = router;
