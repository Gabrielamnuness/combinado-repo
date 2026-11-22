const axios = require('axios');
const config = require('../config/env');

/**
 * Recebe o texto do cliente e devolve { assistant, data }.
 *
 * Com ANTHROPIC_API_KEY, usa o modelo para entender português coloquial.
 * Sem a chave, ou se a API falhar/demorar, cai no classificador por palavras-chave,
 * para o cliente nunca ficar sem resposta.
 *
 * agora: "YYYY-MM-DD HH:MM" no horário local do negócio.
 */
async function interpretMessage(text, agora) {
  if (config.isAiDemo) return demoClassifier(text);

  const systemPrompt = `Você classifica mensagens de um cliente para um assistente de organização pessoal via WhatsApp.
Responda SOMENTE com um JSON válido, sem markdown, sem texto antes ou depois, no formato:

{
  "assistant": "bento" | "clara" | "rafa" | "vic" | "outro",
  "data": { ... }
}

Regras de cada assistente:
- "bento" (finanças): quando o cliente registra um gasto ou pergunta sobre gastos.
  data: { "amount": number, "category": string, "description": string, "payment_method": string|null }
  Se for uma pergunta (ex: "quanto gastei"), use data: { "query": true }
- "clara" (agenda): quando o cliente marca, remarca ou pergunta sobre compromissos.
  data: { "title": string, "start_time": "YYYY-MM-DD HH:MM"|null, "query": boolean }
- "rafa" (tarefas): quando o cliente cria ou pergunta sobre pendências/lembretes.
  data: { "title": string, "due_date": "YYYY-MM-DD"|null, "priority": "alta"|"normal", "query": boolean }
- "vic" (documentos): quando o cliente guarda ou procura um documento.
  data: { "description": string, "category": string, "query": boolean }
- "outro": qualquer coisa que não se encaixe (saudação, dúvida geral, etc).
  data: { "text": string }

Agora (horário de Brasília): ${agora}. Use esse horário para interpretar "hoje", "amanhã", "quinta às 15h" etc.`;

  try {
    const { data: resposta } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: config.anthropic.model,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: text.slice(0, 2000) }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.anthropic.apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: config.anthropic.timeoutMs,
      }
    );

    const raw = resposta.content.map((b) => b.text || '').join('').trim();
    const limpo = raw.replace(/^```json/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(limpo);
    if (!parsed || !parsed.assistant) return demoClassifier(text);
    return parsed;
  } catch (err) {
    console.error('[ia] falha ao interpretar, usando classificador simples:', err.message);
    return demoClassifier(text);
  }
}

function demoClassifier(text) {
  const t = text.toLowerCase();

  const amountMatch = t.match(/(\d+[.,]?\d*)/);

  if (/(gastei|paguei|comprei|débito|debito|pix de|boleto)/.test(t) && amountMatch) {
    return {
      assistant: 'bento',
      data: {
        amount: parseFloat(amountMatch[1].replace(',', '.')),
        category: guessCategory(t),
        description: text,
        payment_method: /pix/.test(t) ? 'pix' : /débito|debito/.test(t) ? 'débito' : /crédito|credito/.test(t) ? 'crédito' : null,
      },
    };
  }
  if (/(quanto gastei|resumo do mês|saldo|quanto sobrou)/.test(t)) {
    return { assistant: 'bento', data: { query: true } };
  }

  if (/(marca|marcar|agenda|reunião|reuniao|compromisso)/.test(t)) {
    return { assistant: 'clara', data: { title: text, start_time: null, query: false } };
  }
  if (/(o que eu tenho|minha agenda|compromissos)/.test(t)) {
    return { assistant: 'clara', data: { query: true } };
  }

  if (/(lembra|lembrar|não deixa|nao deixa|tarefa|pendência|pendencia|preciso fazer)/.test(t)) {
    return {
      assistant: 'rafa',
      data: { title: text, due_date: null, priority: /urgente|prioridade|importante/.test(t) ? 'alta' : 'normal', query: false },
    };
  }
  if (/(minhas tarefas|o que falta|pendências|pendencias)/.test(t)) {
    return { assistant: 'rafa', data: { query: true } };
  }

  if (/(guarda|guardar|documento|comprovante|contrato|nota fiscal)/.test(t)) {
    return { assistant: 'vic', data: { description: text, category: guessDocCategory(t), query: false } };
  }
  if (/(acha|achar|procura|procurar|cadê|cade)/.test(t)) {
    return { assistant: 'vic', data: { description: text, query: true } };
  }

  return { assistant: 'outro', data: { text } };
}

function guessCategory(t) {
  if (/mercado|supermercado/.test(t)) return 'Mercado';
  if (/posto|gasolina|combustível|combustivel/.test(t)) return 'Transporte';
  if (/farmácia|farmacia|remédio|remedio/.test(t)) return 'Saúde';
  if (/restaurante|ifood|lanche/.test(t)) return 'Alimentação';
  return 'Outros';
}

function guessDocCategory(t) {
  if (/contrato/.test(t)) return 'Contrato';
  if (/nota fiscal|nf/.test(t)) return 'Nota fiscal';
  if (/comprovante|recibo/.test(t)) return 'Comprovante';
  return 'Geral';
}

module.exports = { interpretMessage };
