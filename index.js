import express from 'express';
import puppeteer from 'puppeteer';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.get('/', (req, res) => res.send('🟢 Article parser is running!'));

app.get('/extract', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    const html = await page.content();
    await browser.close();

    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();

    if (!article) return res.status(500).json({ error: 'Failed to parse article' });
    res.json({
      title: article.title,
      textContent: article.textContent,
      content: article.content
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Extract failed', details: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Server on port ${PORT}`));
