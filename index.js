import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import cors from 'cors';

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.send('🟢 Article parser is running!');
});

app.get('/extract', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing URL' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--lang=uk-UA',
        '--window-size=1440,900'
      ]
    });

    // створюємо окремий (incognito) контекст
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // додаємо заголовки, як у звичайного браузера
    await page.setExtraHTTPHeaders({
      'accept-language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    });

    // імітуємо параметри екрану
    await page.setViewport({ width: 1440, height: 900 });

    // імітуємо часову зону та геолокацію
    await page.emulateTimezone('Europe/Kiev');
    await context.overridePermissions(url, ['geolocation']);
    await page.setGeolocation({ latitude: 50.45, longitude: 30.523 });

    // переходимо за URL і чекаємо до 120 с
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });

    // отримуємо HTML сторінки
    const html = await page.content();
    await browser.close();

    // парсимо статтю через Readability
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article) {
      throw new Error('Failed to parse article');
    }

    // повертаємо результат
    res.json({
      title: article.title,
      textContent: article.textContent,
      content: article.content
    });
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    console.error(err);
    res.status(500).json({ error: 'Extract failed', details: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`✅ Server on port ${PORT}`)
);
