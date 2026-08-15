const PRICE_STARS = 4; // ЗАМЕНИ на свою цену в Stars

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(200).send('ok'); return; }

  let update = req.body;
  if (typeof update === 'string') {
    try { update = JSON.parse(update); } catch (e) { update = {}; }
  }
  update = update || {};

  try {
    if (update.pre_checkout_query) {
      await answerPreCheckoutQuery(update.pre_checkout_query.id, true);
      res.status(200).send('ok');
      return;
    }

    const message = update.message;

    if (message && message.successful_payment) {
      const chatId = String(message.chat.id);
      await kvSadd('paid_users', chatId);
      await sendMessage(
        chatId,
        'Оплата прошла ✅ Доступ открыт навсегда. Открывай курс и начинай готовиться 👇',
        { inline_keyboard: [[{ text: 'Открыть курс', web_app: { url: process.env.APP_URL } }]] }
      );
      res.status(200).send('ok');
      return;
    }

    if (message && message.text && message.text.indexOf('/start') === 0) {
      const chatId = String(message.chat.id);
      const paid = await kvSismember('paid_users', chatId);

      if (paid) {
        await sendMessage(
          chatId,
          'С возвращением! Открывай курс 👇',
          { inline_keyboard: [[{ text: 'Открыть курс', web_app: { url: process.env.APP_URL } }]] }
        );
      } else {
        await sendInvoice(chatId);
      }
      res.status(200).send('ok');
      return;
    }
  } catch (e) {
    console.error('webhook error', e);
  }

  res.status(200).send('ok');
};

async function sendInvoice(chatId) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendInvoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      title: 'CSCA Математика — доступ навсегда',
      description: 'Полный курс подготовки: теория, 252 практических вопроса на трёх языках, пробный экзамен с таймером.',
      payload: 'csca-math-lifetime',
      currency: 'XTR',
      prices: [{ label: 'Доступ навсегда', amount: PRICE_STARS }],
    }),
  });
}

async function answerPreCheckoutQuery(id, ok) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerPreCheckoutQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pre_checkout_query_id: id, ok }),
  });
}

async function kvSadd(key, member) {
  const url = `${process.env.KV_REST_API_URL}/sadd/${key}/${encodeURIComponent(member)}`;
  await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
}

async function kvSismember(key, member) {
  const url = `${process.env.KV_REST_API_URL}/sismember/${key}/${encodeURIComponent(member)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const data = await r.json();
  return data.result === 1;
}

async function sendMessage(chatId, text, reply_markup) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup }),
  });
}
