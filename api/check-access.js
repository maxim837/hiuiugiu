const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};
    const initData = body.initData || '';

    const user = validateInitData(initData, process.env.BOT_TOKEN);
    if (!user) {
      res.status(200).json({ paid: false, valid: false });
      return;
    }

    const userId = String(user.id);
    const paid = await kvSismember('paid_users', userId);
    res.status(200).json({ paid, valid: true });
  } catch (e) {
    console.error('check-access error', e);
    res.status(500).json({ paid: false, error: 'server error' });
  }
};

// Официальный алгоритм проверки initData от Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function validateInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) return null;
  urlParams.delete('hash');

  const pairs = [];
  for (const [key, value] of urlParams.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null; // подпись не сошлась — данные подделаны или это не Telegram

  const authDate = Number(urlParams.get('auth_date') || 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null; // старше суток — просим открыть заново

  const userStr = urlParams.get('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

async function kvSismember(key, member) {
  const url = `${process.env.KV_REST_API_URL}/sismember/${key}/${encodeURIComponent(member)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const data = await r.json();
  return data.result === 1;
}
