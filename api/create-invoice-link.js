const DEFAULT_PRICE_STARS = 4; // используется, только пока цена в базе ещё ни разу не задавалась через /admin
 
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
 
  try {
    const priceStars = await getPriceStars();
    const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'CSCA Математика — доступ навсегда',
        description: 'Полный курс подготовки: теория, 252 практических вопроса на трёх языках, пробный экзамен с таймером.',
        payload: 'csca-math-lifetime',
        currency: 'XTR',
        prices: [{ label: 'Доступ навсегда', amount: priceStars }],
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
 
// Та же переменная в базе, что редактируется кнопкой "Изменить цену" в /admin — цена всегда одна и та же и в боте, и в приложении.
async function getPriceStars() {
  const url = `${process.env.KV_REST_API_URL}/get/price_stars`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const data = await r.json();
  const n = Number(data.result);
  return data.result && n > 0 ? n : DEFAULT_PRICE_STARS;
}
 
Downloaded bot-backend.zip Show in Finder

