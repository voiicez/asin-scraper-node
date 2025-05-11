const { getBrowser, returnBrowser } = require('./browserPools');
const { detectCountryFromAmazonUrl, getOxylabsProxy } = require('./utils');

async function scrapeSinglePage(url, proxy = null) {
  let browser = null;
  let forceClose = false;
  let proxySettings;
  let totalBytesTransferred = 0;

  if (proxy) {
    const proxyUrl = new URL(proxy);
    proxySettings = {
      server: `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
      username: decodeURIComponent(proxyUrl.username),
      password: decodeURIComponent(proxyUrl.password)
    };
  }

  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      proxy: proxySettings,
      clearCookiesAfterUse: true,
      javaScriptEnabled: true,
      bypassCSP: true,
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();

    const client = await context.newCDPSession(page);
    let totalBytesTransferred = 0;
    await client.send('Network.enable');
    client.on('Network.loadingFinished', (event) => {
      totalBytesTransferred += event.encodedDataLength || 0;
    });

    try {
        await page.goto('https://ip.oxylabs.io/location', { waitUntil: 'load' });
        const rawText = await page.evaluate(() => document.body.innerText);
        const ipData = JSON.parse(rawText);
      
        const ip = ipData.ip || 'N/A';
        const city =
          ipData.providers?.dbip?.city ||
          ipData.providers?.ip2location?.city ||
          ipData.providers?.maxmind?.city ||
          'Unknown';
      
        console.log(`🌐 Proxy IP: ${ip} | Location: ${city}`);
        await page.waitForTimeout(500);
      } catch (e) {
        console.warn('⚠️ Proxy kontrol başarısız:', e.message);
      }

    await page.route('**/*', route => {
      const url = route.request().url();
      const type = route.request().resourceType();

      const blockIfUrlIncludes = [
        'amazon-adsystem', 'googlesyndication', 'doubleclick', 'gstatic',
        'google-analytics', 'fls-na.amazon', 'fls-eu.amazon', 'unagi',
        'm.media-amazon.com', 'images-na.ssl-images-amazon.com',
        'images-eu.ssl-images-amazon.com', 'media-amazon'
      ];

      const blockedTypes = ['image', 'stylesheet', 'media', 'font', 'other'];

      if (
        blockedTypes.includes(type) ||
        blockIfUrlIncludes.some(part => url.includes(part))
      ) {
        return route.abort();
      }

      return route.continue();
    });

    await page.goto(url, {
      timeout: 30000,
      waitUntil: 'load'
    });

    const isBlocked = await page.content().then(html =>
      html.includes('Enter the characters you see below') ||
      html.includes('Sorry, we just need to make sure')
    );
    if (isBlocked) {
      await context.close();
      return { asins: [], blocked: true };
    }

    try {
      console.log(`⏳ ASIN listesi için bekleniyor: ${url}`);
      await page.waitForFunction(() => {
        const asinElements = document.querySelectorAll('div[data-asin]');
        return asinElements.length > 0 ||
          document.body.textContent.includes('No results') ||
          document.body.textContent.includes('No hay resultados') ||
          document.body.textContent.includes('Keine Ergebnisse') ||
          document.body.textContent.includes('Aucun résultat');
      }, { timeout: 15000 });

      console.log(`✅ ASIN listesi yüklendi veya sonuç yok: ${url}`);
    } catch (e) {
      console.log(`⚠️ ASIN listesi beklerken zaman aşımı: ${url} - ${e.message}`);
    }

    const asins = await page.evaluate(() => {
      const results = new Set();
      const asinContainers = document.querySelectorAll('div[data-asin]');
      for (const container of asinContainers) {
        const asin = container.getAttribute('data-asin');
        if (asin && asin.length === 10) {
          results.add(asin);
        }
      }
      return Array.from(results);
    });

    let categories = [];
    try {
      categories = await page.evaluate(() => {
        const categoryElements = document.querySelectorAll('#departments a[href*="rh=n:"], aside a[href*="rh=n:"], .s-navigation-indent-1 a[href*="rh=n:"], .a-unordered-list a[href*="rh=n:"], .a-spacing-micro a[href*="rh=n:"], a[href*="node="]');
        const results = [];
      
        for (const element of categoryElements) {
          const url = element.getAttribute('href');
          if (url) {
            const match = url.match(/rh=n%3A(\d+)/) || url.match(/node=(\d+)/);
            if (match && match[1]) {
              const categoryId = match[1];
              const categoryName = element.textContent.trim();
              results.push({ id: categoryId, name: categoryName });
            }
          }
        }
      
        return results;
      });
      
    } catch (e) {
      console.log(`⚠️ Kategori çıkarma hatası: ${e.message}`);
    }

    await context.close();
    

    return { asins, categories, success: true, bytesTransferred: totalBytesTransferred };

  } catch (e) {
    console.log(`❌ Hata: ${url} - ${e.message}`);
    forceClose = true;
    return { asins: [], categories: [], error: e.message };
  } finally {
    if (browser) {
      await returnBrowser(browser, forceClose);
    }
  }
}

module.exports = {
  scrapeSinglePage
};
