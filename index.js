import express from "express";
import puppeteer from "puppeteer-core";
import axios from "axios";
import xml2js from "xml2js";

const app = express();
const PORT = process.env.PORT || 3000;

const VIEWPORT = { width: 1366, height: 768 };
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

const DELAY_BETWEEN_PAGES_MS = 4000; // пауза між сторінками (4 секунди)

async function extractUrlsFromSitemap(sitemapUrl) {
  console.log(`📡 Завантажую sitemap: ${sitemapUrl}`);
  const { data } = await axios.get(sitemapUrl);
  const parsed = await xml2js.parseStringPromise(data);

  if (!parsed.urlset || !parsed.urlset.url) {
    throw new Error("Sitemap XML не містить <urlset><url>");
  }

  const urls = parsed.urlset.url.map((entry) => entry.loc[0]);
  console.log(`🔍 Знайдено URLів: ${urls.length}`);

  return urls;
}

app.get("/extract", async (req, res) => {
  const sitemapUrl = req.query.url;

  if (!sitemapUrl || !sitemapUrl.startsWith("http")) {
    return res.status(400).json({ error: "Невірний або відсутній параметр ?url" });
  }

  try {
    const urls = await extractUrlsFromSitemap(sitemapUrl);

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(404).json({ error: "Жодного <loc> у sitemap не знайдено." });
    }

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--lang=uk-UA",
        "--window-size=1366,768",
      ],
      defaultViewport: VIEWPORT,
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    });

    let visited = 0;

    for (const url of urls) {
      const page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);

      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        visited++;
        console.log(`✅ Прогріто: ${url}`);
      } catch (error) {
        console.warn(`⚠️ Помилка на ${url}: ${error.message}`);
      } finally {
        await page.close();
      }

      // Пауза між сторінками, щоб не навантажувати
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PAGES_MS));
    }

    await browser.close();

    return res.json({ status: "done", total: visited });
  } catch (error) {
    console.error("🚨 Помилка в /extract:", error);
    return res.status(500).json({ error: "Internal Server Error", message: error.message || "Невідома помилка" });
  }
});

app.get("/", (req, res) => {
  res.send("🛰️ RSS Puppeteer Crawler API — працює");
});

app.listen(PORT, () => {
  console.log(`🚀 API запущено на порті ${PORT}`);
});
