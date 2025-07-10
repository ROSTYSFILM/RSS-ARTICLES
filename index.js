import express from 'express';
import cors from 'cors';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.resolve();

app.use(cors());

const chromePath = '/opt/render/project/.local-chromium/chrome-linux/chrome';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const language = 'uk-UA';
const timezone = 'Europe/Kyiv';

const delay = ms => new Promise(res => setTimeout(res, ms));

async function getUrlsFromSitemap(sitemapUrl) {
  const res = await fetch(sitemapUrl);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  return urls;
}

app.get('/extract', async (req, res) => {
  const sitemapUrl = req.query.url;
  if (!sitemapUrl) return res.status(400).send('Missing ?url');

  console.log(`\ud83d\udcf1 Завантажую sitemap: ${sitemapUrl}`);

  try {
    const urls = await getUrlsFromSitemap(sitemapUrl);
    console.log(`\ud83d\udd0d Знайдено URLів: ${urls.length}`);

    const donePath = path.join(__dirname, 'done.json');
    let done = [];
    try {
      const data = await fs.readFile(donePath, 'utf-8');
      done = JSON.parse(data);
    } catch {
      done = [];
    }

    let browser = await puppeteer.launch({
      headless: 'new',
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--lang=uk-UA,uk,en',
        '--window-size=1280,720'
      ],
      defaultViewport: { width: 1280, height: 720 },
      locale: language,
    });

    let index = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (done.includes(url)) {
        console.log(`⏩ Пропущено (${i + 1}): ${url}`);
        continue;
      }

      try {
        if (index > 0 && index % 10 === 0) {
          console.log('⏳ Перекур 1 хвилина...');
          await delay(60000);
        }

        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        await page.setExtraHTTPHeaders({ 'Accept-Language': language });
        await page.emulateTimezone(timezone);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        index++;
        console.log(`✅ Прогріто ${index}: ${url}`);
        await page.close();

        done.push(url);
        await fs.writeFile(donePath, JSON.stringify(done, null, 2));
      } catch (err) {
        console.error(`⚠️ Помилка на ${url}: ${err.message}`);
        console.log('🔁 Перезапуск браузера після помилки...');
        try {
          await browser.close();
        } catch {}
        browser = await puppeteer.launch({
          headless: 'new',
          executablePath: chromePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--lang=uk-UA,uk,en',
            '--window-size=1280,720'
          ],
          defaultViewport: { width: 1280, height: 720 },
          locale: language,
        });
      }

      await delay(2000);
    }

    await browser.close();
    res.send(`✅ Пройдено ${index} URL. Завершено.`);
  } catch (err) {
    console.error(`\ud83d\udea8 Помилка в /extract: ${err}`);
    res.status(500).send(err.toString());
  }
});

app.listen(PORT, () => {
  console.log(`\ud83d\ude80 API запущено на порті ${PORT}`);
});
