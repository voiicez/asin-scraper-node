// improved_high_performance_asin_scraper.js
const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const cluster = require('cluster');
const os = require('os');

// Worker sayısını belirle (CPU sayısı -1, en az 1)
const NUM_WORKERS = Math.max(1, os.cpus().length - 1);

// Ana işlem (master) ve işçi (worker) süreçleri ayır
if (cluster.isMaster) {
  console.log(`🚀 Ana süreç ${process.pid} başlatıldı, ${NUM_WORKERS} işçi oluşturuluyor...`);
  
  // Worker'ları başlat
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }
  
  // Çöken worker'ları yeniden başlat
  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} çöktü. Yeniden başlatılıyor...`);
    cluster.fork();
  });
} else {
  // Worker süreci - asıl sunucu kodu burada çalışır
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Performans için tarayıcı havuzu
  let browserPool = [];
  const MAX_BROWSERS = 5; // Aynı anda açılabilecek maksimum tarayıcı sayısı
  
  // Uygulama başlangıcında tarayıcı havuzunu başlat
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
        console.log(`🌐 Tarayıcı ${i+1}/${MAX_BROWSERS} başlatıldı`);
      } catch (e) {
        console.error(`❌ Tarayıcı ${i+1} başlatılamadı:`, e);
      }
    }
  }
  
  // Tarayıcı havuzundan bir tarayıcı al
  async function getBrowser() {
    if (browserPool.length > 0) {
      return browserPool.pop();
    }
    
    // Havuz boşsa yeni bir tarayıcı oluştur
    try {
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
    } catch (e) {
      console.error("❌ Yeni tarayıcı oluşturulamadı:", e);
      throw e;
    }
  }
  
  // Tarayıcıyı havuza geri koy (veya kapat)
  async function returnBrowser(browser, forceClose = false) {
    if (forceClose || browserPool.length >= MAX_BROWSERS) {
      await browser.close();
    } else {
      browserPool.push(browser);
    }
  }

  // Varsayılan sıralama seçenekleri
  const DEFAULT_SORT_OPTIONS = [
    'price-asc-rank',
    'price-desc-rank',
    'date-desc-rank',
    'review-rank',
    'relevance-rank'
  ];

  // Alfabetik arama terimleri - artık son strateji olarak kullanılacak
  const DEFAULT_SEARCH_TERMS = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
  ];

  // URL yardımcı fonksiyonları
  function ensurePageParam(url) {
    if (!url.includes("page=")) {
      return url + (url.includes("?") ? "&page=" : "?page=");
    }
    return url;
  }
  function addSortToUrl(url, sort) {
    const baseUrl = url.split('&s=')[0].split('?s=')[0];
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}s=${sort}`;
  }
  
  function addSearchTermToUrl(url, term) {
    const baseUrl = url.split('&k=')[0].split('?k=')[0];
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}k=${term}`;
  }
  function buildCategoryUrl(baseUrl, categoryId) {
    const parsedUrl = new URL(baseUrl);
    const path = parsedUrl.pathname.split('/');
    
    // Amazon URL'sini kategori formatına dönüştür
    // Örnek: /s?k=keyword --> /s?i=category&k=keyword
    
    if (!baseUrl.includes('i=')) {
      const connector = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${connector}i=${categoryId}`;
    } else {
      // Zaten bir kategori varsa, değiştir
      const urlParts = baseUrl.split('i=');
      const restOfUrl = urlParts[1].includes('&') ? 
        urlParts[1].substring(urlParts[1].indexOf('&')) : '';
      return `${urlParts[0]}i=${categoryId}${restOfUrl}`;
    }
  }
