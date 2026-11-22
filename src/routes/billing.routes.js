const express = require('express');
const { requireAuth } = require('../middleware/auth');
const billing = require('../services/billing.service');
const config = require('../config/env');

const router = express.Router();

const erroHttp = (res, err, padrao) =>
  res.status(err.status || 500).json({ error: err.status ? err.message : padrao });

// Lista de planos com os textos de preço (o front não precisa repetir os valores).
router.get('/planos', (req, res) => {
  res.json({ planos: billing.listarPlanos(), modoDemo: config.isBillingDemo });
});

// Cliente logado escolhe o plano e recebe o link de pagamento do Stripe.
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const result = await billing.createCheckoutSession(req.userId, req.body?.plan);
    res.json(result);
  } catch (err) {
    if (!err.status) console.error(err);
    erroHttp(res, err, 'Não consegui criar o pagamento agora. Tente de novo em instantes.');
  }
});

// Link do portal do Stripe para trocar cartão, ver faturas ou cancelar.
router.post('/portal', requireAuth, async (req, res) => {
  try {
    res.json(await billing.createPortalSession(req.userId));
  } catch (err) {
    if (!err.status) console.error(err);
    erroHttp(res, err, 'Não consegui abrir o portal agora. Tente de novo em instantes.');
  }
});

router.get('/status', requireAuth, (req, res) => {
  const sub = billing.getAssinatura(req.userId);
  res.json({ subscription: sub || null });
});

// Chamada pelo Stripe (não pelo navegador). O server monta req.body como Buffer cru
// antes do express.json, então a assinatura do webhook pode ser validada.
router.post('/webhook', async (req, res) => {
  if (config.isBillingDemo) return res.status(200).send('modo demo, nada a processar');

  let event;
  try {
    event = billing.stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      config.stripe.webhookSecret
    );
  } catch (err) {
    console.error('Webhook do Stripe com assinatura inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await billing.handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    // 500 faz o Stripe reenviar o evento depois.
    console.error(`Erro processando evento ${event.type}:`, err);
    res.status(500).json({ error: 'erro ao processar evento' });
  }
});

module.exports = router;
