// adaptiveScraper.js - HTML + Playwright karma scraper
const scrapeHtml = require('./scrapePageHtml');
const { scrapeSinglePage, getSessionManager, getWebshareManager } = require('./scraper');

async function adaptiveScrape(url) {
  console.log(`🔍 Adaptif scraping başlıyor: ${url}`);

  // 1. Hızlı HTML ile dene
  const htmlResult = await scrapeHtml(url);

  if (htmlResult.success && htmlResult.asins.length >= 5) {
    console.log('⚡ Hızlı mod başarılı, playwright gerekmedi.');
    return { ...htmlResult, mode: 'html' };
  }

  console.warn('⚠️ Hızlı mod yetersiz, Playwright fallback çalışıyor...');

  // 2. Playwright fallback
  try {
    const wm = getWebshareManager();
    const sm = getSessionManager();
    const proxy = wm.getNextProxy();
    const sessionId = await sm.createSession(proxy, 'us');
    const session = sm.getSession(sessionId);
    const result = await scrapeSinglePage(url, session);
    await sm.removeSession(sessionId);
    return { ...result, mode: 'playwright' };
  } catch (err) {
    console.error('❌ Playwright fallback hatası:', err.message);
    return { success: false, error: err.message, asins: [], mode: 'error' };
  }
}

module.exports = adaptiveScrape;