// Amazon URL'sinden ülke tespiti için yardımcı fonksiyon
function detectCountryFromAmazonUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    
    // Amazon domain-ülke eşleştirmeleri
    const amazonDomainMap = {
      'amazon.com': 'us',
      'amazon.co.uk': 'gb',
      'amazon.de': 'de', 
      'amazon.fr': 'fr',
      'amazon.it': 'it',
      'amazon.es': 'es',
      'amazon.co.jp': 'jp',
      'amazon.ca': 'ca',
      'amazon.com.br': 'br',
      'amazon.com.mx': 'mx',
      'amazon.com.au': 'au', 
      'amazon.in': 'in',
      'amazon.nl': 'nl',
      'amazon.se': 'se',
      'amazon.pl': 'pl',
      'amazon.com.tr': 'tr',
      'amazon.ae': 'ae',
      'amazon.sa': 'sa',
      'amazon.sg': 'sg'
    };
    
    // Domain'e göre ülke kodunu bul
    for (const [domain, countryCode] of Object.entries(amazonDomainMap)) {
      if (hostname.includes(domain)) {
        console.log(`🌍 URL ${url} için ülke tespit edildi: ${countryCode.toUpperCase()}`);
        return countryCode;
      }
    }
    
    // Eşleşme bulunamazsa varsayılan olarak US kullan
    console.log(`⚠️ URL ${url} için ülke tespit edilemedi, varsayılan US kullanılıyor`);
    return 'us';
  } catch (error) {
    console.error(`❌ Ülke tespiti sırasında hata: ${error.message}`);
    return 'us'; // Hata durumunda varsayılan
  }
}

// OxyLabs proxy URL'si oluşturan fonksiyon
function getOxylabsProxy(countryCode) {
  // OxyLabs kimlik bilgileri
  const OXYLABS_USERNAME = "customer-behlul_x6NlH";
  const OXYLABS_PASSWORD = "_Deneme12345";
  
  // Ülke kodlarına göre port numaraları haritası
  const countryPortMap = {
    'us': 10000,
    'ca': 30000,
    'gb': 20000,
    'de': 30000,
    'fr': 40000,
    'es': 10000,
    'it': 20000,
    'se': 30000,
    'gr': 40000,
    'pt': 10000,
    'nl': 20000,
    'be': 30000,
    'ru': 40000,
    'ua': 10000,
    'pl': 20000,
    'il': 20000,
    'tr': 30000,
    'au': 40000,
    'my': 10000,
    'th': 20000,
    'kr': 30000,
    'jp': 40000,
    'ph': 10000,
    'sg': 20000,
    'cn': 30000,
    'hk': 40000,
    'tw': 10000,
    'in': 20000,
    'pk': 30000,
    'ir': 40000,
    'id': 10000,
    'az': 20000,
    'kz': 30000,
    'ae': 40000,
    'mx': 10000,
    'br': 20000,
    'ar': 30000,
    'cl': 40000,
    'pe': 10000,
    'ec': 20000,
    'co': 30000,
    'za': 40000,
    'eg': 10000,
    'sa': 44000,
    'dk': 19000,
    // Daha fazla ülke eklenebilir
  };
  
  // Varsayılan port
  const defaultPort = 10000;
  
  // Geçerli ülke kodu kontrolü
  if (!countryCode) {
    console.warn('⚠️ Ülke kodu belirtilmedi, varsayılan US kullanılıyor');
    countryCode = 'us';
  }
  
  // Küçük harfe çevir
  countryCode = countryCode.toUpperCase();
  
  // Ülke koduna göre port numarasını belirle
  const port = countryPortMap[countryCode] || defaultPort;
  const username = `${OXYLABS_USERNAME}-cc-${countryCode}`;
  // Ülkeye özel OxyLabs Proxy URL'si oluştur
  return new URL(`http://${username}:${OXYLABS_PASSWORD}@pr.oxylabs.io:${port}`);

}

