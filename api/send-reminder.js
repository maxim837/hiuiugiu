const questions = require('./questions.json');

module.exports = async (req, res) => {
  const auth = req.headers['authorization'];
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).send('unauthorized');
    return;
  }

  try {
    const idx = (await kvIncr('question_cursor')) % questions.length;
    const q = questions[idx];

    const letters = ['A', 'B', 'C', 'D'];
    const text =
      `📐 Вопрос дня (${q.topic})\n\n${q.q}\n\n` +
      q.options.map((o, i) => `${letters[i]}. ${o}`).join('\n') +
      `\n\nОтвет и разбор — в приложении 👇`;

    // рассылаем только тем, кто оплатил доступ — иначе бесплатная рассылка сама себя обесценивает
    const subscribers = await kvSmembers('paid_users');
    let sent = 0;
    let removed = 0;
    for (const chatId of subscribers) {
      const result = await sendMessage(chatId, text);
      if (result.ok) {
        sent++;
      } else if (result.errorCode === 403) {
        // пользователь заблокировал бота — убираем его, чтобы не слать вникуда каждый раз
        await kvSrem('paid_users', chatId);
        removed++;
      }
    }

    res.status(200).json({ sent, removed, total: subscribers.length, questionIdx: idx });
  } catch (e) {
    console.error('send-reminder error', e);
    res.status(500).send('error');
  }
};

async function kvIncr(key) {
  const url = `${process.env.KV_REST_API_URL}/incr/${key}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const data = await r.json();
  return data.result;
}

async function kvSmembers(key) {
  const url = `${process.env.KV_REST_API_URL}/smembers/${key}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const data = await r.json();
  return data.result || [];
}

async function kvSrem(key, member) {
  const url = `${process.env.KV_REST_API_URL}/srem/${key}/${encodeURIComponent(member)}`;
  await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
}

async function sendMessage(chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: [[{ text: 'Открыть курс', web_app: { url: process.env.APP_URL } }]] },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (data.ok) return { ok: true };
  return { ok: false, errorCode: data.error_code };
}
