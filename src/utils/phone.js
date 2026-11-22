// Normaliza número de WhatsApp para o formato da Cloud API: só dígitos, com DDI 55.
// Aceita "11 99999-9999", "(11) 99999-9999", "+55 11 99999-9999", "5511999999999".
function normalizarTelefone(valor = '') {
  let d = String(valor).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

// DDI 55 + DDD (2) + número (8 ou 9 dígitos).
function telefoneValido(d) {
  return /^55\d{2}\d{8,9}$/.test(d);
}

module.exports = { normalizarTelefone, telefoneValido };
