import express from "express";
import puppeteer from "puppeteer";
import axios from "axios";
import xml2js from "xml2js";
import fs from "fs/promises";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

const VIEWPORT = { width: 1366, height: 768 };
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

const DELAY_BETWEEN_PAGES_MS = 2000;
const LONG_BREAK_AFTER = 20;
const LONG_BREAK_MS = 120_000;

const LANGUAGE = "uk-UA";
const TIMEZONE = "Europe/Kyiv";

const donePath = path.resolve("done.json");

async function loadDoneList() {
  try {
    const data = await fs.readFile(donePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveDoneList(done) {
  await fs.writeFile(donePath, JSON.stringify(done, null, 2));
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function extractUrlsFromSitemap(sitemapUrl) {
  console.log(`📡 Завантажую sitemap: ${sitemapUrl}`);
  const { data } = await axios.get(sitemapUrl);

  let cleanData = data.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, "&amp;");
  const parsed = await xml2js.parseStringPromise(cleanData);

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
    const done = await loadDoneList();

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(404).json({ error: "Жодного <loc> у sitemap не знайдено." });
    }

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--lang=${LANGUAGE}`,
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`
      ],
      defaultViewport: VIEWPORT
    });

    let visited = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      if (done.includes(url)) {
        console.log(`⏩ Пропущено (${i + 1}): ${url}`);
        continue;
      }

      try {
        if (i > 0 && i % LONG_BREAK_AFTER === 0) {
          console.log(`😌 Перекур 2 хвилини після ${i} сторінок...`);
          await delay(LONG_BREAK_MS);
        }

        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.setExtraHTTPHeaders({ "Accept-Language": LANGUAGE });
        await page.emulateTimezone(TIMEZONE);

        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        console.log(`✅ Прогріто ${i + 1}: ${url}`);
        await page.close();

        done.push(url);
        await saveDoneList(done);
        visited++;
      } catch (err) {
        console.warn(`⚠️ Помилка ${i + 1} на ${url}: ${err.message}`);
      }

      await delay(DELAY_BETWEEN_PAGES_MS);
    }

    await browser.close();

    return res.json({ status: "done", visited, skipped: urls.length - visited });
  } catch (error) {
    console.error("🚨 Помилка в /extract:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: error.message || "Невідома помилка"
    });
  }
});

app.get("/", (req, res) => {
  res.send("🛰️ RSS Puppeteer Crawler API — працює");
});

app.listen(PORT, () => {
  console.log(`🚀 API запущено на порті ${PORT}`);
});
