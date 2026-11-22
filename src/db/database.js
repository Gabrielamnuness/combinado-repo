const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'combinado.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  whatsapp_number TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT,                         -- 'mensal' | 'trimestral' | 'anual'
  status TEXT DEFAULT 'inativa',     -- 'ativa' | 'inativa' | 'inadimplente' | 'cancelada'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  current_period_end TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT,
  description TEXT,
  payment_method TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT,
  priority TEXT DEFAULT 'normal',    -- 'alta' | 'normal'
  status TEXT DEFAULT 'pendente',    -- 'pendente' | 'concluida'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT,
  description TEXT,
  category TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  direction TEXT,   -- 'entrada' | 'saida'
  assistant TEXT,   -- 'cliente' | 'bento' | 'clara' | 'rafa' | 'vic' | 'sistema'
  content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Cada pagamento confirmado pelo Stripe vira um registro aqui, com o recebedor
-- configurado no momento. Não guarda dados bancários: o depósito é feito pelo Stripe.
CREATE TABLE IF NOT EXISTS recebimentos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_id TEXT,
  plan TEXT,
  valor_centavos INTEGER NOT NULL,
  moeda TEXT DEFAULT 'brl',
  recebedor TEXT,
  stripe_invoice_id TEXT UNIQUE,
  stripe_event_id TEXT,
  periodo_fim TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Evita processar duas vezes a mesma mensagem (a Meta reenvia quando não recebe 200 a tempo).
CREATE TABLE IF NOT EXISTS whatsapp_mensagens_processadas (
  message_id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Migrações leves para bancos criados pela versão anterior.
function adicionarColunaSeFaltar(tabela, coluna, definicao) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (!colunas.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  }
}

adicionarColunaSeFaltar('events', 'lembrado_em', 'TEXT');
adicionarColunaSeFaltar('tasks', 'lembrado_em', 'TEXT');
adicionarColunaSeFaltar('subscriptions', 'stripe_price_id', 'TEXT');
adicionarColunaSeFaltar('subscriptions', 'updated_at', 'TEXT');

db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_whatsapp ON users(whatsapp_number);`);

module.exports = db;