// URL için uygun proxy'yi döndüren fonksiyon
function getProxyForUrl(url) {
  if (!url) {
    console.warn('⚠️ URL belirtilmedi, proxy kullanılmıyor');
    return null;
  }
  
  const countryCode = detectCountryFromAmazonUrl(url);
  const proxy = getOxylabsProxy(countryCode);
  return proxy;
}

  // Tekli sayfa kazıma - optimize edilmiş
  async function scrapeSinglePage(url, proxy = null) {
    let browser = null;
    let forceClose = false;
    let proxySettings;
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
        // Her istekte çerezleri temizle
        clearCookiesAfterUse: true,
        // JavaScript başarım iyileştirmesi
        javaScriptEnabled: true,
        // Daha hızlı yükleme için ek ayarlar
        bypassCSP: true,
        ignoreHTTPSErrors: true
      });
      
      
      const page = await context.newPage();

// 🔍 CDP üzerinden trafik ölçümü başlat
const client = await context.newCDPSession(page);
let totalBytesTransferred = 0;
await client.send('Network.enable');
client.on('Network.loadingFinished', (event) => {
  totalBytesTransferred += event.encodedDataLength || 0;
});

// 🌐 Proxy test ve ısındırma
try {
  await page.goto('https://ip.oxylabs.io/location', { waitUntil: 'load' });
  const ipCheck = await page.evaluate(() => document.body.innerText);
  console.log(`🌐 Proxy IP kontrol sonucu:\n${ipCheck}`);
  await page.waitForTimeout(500); // Bağlantıyı stabilize etmek için
} catch (e) {
  console.warn('⚠️ Proxy kontrol başarısız:', e.message);
}

