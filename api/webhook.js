const PRICE_STARS = 4; // цена в Stars
 
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(200).send('ok'); return; }
 
  let update = req.body;
  if (typeof update === 'string') {
    try { update = JSON.parse(update); } catch (e) { update = {}; }
  }
  update = update || {};
 
  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = String(cq.message.chat.id);
 
      if (!isAdmin(chatId)) {
        await answerCallbackQuery(cq.id, 'Нет доступа');
        res.status(200).send('ok');
        return;
      }
 
      if (cq.data === 'toggle_free_mode') {
        const current = await kvGet('free_mode');
        const newVal = current === 'true' ? 'false' : 'true';
        await kvSet('free_mode', newVal);
        await editMessageReplyMarkup(chatId, cq.message.message_id, adminKeyboard(newVal === 'true'));
        await answerCallbackQuery(cq.id, newVal === 'true' ? 'Бесплатный режим включён ✅' : 'Бесплатный режим выключен, доступ снова платный 🔒');
      } else {
        await answerCallbackQuery(cq.id);
      }
      res.status(200).send('ok');
      return;
    }
 
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
      const freeMode = await kvGet('free_mode');
      const paid = freeMode === 'true' ? true : await kvSismember('paid_users', chatId);
 
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
 
    // Админ-команды — работают только из чатов, перечисленных в ADMIN_CHAT_ID (через запятую), у всех остальных молча игнорируются
    if (message && message.text && message.text.indexOf('/grant') === 0) {
      const chatId = String(message.chat.id);
      if (!isAdmin(chatId)) { res.status(200).send('ok'); return; }
 
      const targetId = message.text.trim().split(/\s+/)[1];
      if (!targetId) {
        await sendMessage(chatId, 'Использование: /grant <telegram_id>');
      } else {
        await kvSadd('paid_users', targetId);
        await sendMessage(chatId, `Доступ выдан пользователю ${targetId} ✅`);
      }
      res.status(200).send('ok');
      return;
    }
 
    if (message && message.text && message.text.indexOf('/revoke') === 0) {
      const chatId = String(message.chat.id);
      if (!isAdmin(chatId)) { res.status(200).send('ok'); return; }
 
      const targetId = message.text.trim().split(/\s+/)[1];
      if (!targetId) {
        await sendMessage(chatId, 'Использование: /revoke <telegram_id>');
      } else {
        await kvSrem('paid_users', targetId);
        await sendMessage(chatId, `Доступ у пользователя ${targetId} отозван ❌`);
      }
      res.status(200).send('ok');
      return;
    }
 
    if (message && message.text && message.text.indexOf('/list') === 0) {
      const chatId = String(message.chat.id);
      if (!isAdmin(chatId)) { res.status(200).send('ok'); return; }
 
      const members = await kvSmembers('paid_users');
      await sendMessage(chatId, members.length ? `Сейчас доступ есть у:\n${members.join('\n')}` : 'Пока никто не оплатил.');
      res.status(200).send('ok');
      return;
    }
 
    if (message && message.text && message.text.indexOf('/admin') === 0) {
      const chatId = String(message.chat.id);
      if (!isAdmin(chatId)) { res.status(200).send('ok'); return; }
 
      const freeMode = (await kvGet('free_mode')) === 'true';
      await sendMessage(chatId, 'Панель управления курсом:', adminKeyboard(freeMode));
      res.status(200).send('ok');
      return;
    }
  } catch (e) {
    console.error('webhook error', e);
  }
 
  res.status(200).send('ok');
};
 
function isAdmin(chatId) {
  const admins = (process.env.ADMIN_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
  return admins.indexOf(chatId) !== -1;
}
 
function adminKeyboard(freeModeOn) {
  return {
    inline_keyboard: [[
      {
        text: freeModeOn ? '✅ Бесплатный режим ВКЛ — нажми, чтобы вернуть оплату' : '🔒 Сейчас платно — нажми, чтобы включить бесплатный режим',
        callback_data: 'toggle_free_mode',
      },
    ]],
  };
}
 
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
 
async function kvSrem(key, member) {
  const url = `${process.env.KV_REST_API_URL}/srem/${key}/${encodeURIComponent(member)}`;
  await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
}
 
async function kvSmembers(key) {
  const url = `${process.env.KV_REST_API_URL}/smembers/${key}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const data = await r.json();
  return data.result || [];
}
 
async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${key}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const data = await r.json();
  return data.result;
}
 
async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${key}/${encodeURIComponent(value)}`;
  await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
}
 
async function sendMessage(chatId, text, reply_markup) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup }),
  });
}
 
async function answerCallbackQuery(id, text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, text: text || '', show_alert: false }),
  });
}
 
async function editMessageReplyMarkup(chatId, messageId, reply_markup) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup }),
  });
}
