const db = require('../db/database');
const config = require('../config/env');
const whatsapp = require('./whatsapp.service');
const { agoraLocal, somaMinutos, somaDias } = require('../utils/time');

// Envia um lembrete. Usa template quando configurado (funciona fora da janela de 24h).
// Cada lembrete é marcado como tratado depois da tentativa, mesmo que o envio falhe,
// para não ficar tentando a cada minuto.
async function enviar(numero, texto) {
  try {
    if (config.whatsapp.templateLembrete) {
      await whatsapp.sendTemplate(numero, config.whatsapp.templateLembrete, texto);
    } else {
      await whatsapp.sendMessage(numero, texto);
    }
  } catch (err) {
    console.error(`[lembretes] não enviei para ${numero}: ${err.message}`);
  }
}

/**
 * Roda uma rodada de lembretes. Chamada a cada minuto pelo servidor.
 * agora: "YYYY-MM-DD HH:MM" no horário local (injetável para testes).
 */
async function rodarLembretes(agora = agoraLocal()) {
  const limite = somaMinutos(agora, 60);
  const hoje = agora.slice(0, 10);
  const amanha = somaDias(hoje, 1);

  // Compromissos que começam na próxima hora (aviso 1h antes).
  const eventos = db
    .prepare(
      `SELECT e.id, e.title, e.start_time, u.whatsapp_number
         FROM events e
         JOIN users u ON u.id = e.user_id
         JOIN subscriptions s ON s.user_id = e.user_id AND s.status = 'ativa'
        WHERE e.lembrado_em IS NULL
          AND e.start_time > ? AND e.start_time <= ?`
    )
    .all(agora, limite);

  for (const ev of eventos) {
    const hora = ev.start_time.slice(11, 16);
    await enviar(ev.whatsapp_number, `*Clara*\nLembrete: "${ev.title}" começa às ${hora}.`);
    db.prepare('UPDATE events SET lembrado_em = ? WHERE id = ?').run(agora, ev.id);
  }

  // Tarefas que vencem hoje ou amanhã (aviso no dia anterior).
  const tarefas = db
    .prepare(
      `SELECT t.id, t.title, t.due_date, u.whatsapp_number
         FROM tasks t
         JOIN users u ON u.id = t.user_id
         JOIN subscriptions s ON s.user_id = t.user_id AND s.status = 'ativa'
        WHERE t.status = 'pendente'
          AND t.lembrado_em IS NULL
          AND t.due_date IS NOT NULL
          AND t.due_date <= ?`
    )
    .all(amanha);

  for (const t of tarefas) {
    const quando = t.due_date === hoje ? 'vence hoje' : t.due_date < hoje ? 'já venceu' : 'vence amanhã';
    await enviar(t.whatsapp_number, `*Rafa*\nLembrete: "${t.title}" ${quando}.`);
    db.prepare('UPDATE tasks SET lembrado_em = ? WHERE id = ?').run(agora, t.id);
  }

  return { eventos: eventos.length, tarefas: tarefas.length };
}

function iniciarLembretes() {
  const intervalo = setInterval(() => {
    rodarLembretes().catch((err) => console.error('[lembretes] erro na rodada:', err));
  }, 60 * 1000);
  intervalo.unref?.();
  return intervalo;
}

module.exports = { rodarLembretes, iniciarLembretes };
