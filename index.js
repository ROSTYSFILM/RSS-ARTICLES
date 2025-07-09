import express from "express";
import puppeteer from "puppeteer-core";
import axios from "axios";
import xml2js from "xml2js";

const app = express();
const PORT = process.env.PORT || 3000;

const VIEWPORT = { width: 1366, height: 768 };
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";
const MAX_CONCURRENT_TABS = 3;
const DELAY_BETWEEN_BATCHES = 4000;

app.get("/extract", async (req, res) => {
  const sitemapUrl = req.query.url;

  if (!sitemapUrl || !sitemapUrl.startsWith("http")) {
    return res.status(400).json({ error: "Невірний або відсутній параметр ?url" });
  }

  try {
    const urls = await extractUrlsFromSitemap(sitemapUrl);
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--lang=uk-UA",
        "--window-size=1366,768",
      ],
      defaultViewport: VIEWPORT,
    });

    let visited = 0;

    for (let i = 0; i < urls.length; i += MAX_CONCURRENT_TABS) {
      const batch = urls.slice(i, i + MAX_CONCURRENT_TABS);
      await Promise.all(batch.map(async (url) => {
        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        try {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
          visited++;
          console.log(`✅ ${url}`);
        } catch (err) {
          console.warn(`❌ ${url}: ${err.message}`);
        } finally {
          await page.close();
        }
      }));
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }

    await browser.close();
    return res.json({ status: "done", total: visited });

  } catch (err) {
    console.error("🚨 Помилка під час обробки:", err.message);
    return res.status(500).json({ error: "Не вдалося обробити sitemap", message: err.message });
  }
});

async function extractUrlsFromSitemap(sitemapUrl) {
  const { data } = await axios.get(sitemapUrl);
  const parsed = await xml2js.parseStringPromise(data);
  const urls = parsed.urlset.url.map(entry => entry.loc[0]);
  return urls.filter(url => url.startsWith("https://agriradar.news/"));
}

app.get("/", (req, res) => {
  res.send("🛰️ RSS Puppeteer Crawler API — працює");
});

app.listen(PORT, () => {
  console.log(`🚀 API доступний на порті ${PORT}`);
});
