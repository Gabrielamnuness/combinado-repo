const config = require('../config/env');
const whatsapp = require('./whatsapp.service');

/**
 * Avisa o dono do negócio (você) sobre cadastros e pagamentos novos.
 * Nunca derruba o fluxo do cliente: se o aviso falhar, só registra no log.
 *
 * Fora da janela de 24h o WhatsApp só aceita template. Com WHATSAPP_TEMPLATE_DONO
 * definido, o aviso sai por template; sem ele, sai como texto livre.
 */
async function notificar(texto) {
  console.log(`[dono] ${texto.replace(/\n/g, ' | ')}`);
  if (!config.owner.whatsapp || config.isWhatsappDemo) return;

  try {
    if (config.whatsapp.templateDono) {
      await whatsapp.sendTemplate(config.owner.whatsapp, config.whatsapp.templateDono, texto);
    } else {
      await whatsapp.sendMessage(config.owner.whatsapp, texto);
    }
  } catch (err) {
    console.error('[dono] não consegui avisar:', err.message);
  }
}

function notificarCadastro({ nome, whatsapp, email }) {
  return notificar(`🆕 Novo cadastro\n${nome || 'Sem nome'} · ${whatsapp} · ${email}`);
}

module.exports = { notificar, notificarCadastro };
