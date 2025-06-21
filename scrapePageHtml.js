// scrapePageHtml.js - Axios + Cheerio ile ultra hızlı ASIN çekme
const axios = require('axios');
const cheerio = require('cheerio');
const HttpsProxyAgent = require('https-proxy-agent');

async function scrapePageHtml(url, proxy = null) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    };

    const axiosConfig = {
      headers,
      timeout: 7000,
    };

    if (proxy) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxy);
    }

    console.log(`🌐 HTML çekiliyor: ${url}`);
    const response = await axios.get(url, axiosConfig);

    const $ = cheerio.load(response.data);
    const asins = new Set();

    // Strategy 1: div[data-asin]
    $('div[data-asin]').each((_, el) => {
      const asin = $(el).attr('data-asin');
      if (asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin)) {
        asins.add(asin);
      }
    });

    // Strategy 2: href="/dp/ASIN"
    $('a[href*="/dp/"]').each((_, el) => {
      const href = $(el).attr('href');
      const match = href.match(/\/dp\/([A-Z0-9]{10})/);
      if (match && match[1]) {
        asins.add(match[1]);
      }
    });

    console.log(`✅ ${asins.size} ASIN bulundu.`);
    return {
      success: true,
      asins: Array.from(asins),
      source: 'html',
      url,
    };
  } catch (error) {
    console.warn(`❌ HTML scraping hatası: ${error.message}`);
    return {
      success: false,
      error: error.message,
      asins: [],
      url,
    };
  }
}

module.exports = scrapePageHtml;
