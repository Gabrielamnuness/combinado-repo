const config = require('../config/env');

const pad = (n) => String(n).padStart(2, '0');

// Partes da data/hora no fuso do negócio (America/Sao_Paulo por padrão).
// Os lembretes comparam strings "YYYY-MM-DD HH:MM" nesse mesmo fuso.
function partesLocais(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    hora: `${p.hour}:${p.minute}`,
  };
}

// "YYYY-MM-DD HH:MM" no horário local do negócio.
function agoraLocal(date = new Date()) {
  const p = partesLocais(date);
  return `${p.data} ${p.hora}`;
}

// Soma minutos a uma string "YYYY-MM-DD HH:MM" sem depender do fuso do servidor.
function somaMinutos(str, minutos) {
  const [d, h] = str.split(' ');
  const [y, mo, dd] = d.split('-').map(Number);
  const [hh, mi] = h.split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, dd, hh, mi) + minutos * 60000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

// Soma dias a uma data "YYYY-MM-DD".
function somaDias(dataStr, dias) {
  const [y, mo, dd] = dataStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, dd + dias));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

module.exports = { agoraLocal, somaMinutos, somaDias, partesLocais };
