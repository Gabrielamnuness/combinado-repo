require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Planos vendidos. Os valores em centavos têm que bater com os Prices criados no Stripe.
// O cliente vê os textos vindos de GET /billing/planos, então o preço fica em um lugar só.
const PLANOS = {
  mensal: {
    id: 'mensal',
    label: 'Mensal',
    meses: 1,
    valorCentavos: 5490,
    precoTexto: 'R$ 54,90/mês',
    equivalenteTexto: 'sem compromisso, cancele quando quiser',
    priceId: process.env.STRIPE_PRICE_ID_MENSAL || '',
  },
  trimestral: {
    id: 'trimestral',
    label: 'Trimestral',
    meses: 3,
    valorCentavos: 11970,
    precoTexto: 'R$ 119,70 a cada 3 meses',
    equivalenteTexto: 'R$ 39,90/mês',
    priceId: process.env.STRIPE_PRICE_ID_TRIMESTRAL || '',
  },
  anual: {
    id: 'anual',
    label: 'Anual',
    meses: 12,
    valorCentavos: 33480,
    precoTexto: 'R$ 334,80 por ano',
    equivalenteTexto: 'R$ 27,90/mês',
    priceId: process.env.STRIPE_PRICE_ID_ANUAL || '',
  },
};

const config = {
  isProduction,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'dev-secret-troque-isso'),
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
    timeoutMs: 15000,
  },

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    // App Secret do app da Meta: usado para validar a assinatura de cada webhook recebido.
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    // Templates aprovados na Meta. Fora da janela de 24h só templates podem ser enviados.
    templateLembrete: process.env.WHATSAPP_TEMPLATE_LEMBRETE || '',
    templateDono: process.env.WHATSAPP_TEMPLATE_DONO || '',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  // Quem recebe o dinheiro. O destino do depósito é a conta bancária cadastrada
  // no Stripe; aqui ficam só o nome que aparece nos registros e o WhatsApp que
  // recebe o aviso a cada cadastro ou pagamento novo.
  owner: {
    nome: process.env.OWNER_NOME || '',
    recebedor: process.env.OWNER_RECEBEDOR || process.env.OWNER_NOME || 'Recebedor não configurado',
    whatsapp: process.env.OWNER_WHATSAPP || '',
  },

  adminToken: process.env.ADMIN_TOKEN || '',
  playgroundEnabled: process.env.PLAYGROUND_ENABLED
    ? process.env.PLAYGROUND_ENABLED === '1'
    : !isProduction,
  allowDemoBilling: process.env.ALLOW_DEMO_BILLING === '1',

  planos: PLANOS,

  get isAiDemo() {
    return !this.anthropic.apiKey;
  },
  get isWhatsappDemo() {
    return !this.whatsapp.token || !this.whatsapp.phoneNumberId;
  },
  get isBillingDemo() {
    return !this.stripe.secretKey;
  },
};

module.exports = config;