// 🔄 Buradaki 'url', zaten scrape edilecek hedef sayfa
await page.goto(url, { 
  timeout: 30000,
  waitUntil: 'load'
});
console.log(`📦 Gerçek veri kullanımı: ${(totalBytesTransferred / 1024 / 1024).toFixed(2)} MB`);
await page.route('**/*', route => {
  const url = route.request().url();
  const type = route.request().resourceType();

  // Kapsamlı engelleme listesi
  const blockIfUrlIncludes = [
    'amazon-adsystem',
    'googlesyndication',
    'doubleclick',
    'gstatic',
    'google-analytics',
    'fls-na.amazon',
    'fls-eu.amazon',
    'unagi',
    'm.media-amazon.com',
    'images-na.ssl-images-amazon.com',
    'images-eu.ssl-images-amazon.com',
    'media-amazon'
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




      // Timeout ayarlarını optimize et - süreyi arttırdık
      await page.goto(url, { 
        
        timeout: 30000, // 30 saniye olarak ayarlandı
        waitUntil: 'load' // JavaScript'in yüklenmesi için 'load' kullanıyoruz
      });
      
      // Amazon'un bot kontrollerini hızlıca kontrol et
      if (await page.content().then(html => 
        html.includes('Enter the characters you see below') || 
        html.includes('Sorry, we just need to make sure'))) {
        await context.close();
        return { asins: [], blocked: true };
      }
      
      // ASIN listesinin yüklenmesini bekle
      try {
        console.log(`⏳ ASIN listesi için bekleniyor: ${url}`);
        
        // ASIN içeren div'lerin yüklenmesini bekle - maksimum 15 saniye
        await page.waitForFunction(() => {
          const asinElements = document.querySelectorAll('div[data-asin]');
          // En az bir ASIN elementi varsa veya "Sonuç bulunamadı" mesajı varsa devam et
          return asinElements.length > 0 || 
                 document.body.textContent.includes('No results') ||
                 document.body.textContent.includes('No hay resultados') ||
                 document.body.textContent.includes('Keine Ergebnisse') ||
                 document.body.textContent.includes('Aucun résultat');
        }, { timeout: 15000 }); // 15 saniye bekle
        
        console.log(`✅ ASIN listesi yüklendi veya sonuç yok: ${url}`);
      } catch (e) {
        // Zaman aşımına uğrarsa log kaydı al ama devam et
        console.log(`⚠️ ASIN listesi beklerken zaman aşımı: ${url} - ${e.message}`);
      }

      const asins = await page.evaluate(() => {
        const results = new Set();
        const asinContainers = document.querySelectorAll('div[data-asin]');
      
        for (const container of asinContainers) {
          const asin = container.getAttribute('data-asin');
      
          // ASIN boş değilse ve gerçekten 10 karakterlik kodsa
          if (asin && asin.length === 10) {
            results.add(asin);
          }
        }
      
        return Array.from(results);
      });
      
      
      // Kategori ID'lerini toplama - yeni fonksiyon
      let categories = [];
      try {
        categories = await page.evaluate(() => {
          const categoryElements = document.querySelectorAll('#departments .a-spacing-micro .a-link-normal');
          const results = [];
          
          for (const element of categoryElements) {
            const url = element.getAttribute('href');
            if (url) {
              // i= parametresini bul
              const match = url.match(/[?&]i=([^&]+)/);
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
      return { asins, categories, success: true };
    } catch (e) {
      console.log(`❌ Hata: ${url} - ${e.message}`);
      forceClose = true; // Hata olursa tarayıcıyı tamamen kapat
      return { asins: [], categories: [], error: e.message };
    } finally {
      if (browser) {
        await returnBrowser(browser, forceClose);
      }
    }
  }

  // Chunk'lara ayırma yardımcısı - iş yükünü dengeler
  function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // YENI: Kategorileri getirme fonksiyonu
  async function fetchCategories(baseUrl, proxy = null) {
    console.log(`🔍 Kategoriler inceleniyor: ${baseUrl}`);
    
    try {
      const result = await scrapeSinglePage(baseUrl, proxy);
      if (result.success && result.categories && result.categories.length > 0) {
        console.log(`✅ ${result.categories.length} kategori bulundu`);
        return result.categories;
      } else {
        console.log(`⚠️ Hiç kategori bulunamadı`);
        return [];
      }
    } catch (e) {
      console.error(`❌ Kategorileri getirirken hata oluştu: ${e.message}`);
      return [];
    }
  }

  async function getAsinsWithStrategy(config) {
    const { 
      baseUrl, 
      maxPages = 20,
      targetAsinCount = 0,
      concurrency = 5, 
      proxy = null,  // Mevcut parametre
      useOxylabsProxy = true, // Yeni parametre
      sortOptions = DEFAULT_SORT_OPTIONS,
      searchTerms = [],
      maxEmptyPagesInRow = 3,
      enableCategorySearch = true 
    } = config;
  
    // Ülkeye özgü proxy belirle
    let actualProxy = proxy; // Kullanıcının sağladığı proxy varsa onu koru
    if (useOxylabsProxy && !proxy) {
      actualProxy = getProxyForUrl(baseUrl);
      if (actualProxy) {
        // Şifreyi gizleyerek loglama
        const maskedProxy = actualProxy.toString().replace(/:[^:]*@/, ':***@');

        console.log(`🔒 Ülkeye özel OxyLabs proxy kullanılıyor: ${maskedProxy}`);
      } else {
        console.log(`⚠️ OxyLabs proxy oluşturulamadı, proxy kullanılmadan devam ediliyor`);
      }
    }
  

    // Tüm benzersiz ASIN'leri depolamak için
    const allAsins = new Set();
    
    // İstatistikler
    const stats = {
      successfulRequests: 0,
      blockedRequests: 0,
      errorRequests: 0,
      pagesProcessed: 0,
      strategiesUsed: 0,
      strategiesSkipped: 0,
      categoriesFound: 0,
      categoriesSearched: 0
    };
    
    // URL stratejilerini hazırla
    const urlStrategies = [];
    
    // 1. STRATEJİ: İlk olarak sıralama seçeneklerine göre ana URL'leri işle
    console.log(`🔄 Sıralama stratejilerini hazırlama...`);
    for (const sort of sortOptions) {
      const sortedBaseUrl = addSortToUrl(baseUrl, sort);
      const urls = [];
      
      for (let i = 1; i <= maxPages; i++) {
        urls.push({
          url: `${ensurePageParam(sortedBaseUrl)}${i}`,
          type: 'sort',
          strategy: sort,
          page: i
        });
      }
      
      urlStrategies.push({
        type: 'sort',
        name: sort,
        urls: urls
      });
    }
    
    // Hedef ASIN sayısına ulaşılmadıysa, kategorileri işle
    let categories = [];
    
    if (enableCategorySearch) {
      // Kategorileri getir
      // Kategorileri getir
categories = await fetchCategories(baseUrl, actualProxy);
      stats.categoriesFound = categories.length;
      
      // 2. STRATEJİ: Her bir kategori için sıralama seçeneklerini uygula
      if (categories.length > 0) {
        console.log(`🔄 ${categories.length} kategori için stratejiler hazırlanıyor...`);
        
        for (const category of categories) {
          const categoryBaseUrl = buildCategoryUrl(baseUrl, category.id);
          
          for (const sort of sortOptions) {
            const sortedCategoryUrl = addSortToUrl(categoryBaseUrl, sort);
            const urls = [];
            
            for (let i = 1; i <= maxPages; i++) {
              urls.push({
                url: `${ensurePageParam(sortedCategoryUrl)}${i}`,
                type: 'category_sort',
                strategy: `${category.name} (${sort})`,
                categoryId: category.id,
                categoryName: category.name,
                sort: sort,
                page: i
              });
            }
            
            urlStrategies.push({
              type: 'category_sort',
              name: `${category.name} (${sort})`,
              urls: urls
            });
          }
        }
      }
    }
    
    // 3. STRATEJİ: SON OLARAK arama terimlerini hazırla (a-z, 0-9 en sona koyuldu)
    if (searchTerms && searchTerms.length > 0) {
      console.log(`🔄 ${searchTerms.length} arama terimi stratejisi hazırlanıyor...`);
      
      for (const term of searchTerms) {
        const searchUrl = addSearchTermToUrl(baseUrl, encodeURIComponent(term));
        const urls = [];
        
        for (let i = 1; i <= maxPages; i++) {
          urls.push({
            url: `${ensurePageParam(searchUrl)}${i}`,
            type: 'search',
            strategy: term,
            page: i
          });
        }
        
        urlStrategies.push({
          type: 'search',
          name: term,
          urls: urls
        });
        
        // Arama terimini kategorilere de uygula
        if (enableCategorySearch && categories.length > 0) {
          for (const category of categories) {
            const categoryBaseUrl = buildCategoryUrl(baseUrl, category.id);
            const categorySearchUrl = addSearchTermToUrl(categoryBaseUrl, encodeURIComponent(term));
            const urls = [];
            
            for (let i = 1; i <= maxPages; i++) {
              urls.push({
                url: `${ensurePageParam(categorySearchUrl)}${i}`,
                type: 'category_search',
                strategy: `${category.name} (${term})`,
                categoryId: category.id,
                categoryName: category.name,
                searchTerm: term,
                page: i
              });
            }
            
            urlStrategies.push({
              type: 'category_search',
              name: `${category.name} (${term})`,
              urls: urls
            });
          }
        }
      }
    }
    
    console.log(`🎯 Toplam ${urlStrategies.length} strateji hazırlandı`);
    
    // URL stratejilerini sırayla işle
    for (const strategy of urlStrategies) {
      console.log(`🔍 Strateji başlatılıyor: ${strategy.type}:${strategy.name}`);
      
      // Hedef ASIN sayısına ulaştıysak işlemi sonlandır
      if (targetAsinCount > 0 && allAsins.size >= targetAsinCount) {
        console.log(`🎯 Hedef ASIN sayısına ulaşıldı: ${allAsins.size}/${targetAsinCount}`);
        break;
      }
      
      let emptyPagesInRow = 0;
      const batchSize = Math.min(concurrency, MAX_BROWSERS);
      
      // Kategori araması ise, kategorilerden sayar
      if (strategy.type.includes('category')) {
        stats.categoriesSearched++;
      }
      
      // Bu strateji için URL'leri grup grup işle
      for (let startIndex = 0; startIndex < strategy.urls.length; startIndex += batchSize) {
        // Hedef ASIN sayısına ulaştıysak işlemi sonlandır
        if (targetAsinCount > 0 && allAsins.size >= targetAsinCount) {
          console.log(`🎯 Strateji içinde hedef ASIN sayısına ulaşıldı: ${allAsins.size}/${targetAsinCount}`);
          break;
        }
        
        // Arka arkaya çok fazla boş sayfa geldiyse bu stratejiyi sonlandır ve bir sonrakine geç
        if (emptyPagesInRow >= maxEmptyPagesInRow) {
          console.log(`⚠️ ${strategy.type}:${strategy.name} için arka arkaya ${maxEmptyPagesInRow} boş sayfa. Bu strateji atlanıyor.`);
          stats.strategiesSkipped++;
          break;
        }
        
        // Bu grupta işlenecek URL'leri al
        const endIndex = Math.min(startIndex + batchSize, strategy.urls.length);
        const currentBatch = strategy.urls.slice(startIndex, endIndex);
        
        const batchStartTime = Date.now();
        
        // URL'leri paralel olarak işle
        // URL'leri paralel olarak işle
        const promises = currentBatch.map(urlObj => scrapeSinglePage(urlObj.url, actualProxy));
        const results = await Promise.all(promises);
        
        let batchHasResults = false;
        
        // Sonuçları işle
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const urlInfo = currentBatch[i];
          stats.pagesProcessed++;
          
          if (result.success) {
            stats.successfulRequests++;
            
            // ASIN'leri ekle
            const initialSize = allAsins.size;
            result.asins.forEach(asin => allAsins.add(asin));
            const newAsinsCount = allAsins.size - initialSize;
            
            // Yeni ASIN'ler eklenip eklenmediğini kontrol et
            if (newAsinsCount > 0) {
              console.log(`✅ ${urlInfo.type}:${urlInfo.strategy} sayfa ${urlInfo.page}: ${result.asins.length} ASIN bulundu (${newAsinsCount} yeni)`);
              emptyPagesInRow = 0; // Boş sayfa sayacını sıfırla
              batchHasResults = true;
            } else if (result.asins.length > 0) {
              console.log(`🔄 ${urlInfo.type}:${urlInfo.strategy} sayfa ${urlInfo.page}: ${result.asins.length} ASIN bulundu (hepsi zaten var)`);
              batchHasResults = true;
            } else {
              console.log(`⚠️ ${urlInfo.type}:${urlInfo.strategy} sayfa ${urlInfo.page}: Hiç ASIN bulunamadı`);
              emptyPagesInRow++;
            }
          } else if (result.blocked) {
            stats.blockedRequests++;
            console.log(`🚫 Engellendi: ${urlInfo.url}`);
          } else {
            stats.errorRequests++;
            console.log(`❌ Hata: ${urlInfo.url}`);
          }
        }
        
        // Bu batch'te hiç sonuç yoksa, boş sayfa sayacını artır
        if (!batchHasResults) {
          emptyPagesInRow++;
        }
        
        // Rate limiting için bekleme süresi
        const batchDuration = Date.now() - batchStartTime;
        const targetBatchTime = 2000; // 2 saniye
        
        if (batchDuration < targetBatchTime && startIndex + batchSize < strategy.urls.length) {
          const delay = targetBatchTime - batchDuration;
          console.log(`⏱️ Rate limiting önlemi: ${delay}ms bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // İlerleme durumunu logla
        if (targetAsinCount > 0) {
          const progressPercentage = Math.min(100, Math.round((allAsins.size / targetAsinCount) * 100));
          console.log(`📊 İlerleme: ${allAsins.size}/${targetAsinCount} ASIN (%${progressPercentage})`);
        } else {
          console.log(`📊 Toplam: ${allAsins.size} benzersiz ASIN bulundu`);
        }
      }
      
      // Strateji başarıyla tamamlandı
      stats.strategiesUsed++;
    }
    
    return {
      asins: Array.from(allAsins),
      stats: {
        uniqueAsinCount: allAsins.size,
        pagesProcessed: stats.pagesProcessed,
        successfulRequests: stats.successfulRequests,
        blockedRequests: stats.blockedRequests,
        errorRequests: stats.errorRequests,
        strategiesUsed: stats.strategiesUsed,
        strategiesSkipped: stats.strategiesSkipped,
        categoriesFound: stats.categoriesFound,
        categoriesSearched: stats.categoriesSearched,
        targetReached: targetAsinCount > 0 && allAsins.size >= targetAsinCount
      }
    };
  }

  // GET endpoint - düzeltilmiş versiyon
app.get('/get-asins', async (req, res) => {
  const baseUrlParam = req.query.url;
  const maxPagesParam = req.query.pages;
  const targetAsinCountParam = req.query.target_asins;
  const proxyParam = req.query.proxy; // Bu satır eksik olabilir, ekliyoruz
  const useOxylabsProxyParam = req.query.use_oxylabs_proxy !== 'false'; // Varsayılan olarak aktif
  const sortParam = req.query.sort;
  const useSearchTerms = req.query.use_search === 'true';
  const concurrencyParam = req.query.concurrency;
  const maxEmptyPagesParam = req.query.max_empty_pages;
  const useCategoriesParam = req.query.use_categories !== 'false';

  if (!baseUrlParam) {
    return res.status(400).json({ error: "Lütfen 'url' parametresi sağlayın." });
  }

  const maxPages = parseInt(maxPagesParam) || 20;
  const targetAsinCount = parseInt(targetAsinCountParam) || 0;
  const concurrency = parseInt(concurrencyParam) || 3;
  const maxEmptyPagesInRow = parseInt(maxEmptyPagesParam) || 3;

  if (isNaN(maxPages)) {
    return res.status(400).json({ error: "'pages' sayısal bir değer olmalıdır." });
  }
  
  if (isNaN(targetAsinCount)) {
    return res.status(400).json({ error: "'target_asins' sayısal bir değer olmalıdır." });
  }

  try {
    console.log(`📥 API isteği: ${baseUrlParam} (targetAsins=${targetAsinCount}, maxPages=${maxPages}, useCategories=${useCategoriesParam})`);
    
    // Sıralama stratejisi
    let sortOptions = DEFAULT_SORT_OPTIONS;
    if (sortParam) {
      sortOptions = [sortParam];
    }
    
    // Arama terimleri stratejisi
    const searchTerms = useSearchTerms ? DEFAULT_SEARCH_TERMS : [];
    
    const result = await getAsinsWithStrategy({
      baseUrl: baseUrlParam,
      maxPages,
      targetAsinCount,
      concurrency,
      proxy: proxyParam, // Bu satırda proxyParam kullanılıyor
      useOxylabsProxy: useOxylabsProxyParam,
      sortOptions,
      searchTerms,
      maxEmptyPagesInRow,
      enableCategorySearch: useCategoriesParam
    });
    
    return res.json({
      count: result.asins.length,
      asins: result.asins,
      stats: result.stats,
      worker: process.pid
    });
  } catch (e) {
    console.error("❌ Bir hata oluştu:", e);
    return res.status(500).json({ error: e.message });
  }
});
  // Tarayıcı havuzunu başlat ve sunucuyu çalıştır
  const PORT = process.env.PORT || 5000;
  
  initBrowserPool().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Worker ${process.pid} dinleniyor → http://localhost:${PORT}`);
    });
  });
  
  // Uygulama kapanırken temizlik yap
  process.on('SIGINT', async () => {
    console.log('Sunucu kapatılıyor, tarayıcı havuzu temizleniyor...');
    for (const browser of browserPool) {
      await browser.close().catch(console.error);
    }
    process.exit(0);
  });
}

