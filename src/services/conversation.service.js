const { v4: uuid } = require('uuid');
const db = require('../db/database');
const config = require('../config/env');
const ai = require('./ai.service');
const router = require('./assistants/router');
const billing = require('./billing.service');
const { normalizarTelefone } = require('../utils/phone');
const { agoraLocal } = require('../utils/time');

function findOrCreateUserByPhone(phone) {
  let user = db.prepare('SELECT * FROM users WHERE whatsapp_number = ?').get(phone);
  if (!user) {
    const id = uuid();
    db.prepare('INSERT INTO users (id, whatsapp_number) VALUES (?, ?)').run(id, phone);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  return user;
}

const hasActiveSubscription = (userId) => billing.temAssinaturaAtiva(userId);

function logEntrada(userId, content) {
  db.prepare(
    `INSERT INTO messages (id, user_id, direction, assistant, content) VALUES (?, ?, 'entrada', 'cliente', ?)`
  ).run(uuid(), userId, content);
}

function logOutgoing(userId, assistant, content) {
  db.prepare(
    `INSERT INTO messages (id, user_id, direction, assistant, content) VALUES (?, ?, 'saida', ?, ?)`
  ).run(uuid(), userId, assistant, content);
}

// Resposta para quem ainda não tem assinatura ativa. Serve de porta de entrada para a venda.
function respostaSemAssinatura(user) {
  const link = `${config.appUrl}/planos.html`;
  if (user.password_hash) {
    const sub = billing.getAssinatura(user.id);
    if (sub?.status === 'inadimplente') {
      return `Sua assinatura está com pagamento pendente. Regularize em ${link} para eu voltar a organizar tudo.`;
    }
    return `Sua assinatura não está ativa no momento. Escolha um plano em ${link} para eu voltar a te ajudar.`;
  }
  return `Oi! Sou a turma do Combinado. Para eu começar a organizar sua rotina, crie sua conta e escolha um plano em ${link}.`;
}

const pedidoCancelamento = /\b(cancelar|cancela|cancelamento)\b.*\bassinatura\b|\bassinatura\b.*\bcancel/i;

/**
 * Ponto único de entrada: recebe telefone + texto (do WhatsApp real ou do Playground)
 * e devolve a resposta a ser enviada.
 */
async function processIncomingMessage(rawPhone, text) {
  const phone = normalizarTelefone(rawPhone);
  const user = findOrCreateUserByPhone(phone);
  logEntrada(user.id, text);

  if (!hasActiveSubscription(user.id)) {
    const reply = respostaSemAssinatura(user);
    logOutgoing(user.id, 'sistema', reply);
    return reply;
  }

  if (pedidoCancelamento.test(text)) {
    let reply;
    try {
      const { url } = await billing.createPortalSession(user.id);
      reply = `*Combinado*\nPara cancelar, abra este link e escolha "Cancelar assinatura". Sem multa e sem fidelidade: ${url}`;
    } catch (err) {
      reply = '*Combinado*\nNão consegui gerar o link de cancelamento agora. Tente de novo em alguns minutos.';
    }
    logOutgoing(user.id, 'sistema', reply);
    return reply;
  }

  const { assistant, data } = await ai.interpretMessage(text, agoraLocal());
  const { assistant: quemRespondeu, reply } = router.route(user.id, assistant, data);

  logOutgoing(user.id, quemRespondeu, reply);
  return reply;
}

// Áudio, foto, documento e figurinha ainda não são processados. Responde com honestidade.
function respostaParaMidia(rawPhone, tipo) {
  const phone = normalizarTelefone(rawPhone);
  const user = findOrCreateUserByPhone(phone);
  logEntrada(user.id, `[${tipo}]`);

  if (!hasActiveSubscription(user.id)) {
    const reply = respostaSemAssinatura(user);
    logOutgoing(user.id, 'sistema', reply);
    return reply;
  }

  const reply = `*Combinado*\nAinda não consigo abrir ${tipo === 'audio' ? 'áudios' : 'esse tipo de arquivo'} por aqui. Pode me mandar em texto? Ex: "gastei 45 no mercado".`;
  logOutgoing(user.id, 'sistema', reply);
  return reply;
}

module.exports = {
  processIncomingMessage,
  respostaParaMidia,
  findOrCreateUserByPhone,
  hasActiveSubscription,
};
