// Limite simples em memória por IP (suficiente para uma instância).
// Para várias instâncias, troque por um armazenamento compartilhado (Redis).
function createRateLimit({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const hits = new Map();

  return function rateLimit(req, res, next) {
    const agora = Date.now();
    const chave = req.ip;
    const registro = hits.get(chave);

    if (!registro || agora > registro.expira) {
      hits.set(chave, { count: 1, expira: agora + windowMs });
      return next();
    }

    registro.count += 1;
    if (registro.count > max) {
      const minutos = Math.ceil((registro.expira - agora) / 60000);
      return res
        .status(429)
        .json({ error: `Muitas tentativas. Espere ${minutos} min e tente de novo.` });
    }
    next();
  };
}

module.exports = { createRateLimit };
