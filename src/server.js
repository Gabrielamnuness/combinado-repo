const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/env');

require('./db/database'); // garante que o banco e as tabelas existem

const authRoutes = require('./routes/auth.routes');
const billingRoutes = require('./routes/billing.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const playgroundRoutes = require('./routes/playground.routes');
const adminRoutes = require('./routes/admin.routes');
const { iniciarLembretes } = require('./services/reminders.service');

// Em produção, não sobe com segredos fracos ou ausentes.
if (config.isProduction) {
  const problemas = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) problemas.push('JWT_SECRET (mínimo 32 caracteres)');
  if (!config.appUrl.startsWith('https://')) problemas.push('APP_URL (precisa começar com https://)');
  if (!config.whatsapp.verifyToken) problemas.push('WHATSAPP_VERIFY_TOKEN');
  if (problemas.length) {
    console.error('Configuração incompleta para produção:\n - ' + problemas.join('\n - '));
    process.exit(1);
  }
}

const app = express();

app.use(cors());

// Webhook do Stripe: precisa do corpo cru para validar a assinatura. Vem antes do express.json.
app.use('/billing/webhook', express.raw({ type: '*/*', limit: '1mb' }));

// Guarda o corpo cru também para o webhook do WhatsApp (validação HMAC).
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/auth', authRoutes);
app.use('/billing', billingRoutes);
app.use('/whatsapp', whatsappRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/playground', playgroundRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    modoDemo: {
      ia: config.isAiDemo,
      whatsapp: config.isWhatsappDemo,
      cobranca: config.isBillingDemo,
    },
  });
});

app.listen(config.port, () => {
  console.log(`\nCombinado rodando em ${config.appUrl}`);
  console.log(`→ Landing:    ${config.appUrl}/index.html`);
  console.log(`→ Planos:     ${config.appUrl}/planos.html`);
  console.log(`→ Painel:     ${config.appUrl}/dashboard.html`);
  console.log(`→ WhatsApp:   ${config.appUrl}/whatsapp/webhook`);
  console.log(`→ Stripe:     ${config.appUrl}/billing/webhook`);
  if (config.isAiDemo) console.log('⚠ ANTHROPIC_API_KEY não definida — usando classificador simples (modo demo).');
  if (config.isWhatsappDemo) console.log('⚠ WhatsApp não configurado — mensagens só aparecem no console e no Playground.');
  if (config.isBillingDemo) console.log('⚠ STRIPE_SECRET_KEY não definida — assinaturas são ativadas sem cobrança (modo demo).');
  if (config.playgroundEnabled) console.log('ℹ Playground ligado (simulador sem login).');
  console.log('');

  iniciarLembretes();
});
