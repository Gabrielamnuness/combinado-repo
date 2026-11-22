# Combinado — backend

Turma de assistentes de IA que atende pelo WhatsApp (Bento: finanças · Clara: agenda · Rafa: tarefas · Vic: documentos), com assinatura em três planos: **mensal, trimestral e anual**.

Este pacote roda local em modo demo (sem contas externas). Para vender de verdade, você conecta três serviços: **WhatsApp (Meta)**, **Stripe** e **Anthropic**. Nenhuma linha de código muda ao trocar do demo para o real: basta preencher o `.env`.

---

## 1. O que mudou nesta versão

- **Três planos** (mensal, trimestral, anual). A página `planos.html` lista os planos vindos do servidor (`GET /billing/planos`).
- **WhatsApp de verdade**: o webhook valida a assinatura da Meta (`X-Hub-Signature-256`), ignora mensagens reenviadas, normaliza o número (`(11) 99999-9999` vira `5511999999999`) e responde áudio/foto com honestidade.
- **Lembretes automáticos**: compromissos 1h antes e tarefas que vencem hoje ou amanhã, sem repetir.
- **Cobrança completa**: renovação, falha de pagamento (vira `inadimplente` e a turma para de responder), cancelamento, e link do portal para cancelar.
- **Registro de cada recebimento**: tabela `recebimentos` com valor, plano, recebedor e data. Cada pagamento também gera aviso no seu WhatsApp.
- **Cadastro para outras pessoas**: validação de senha e telefone, e-mail sem diferença de maiúsculas, limite de tentativas de login, e cadastro que completa uma conta criada antes pelo WhatsApp.
- **Correção importante**: o webhook do Stripe recebia o corpo já convertido em JSON, então a assinatura nunca era válida. Agora recebe o corpo cru.
- **Produção**: o servidor não sobe sem `JWT_SECRET` forte e `APP_URL` em https. O simulador (`playground`) fica desligado.
- **Fuso de São Paulo** nos lembretes e no horário que a IA recebe.

---

## 2. Rodar localmente (modo demo)

O repositório tem `netlify.toml` (site + proxy) e `render.yaml` (API). Para rodar só a API localmente, use os comandos abaixo.

Pré-requisito: Node.js 18+.

```bash
npm install
cp .env.example .env     # opcional no demo; ajuste JWT_SECRET
npm start
```

Abra `http://localhost:3000/planos.html`, crie uma conta e assine (no demo a assinatura ativa sem cobrança). Depois teste pelo `playground.html` ou com o WhatsApp real.

---

## 3. Colocar no ar

### 3.1 Publicar: Netlify (site) + Render (API)

O Netlify publica o site (`public/`). O Render roda a API com o banco SQLite em disco persistente. O Netlify encaminha `/auth`, `/billing`, `/dashboard` e `/playground` para a API, então o site e a API ficam no mesmo domínio.

**Ordem recomendada:**

1. **Render:** em dashboard.render.com, crie um Blueprint a partir deste repositório (usa `render.yaml`). Ele pede os valores marcados como `sync: false`. Deixe `APP_URL` vazio por enquanto e preencha depois do passo 2. O plano `starter` é necessário para o disco.
2. **Netlify:** em app.netlify.com, "Add new site > Import an existing project", escolha o repositório. Sem comando de build. Pasta de publicação: `public`. Anote o endereço gerado, algo como `https://combinado-xyz.netlify.app`.
3. **Netlify (proxy):** em `netlify.toml`, troque `SEU-SERVICO` pelo nome do serviço no Render (ex.: `combinado-api`). Faça commit e push.
4. **Render:** defina `APP_URL=https://combinado-xyz.netlify.app` (o endereço do passo 2) e reinicie o serviço.
5. Teste: `https://SEU-SERVICO.onrender.com/health` deve responder `ok`. Depois abra o site do Netlify e faça um cadastro.

**Webhooks:** Meta e Stripe devem apontar direto para o Render, não para o Netlify. Assim o corpo chega cru, sem o proxy mexer nele:
- Meta: `https://SEU-SERVICO.onrender.com/whatsapp/webhook`
- Stripe: `https://SEU-SERVICO.onrender.com/billing/webhook`

**Antes de anunciar:** o plano gratuito do Render dorme quando não tem tráfego. Se dormir, lembretes e webhooks atrasam. Não use o plano gratuito para clientes pagantes.

**Escalar depois:** com muitos clientes, troque o SQLite por Postgres. Faça backup do disco.

### 3.2 WhatsApp (Meta Cloud API)
1. Crie um app em developers.facebook.com e adicione o produto **WhatsApp**.
2. Em **Configuração da API**, copie o `Phone Number ID` e gere um token **permanente** (use um usuário de sistema no Business Manager). Preencha `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
3. Em **Configurações do app > Básico**, copie o **App Secret** para `WHATSAPP_APP_SECRET`.
4. Em **WhatsApp > Configuração**, defina o webhook:
   - URL de callback: `https://SEU-SERVICO.onrender.com/whatsapp/webhook`
   - Token de verificação: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
   - Assine o campo **messages**.
5. Crie e aprove dois templates de utilidade em pt_BR, cada um com corpo `{{1}}`. Coloque os nomes em `WHATSAPP_TEMPLATE_LEMBRETE` (lembretes) e `WHATSAPP_TEMPLATE_DONO` (avisos a você).

**Regra da Meta:** texto livre só chega ao cliente até 24h depois da última mensagem dele. Lembretes e avisos saem fora dessa janela, por isso precisam dos templates. Sem eles, o envio funciona só dentro da janela.

