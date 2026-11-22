const { v4: uuid } = require('uuid');
const config = require('../config/env');
const db = require('../db/database');
const owner = require('./owner.service');

const stripe = config.isBillingDemo ? null : require('stripe')(config.stripe.secretKey);

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

const paraData = (segundos) => (segundos ? new Date(segundos * 1000).toISOString() : null);

function listarPlanos() {
  return Object.values(config.planos).map(({ id, label, meses, precoTexto, equivalenteTexto }) => ({
    id,
    label,
    meses,
    precoTexto,
    equivalenteTexto,
  }));
}

function planoPorPriceId(priceId) {
  const achado = Object.values(config.planos).find((p) => p.priceId && p.priceId === priceId);
  return achado ? achado.id : null;
}

function getAssinatura(userId) {
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) || null;
}

function temAssinaturaAtiva(userId) {
  const sub = getAssinatura(userId);
  return !!sub && sub.status === 'ativa';
}

/**
 * Cria ou atualiza a assinatura do usuário (uma linha por usuário).
 */
function gravarAssinatura({
  userId,
  plano = null,
  status,
  customerId = null,
  subscriptionId = null,
  priceId = null,
  periodoFim = null,
}) {
  const existente = getAssinatura(userId);
  if (existente) {
    db.prepare(
      `UPDATE subscriptions SET
         plan = COALESCE(?, plan),
         status = ?,
         stripe_customer_id = COALESCE(?, stripe_customer_id),
         stripe_subscription_id = COALESCE(?, stripe_subscription_id),
         stripe_price_id = COALESCE(?, stripe_price_id),
         current_period_end = COALESCE(?, current_period_end),
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`
    ).run(plano, status, customerId, subscriptionId, priceId, periodoFim, userId);
  } else {
    db.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, status, stripe_customer_id, stripe_subscription_id, stripe_price_id, current_period_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(uuid(), userId, plano, status, customerId, subscriptionId, priceId, periodoFim);
  }
}

function atualizarPorStripeSub(subscriptionId, campos) {
  const row = db
    .prepare('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?')
    .get(subscriptionId);
  if (!row) return null;
  gravarAssinatura({ userId: row.user_id, status: campos.status, periodoFim: campos.periodoFim });
  return row.user_id;
}

/**
 * Cria a sessão de Checkout do Stripe para o plano escolhido.
 * plano: 'mensal' | 'trimestral' | 'anual'
 */
async function createCheckoutSession(userId, planoId) {
  const plano = config.planos[planoId];
  if (!plano) throw erro(400, 'Escolha um plano válido: mensal, trimestral ou anual.');

  if (config.isBillingDemo) {
    if (config.isProduction && !config.allowDemoBilling) {
      throw erro(503, 'Pagamentos ainda não estão configurados. Tente novamente mais tarde.');
    }
    // Modo demo: ativa direto, sem cobrar. Só para testar o fluxo.
    gravarAssinatura({ userId, plano: plano.id, status: 'ativa', priceId: null });
    return { demo: true, url: `${config.appUrl}/planos.html?demo=ativado` };
  }

  if (!plano.priceId) {
    throw erro(503, `O plano ${plano.label} ainda não tem preço configurado no Stripe.`);
  }
  if (temAssinaturaAtiva(userId)) {
    throw erro(409, 'Você já tem uma assinatura ativa.');
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: plano.priceId, quantity: 1 }],
    locale: 'pt-BR',
    success_url: `${config.appUrl}/planos.html?sucesso=1`,
    cancel_url: `${config.appUrl}/planos.html?cancelado=1`,
    client_reference_id: userId,
    customer_email: user?.email || undefined,
    allow_promotion_codes: true,
    metadata: { userId, plano: plano.id, whatsappNumber: user?.whatsapp_number || '' },
    subscription_data: { metadata: { userId, plano: plano.id } },
  });

  return { url: session.url };
}

/**
 * Link do portal do cliente no Stripe (trocar cartão, cancelar, ver faturas).
 */
async function createPortalSession(userId) {
  const sub = getAssinatura(userId);
  if (config.isBillingDemo) {
    return { demo: true, url: `${config.appUrl}/planos.html` };
  }
  if (!sub?.stripe_customer_id) {
    throw erro(404, 'Não encontrei uma assinatura paga para essa conta.');
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${config.appUrl}/planos.html`,
  });
  return { url: portal.url };
}

function statusDoStripe(status) {
  if (status === 'active' || status === 'trialing') return 'ativa';
  if (status === 'past_due' || status === 'unpaid') return 'inadimplente';
  if (status === 'incomplete') return 'inativa'; // primeira cobrança ainda não confirmada
  return 'cancelada';
}

/**
 * Processa eventos do Stripe (já validados pela assinatura do webhook).
 * Todos os handlers são idempotentes: o Stripe pode reenviar o mesmo evento.
 */
async function handleWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription' || !session.subscription) break;

      const userId = session.client_reference_id || session.metadata?.userId;
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      const priceId = sub.items?.data?.[0]?.price?.id || null;
      const plano = planoPorPriceId(priceId) || session.metadata?.plano || null;
      if (!userId) break;

      gravarAssinatura({
        userId,
        plano,
        status: statusDoStripe(sub.status),
        customerId: session.customer,
        subscriptionId: sub.id,
        priceId,
        periodoFim: paraData(sub.current_period_end),
      });
      break;
    }

    case 'invoice.paid': {
      const fatura = event.data.object;
      if (!fatura.subscription) break;

      const row = db
        .prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?')
        .get(fatura.subscription);
      if (!row) break;

      const periodoFim = paraData(fatura.lines?.data?.[0]?.period?.end);
      gravarAssinatura({ userId: row.user_id, status: 'ativa', periodoFim });

      // Registra o recebimento uma única vez por fatura.
      const registro = db
        .prepare(
          `INSERT OR IGNORE INTO recebimentos
             (id, user_id, subscription_id, plan, valor_centavos, moeda, recebedor, stripe_invoice_id, stripe_event_id, periodo_fim)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          uuid(),
          row.user_id,
          row.id,
          row.plan,
          fatura.amount_paid,
          fatura.currency || 'brl',
          config.owner.recebedor,
          fatura.id,
          event.id,
          periodoFim
        );

      if (registro.changes > 0) {
        const cliente = db.prepare('SELECT name, whatsapp_number FROM users WHERE id = ?').get(row.user_id);
        const valor = (fatura.amount_paid / 100).toFixed(2).replace('.', ',');
        await owner.notificar(
          `💰 Pagamento confirmado\n${cliente?.name || cliente?.whatsapp_number || 'Cliente'} · plano ${row.plan} · R$ ${valor}`,
          'pagamento'
        );
      }
      break;
    }

    case 'invoice.payment_failed': {
      const fatura = event.data.object;
      if (fatura.subscription) atualizarPorStripeSub(fatura.subscription, { status: 'inadimplente' });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const priceId = sub.items?.data?.[0]?.price?.id || null;
      const row = db
        .prepare('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?')
        .get(sub.id);
      if (!row) break;
      gravarAssinatura({
        userId: row.user_id,
        plano: planoPorPriceId(priceId),
        status: statusDoStripe(sub.status),
        priceId,
        periodoFim: paraData(sub.current_period_end),
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      atualizarPorStripeSub(sub.id, { status: 'cancelada' });
      break;
    }

    default:
      break;
  }
}

module.exports = {
  stripe,
  listarPlanos,
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
  temAssinaturaAtiva,
  getAssinatura,
  gravarAssinatura,
};
