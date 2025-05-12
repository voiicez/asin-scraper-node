const { chromium } = require('playwright');

const MAX_BROWSERS = 2;
let browserPool = [];

async function initBrowserPool() {
  for (let i = 0; i < MAX_BROWSERS; i++) {
    try {
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-accelerated-2d-canvas',
          '--disable-gl-drawing-for-tests'
        ]
      });
      browserPool.push(browser);
      console.log(`🌐 Tarayıcı ${i + 1}/${MAX_BROWSERS} başlatıldı`);
    } catch (e) {
      console.error(`❌ Tarayıcı ${i + 1} başlatılamadı:`, e);
    }
  }
}

async function getBrowser() {
  if (browserPool.length > 0) {
    return browserPool.pop();
  }

  return await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-accelerated-2d-canvas',
      '--disable-gl-drawing-for-tests'
    ]
  });
}

async function returnBrowser(browser, forceClose = false) {
  if (forceClose || browserPool.length >= MAX_BROWSERS) {
    await browser.close();
  } else {
    browserPool.push(browser);
  }
}

async function closeAllBrowsers() {
  for (const browser of browserPool) {
    await browser.close().catch(console.error);
  }
  browserPool = [];
}

module.exports = {
  initBrowserPool,
  getBrowser,
  returnBrowser,
  closeAllBrowsers,
  MAX_BROWSERS
};
