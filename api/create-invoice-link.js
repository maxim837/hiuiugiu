const PRICE_STARS = 2000; // ВАЖНО: держи то же число, что и в api/webhook.js

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'CSCA Математика — доступ навсегда',
        description: 'Полный курс подготовки: теория, 252 практических вопроса на трёх языках, пробный экзамен с таймером.',
        payload: 'csca-math-lifetime',
        currency: 'XTR',
        prices: [{ label: 'Доступ навсегда', amount: PRICE_STARS }],
      }),
    });
    const data = await r.json();
    if (data.ok) {
      res.status(200).json({ link: data.result });
    } else {
      console.error('createInvoiceLink error', data);
      res.status(500).json({ error: 'telegram error' });
    }
  } catch (e) {
    console.error('create-invoice-link error', e);
    res.status(500).json({ error: 'server error' });
  }
};
