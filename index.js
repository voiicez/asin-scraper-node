// parallel_asin_scraper.js
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
app.use(cors());

function ensurePageParam(url) {
  return url.includes("page=") ? url : url + (url.includes("?") ? "&page=" : "?page=");
}

async function scrapeSinglePage(proxy, url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    proxy: proxy ? { server: proxy } : undefined
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  await page.route('**/*', route => {
    const type = route.request().resourceType();
    if (["image", "font", "stylesheet"].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    await page.goto(url, { timeout: 10000 });

    const visible = await page.isVisible('div[data-asin]');
    if (!visible) {
      console.log(`⚠️ Görünür ürün bulunamadı: ${url}`);
      await browser.close();
      return [];
    }

    const elements = await page.$$('div[data-asin]');
    const asins = [];

    for (const el of elements) {
      const asin = await el.getAttribute('data-asin');
      if (asin && asin.trim() !== "" && asin.length === 10) {
        asins.push(asin);
      }
    }

    console.log(`✅ ${asins.length} ASIN bulundu: ${url}`);
    await browser.close();
    return asins;

  } catch (e) {
    console.log(`❌ Hata oluştu (${url}): ${e.message}`);
    await browser.close();
    return [];
  }
}

async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];

  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function getAsinsParallel(baseUrl, maxPages = 5, concurrency = 5, proxy = null) {
  const asins = new Set();
  const urls = Array.from({ length: maxPages }, (_, i) => `${baseUrl}${i + 1}`);

  const results = await asyncPool(concurrency, urls, url => scrapeSinglePage(proxy, url));

  for (const result of results) {
    result.forEach(asin => asins.add(asin));
  }

  return Array.from(asins);
}

app.get('/get-asins', async (req, res) => {
  const baseUrlParam = req.query.url;
  const maxPagesParam = req.query.pages;
  const proxyParam = req.query.proxy;

  if (!baseUrlParam) {
    return res.status(400).json({ error: "Lütfen 'url' parametresi sağlayın." });
  }

  const baseUrl = ensurePageParam(baseUrlParam);
  const maxPages = parseInt(maxPagesParam) || 5;
  const concurrency = parseInt(req.query.concurrency) || 5;

  if (isNaN(maxPages)) {
    return res.status(400).json({ error: "'pages' sayısal bir değer olmalıdır." });
  }

  try {
    console.log(`📥 Paralel API isteği: ${baseUrl} (pages=${maxPages}, proxy=${proxyParam || 'yok'})`);
    const asins = await getAsinsParallel(baseUrl, maxPages, concurrency, proxyParam);
    return res.json({ count: asins.length, asins });
  } catch (e) {
    console.error("❌ Bir hata oluştu:", e);
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Paralel scraper sunucusu başlatıldı → http://localhost:${PORT}`);
});