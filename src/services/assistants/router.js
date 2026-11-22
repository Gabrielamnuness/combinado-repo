const bento = require('./bento');
const clara = require('./clara');
const rafa = require('./rafa');
const vic = require('./vic');

const NOMES = { bento: 'Bento', clara: 'Clara', rafa: 'Rafa', vic: 'Vic' };

function route(userId, assistant, data) {
  switch (assistant) {
    case 'bento':
      return { assistant: 'bento', reply: `*${NOMES.bento}*\n${bento.handle(userId, data)}` };
    case 'clara':
      return { assistant: 'clara', reply: `*${NOMES.clara}*\n${clara.handle(userId, data)}` };
    case 'rafa':
      return { assistant: 'rafa', reply: `*${NOMES.rafa}*\n${rafa.handle(userId, data)}` };
    case 'vic':
      return { assistant: 'vic', reply: `*${NOMES.vic}*\n${vic.handle(userId, data)}` };
    default:
      return {
        assistant: 'sistema',
        reply:
          'Oi! Sou a turma do Combinado. Pode me contar um gasto, marcar um compromisso, pedir pra lembrar de algo ou guardar um documento — do seu jeito, sem comando fixo.',
      };
  }
}

module.exports = { route };
