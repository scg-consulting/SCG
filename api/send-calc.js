export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, revenue } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const rev = parseInt(revenue, 10);
    if (!rev || rev <= 0) {
      return res.status(400).json({ error: 'Invalid revenue' });
    }

    const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
    const lo = rev * 0.15;
    const hi = rev * 0.35;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #222;">
        <h2 style="color:#E8622C;">Ваш расчёт потерь в отделе продаж</h2>
        <p>Выручка отдела продаж в месяц: <strong>${fmt(rev)} ₽</strong></p>
        <p>Потенциальные потери из-за узких мест в воронке: <strong>${fmt(lo)} – ${fmt(hi)} ₽ в месяц</strong></p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <h3>Куда чаще всего утекает выручка</h3>
        <ul>
          <li><strong>Первый контакт.</strong> Медленная реакция на заявку снижает шанс закрыть сделку с каждой лишней минутой ожидания.</li>
          <li><strong>Квалификация.</strong> Менеджеры тратят время на нецелевых клиентов вместо приоритизации по потенциалу сделки.</li>
          <li><strong>Средние этапы воронки.</strong> Сделки «зависают» без чёткого следующего шага и дедлайна.</li>
          <li><strong>Повторные касания.</strong> Часто это 1–2 попытки связаться с клиентом, хотя конверсия растёт вплоть до 5–7 касаний.</li>
          <li><strong>Мотивация команды.</strong> KPI не привязаны к узким местам воронки — менеджеры не видят связь усилий с доходом.</li>
        </ul>
        <p>Точная причина потерь у вас — индивидуальна. Аудит отдела продаж покажет, на каком именно этапе теряется выручка и что делать в первую очередь.</p>
        <p style="margin-top:32px;">
          <a href="https://www.scg-sales.ru/#contact" style="background:#E8622C;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Запросить аудит</a>
        </p>
        <p style="margin-top:32px;font-size:13px;color:#888;">Sales Consulting Group · scg-sales.ru</p>
      </div>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SCG — Sales Consulting Group <info@scg-sales.ru>',
        to: email,
        subject: 'Ваш расчёт потерь в отделе продаж',
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', errText);
      return res.status(502).json({ error: 'Email send failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
