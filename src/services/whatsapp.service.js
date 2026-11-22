const axios = require('axios');
const config = require('../config/env');

const endpoint = () =>
  `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;

async function enviar(body) {
  try {
    const { data } = await axios.post(endpoint(), body, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    return data;
  } catch (err) {
    const detalhe = err.response?.data?.error?.message || err.message;
    const e = new Error(`WhatsApp recusou o envio: ${detalhe}`);
    e.codigo = err.response?.data?.error?.code;
    throw e;
  }
}

// Mensagem de texto livre. Só chega ao cliente dentro da janela de 24h
// desde a última mensagem dele (regra da Meta).
async function sendMessage(toPhone, text) {
  if (config.isWhatsappDemo) {
    console.log(`\n[WhatsApp - modo demo] Para ${toPhone}:\n${text}\n`);
    return { demo: true };
  }
  return enviar({
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'text',
    text: { body: text, preview_url: false },
  });
}

// Template aprovado na Meta. Usado para avisos fora da janela de 24h (lembretes, avisos ao dono).
// O template precisa ter um único parâmetro de corpo, ex.: "{{1}}".
async function sendTemplate(toPhone, templateName, texto) {
  if (config.isWhatsappDemo) {
    console.log(`\n[WhatsApp - modo demo | template ${templateName}] Para ${toPhone}:\n${texto}\n`);
    return { demo: true };
  }
  // Parâmetros de template não aceitam quebra de linha nem espaços repetidos.
  const parametro = String(texto).replace(/\s*\n\s*/g, ' · ').replace(/ {4,}/g, ' ');
  return enviar({
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: parametro }] }],
    },
  });
}

module.exports = { sendMessage, sendTemplate };
