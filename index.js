const express = require("express");
const puppeteer = require("puppeteer");
const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Article Parser is running!");
});

app.post("/parse", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Missing URL" });
  }

  try {
    const browser = await puppeteer.launch({
      headless: "new", // новий безголовий режим, сумісний з Puppeteer 22+
      args: ["--no-sandbox"], // необхідно для хостингів на кшталт Render
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    const html = await page.content();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    await browser.close();
    res.json(article);
  } catch (err) {
    console.error("Parsing error:", err);
    res.status(500).json({ error: err.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