### 3.3 Stripe (cobrança)
1. Crie a conta em dashboard.stripe.com e complete a verificação (CNPJ ou CPF, dados bancários).
2. Crie **três Prices recorrentes em BRL**, todos com o mesmo produto "Combinado":
   - Mensal: R$ 54,90, intervalo mensal.
   - Trimestral: R$ 119,70, intervalo mensal com *intervalo de cobrança = 3 meses*.
   - Anual: R$ 334,80, intervalo anual.
3. Copie os IDs (`price_...`) para `STRIPE_PRICE_ID_MENSAL`, `STRIPE_PRICE_ID_TRIMESTRAL` e `STRIPE_PRICE_ID_ANUAL`.
4. Copie a chave secreta para `STRIPE_SECRET_KEY`.
5. Em **Desenvolvedores > Webhooks**, crie o endpoint `https://SEU-SERVICO.onrender.com/billing/webhook` com estes eventos:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
6. Copie o *signing secret* para `STRIPE_WEBHOOK_SECRET`.
7. Em **Configurações do portal do cliente**, ative cancelamento e troca de cartão. O link de cancelamento que a turma envia depende disso.

Os valores exibidos no site vêm de `src/config/env.js` (`PLANOS`). Se mudar um preço, mude nos dois lugares.

### 3.4 Recebimento dos valores (a cada cadastro)
- **Onde cai o dinheiro:** na conta bancária cadastrada no Stripe (passo 3.3.1). O Stripe faz o repasse. O código não guarda dados bancários.
- **Registro:** cada pagamento confirmado grava uma linha em `recebimentos` com valor, plano, data e o rótulo de `OWNER_RECEBEDOR`.
- **Aviso a você:** a cada cadastro novo e a cada pagamento confirmado, você recebe uma mensagem em `OWNER_WHATSAPP`.
- **Visão geral:** `GET /admin/resumo` (cabeçalho `x-admin-token: ADMIN_TOKEN`) mostra cadastros, assinaturas por plano, total recebido no mês e os últimos pagamentos.

### 3.5 Anthropic (IA)
Crie a chave em console.anthropic.com e preencha `ANTHROPIC_API_KEY`. O modelo padrão é `claude-haiku-5-5` (rápido e barato para classificar mensagens); troque em `ANTHROPIC_MODEL` se quiser mais qualidade. Se a API falhar, o sistema usa o classificador por palavras-chave e o cliente continua recebendo resposta.

---

## 4. Como o cliente usa

1. Conhece pela landing e clica em um dos planos.
2. Cria a conta em `planos.html` com o número de WhatsApp.
3. Paga pelo Checkout do Stripe.
4. Manda mensagens soltas no WhatsApp. A turma organiza e confirma.
5. Para cancelar, pede na conversa ("quero cancelar minha assinatura") e recebe o link do portal.

Número sem assinatura ativa recebe o convite para assinar. Assinatura com pagamento pendente recebe aviso para regularizar.

---

## 5. Endpoints

| Método | Rota | Quem chama | Função |
|---|---|---|---|
| GET | `/billing/planos` | site | lista planos e preços |
| POST | `/auth/register` | site | cria conta (completa conta criada pelo WhatsApp) |
| POST | `/auth/login` | site | login (10 tentativas a cada 15 min por IP) |
| POST | `/billing/checkout` | painel | inicia assinatura `{ plan }` |
| POST | `/billing/portal` | painel | link do portal do Stripe |
| GET | `/billing/status` | painel | situação da assinatura |
| POST | `/billing/webhook` | Stripe | eventos de cobrança (assinatura validada) |
| GET/POST | `/whatsapp/webhook` | Meta | verificação e mensagens (assinatura validada) |
| GET | `/dashboard/summary` | painel | dados do cliente |
| GET | `/admin/resumo` | você | visão geral (token secreto) |
| GET | `/health` | monitoramento | estado do servidor |

---

## 6. O que ainda não está pronto

Estes itens aparecem na landing ou estão previstos, mas **não estão implementados**. Antes de anunciar, ou tire da landing ou construa:

- **Áudio e foto:** a turma avisa que ainda não abre esse tipo de mensagem. Para ler áudio é preciso um serviço de transcrição, e para ler foto, a visão do Claude.
- **Conexão com banco (Open Finance):** precisa de um agregador como Pluggy ou Belvo.
- **Calendário sincronizado (Google/Outlook):** não há integração.
- **Documentos por descrição:** o Vic guarda o texto que você mandar, mas não guarda o arquivo enviado.
- **Pix e boleto na assinatura:** o Checkout daqui usa cartão. Se quiser Pix recorrente, confirme antes a disponibilidade no Stripe ou avalie outro provedor.

---

## 7. Testes feitos nesta versão

Rodados contra o servidor local, com banco temporário:
- cadastro com telefone em formatos diferentes, e-mail repetido, senha fraca, limite de login (10 tentativas);
- planos e checkout (incluindo trimestral e plano inválido);
- mensagens de assinante, reenvio da mesma mensagem (ignorado), número sem assinatura, áudio e pedido de cancelamento;
- webhook do WhatsApp: sem assinatura (403), assinatura errada (403), correta (200);
- webhook do Stripe com eventos assinados: assinatura inválida (400), pagamento duplicado (registrado uma vez), falha de pagamento, renovação e cancelamento;
- lembretes: disparam só na janela certa e não repetem;
- trava de produção: sem `JWT_SECRET` e `APP_URL` https, o servidor não sobe.

Não foi testado com credenciais reais da Meta, da Stripe nem da Anthropic. Faça um teste de ponta a ponta em modo de teste antes de anunciar.
