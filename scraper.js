// scraper.js - Enhanced Bot Detection ile Güncellenmiş (Kategori çıkarma kaldırıldı)
const { getBrowser, returnBrowser } = require('./browserPools');
const WebshareProxyManager = require('./webshareManager');
const BrowserFingerprintManager = require('./fingerprintManager');
const HumanBehaviorSimulator = require('./humanBehavior');
const AdvancedCaptchaHandler = require('./captchaHandler');
const SessionManager = require('./sessionManager');

const URLValidator = require('./urlValidator');

// Global managers
let webshareManager = null;
const fingerprintManager = new BrowserFingerprintManager();
const captchaHandler = new AdvancedCaptchaHandler();
const sessionManager = new SessionManager();
const urlValidator = new URLValidator();

// Initialize WebshareProxyManager
async function initWebshareProxies() {
  if (!webshareManager) {
    webshareManager = new WebshareProxyManager();
    await webshareManager.loadProxies();
    console.log('🌐 Webshare proxy sistemi hazır');
  }
  return webshareManager;
}

async function scrapeSinglePage(url, useWebshareProxy = true, sessionId = null) {
  // URL validation first
  const urlValidation = urlValidator.validateAndCleanURL(url);
  if (!urlValidation.isValid) {
    console.error(`❌ Geçersiz URL: ${url} - ${urlValidation.error}`);
    
    // Try alternative URL
    const altURL = urlValidator.generateAlternativeURL(url);
    const altValidation = urlValidator.validateAndCleanURL(altURL);
    
    if (altValidation.isValid) {
      console.log(`🔄 Alternative URL kullanılıyor: ${altURL}`);
      url = altValidation.cleanURL;
    } else {
      return { 
        asins: [], 
        categories: [], // Kategori boş array olarak döner ama kullanılmaz
        error: `URL validation failed: ${urlValidation.error}`,
        responseTime: 0,
        urlValidationError: true
      };
    }
  } else {
    url = urlValidation.cleanURL;
    if (urlValidation.warnings.length > 0) {
      console.warn(`⚠️ URL warnings: ${urlValidation.warnings.join(', ')}`);
    }
  }

  let browser = null;
  let forceClose = false;
  let proxySettings = null;
  let selectedProxy = null;
  let session = null;
  let behavior = null;
  let fingerprint = null;
  const startTime = Date.now();

  try {
    // Webshare proxy manager'ı başlat
    if (useWebshareProxy && !webshareManager) {
      await initWebshareProxies();
    }

    // Session yönetimi
    if (sessionId) {
      session = sessionManager.getSession(sessionId);
      if (!session) {
        console.warn(`⚠️ Session bulunamadı, yeni session oluşturuluyor: ${sessionId}`);
      }
    }

    // Proxy seçimi
    if (useWebshareProxy && webshareManager) {
      selectedProxy = webshareManager.getNextProxy();
      if (!selectedProxy) {
        console.warn('⚠️ Webshare proxy alınamadı, proxy olmadan devam ediliyor');
        proxySettings = null;
      } else {
        proxySettings = webshareManager.getProxySettings(selectedProxy);
        console.log(`🌐 Webshare proxy seçildi: ${selectedProxy.ip}`);
        
        // Session yoksa proxy bilgisi ile oluştur
        if (!session && selectedProxy) {
          sessionId = sessionManager.createSession(selectedProxy, 'us');
          session = sessionManager.getSession(sessionId);
        }
      }
    } else if (useWebshareProxy && !webshareManager) {
      console.warn('⚠️ Webshare manager henüz yüklenmemiş, başlatılıyor...');
      try {
        await initWebshareProxies();
        selectedProxy = webshareManager.getNextProxy();
        if (selectedProxy) {
          proxySettings = webshareManager.getProxySettings(selectedProxy);
          console.log(`🌐 Geç yüklenen proxy kullanılıyor: ${selectedProxy.ip}`);
        }
      } catch (e) {
        console.warn('⚠️ Webshare proxy başlatılamadı:', e.message);
        proxySettings = null;
      }
    }

    // Fingerprint ve behavior
    if (session) {
      fingerprint = session.fingerprint;
      behavior = session.behavior;
    } else {
      fingerprint = fingerprintManager.generateFingerprint('us');
      behavior = new HumanBehaviorSimulator();
    }

    // Browser context oluşturma
    browser = await getBrowser();
    
    const contextOptions = fingerprintManager.prepareContextOptions(fingerprint);
    contextOptions.proxy = proxySettings;
    
    // Enhanced context settings
    Object.assign(contextOptions, {
      clearCookiesAfterUse: true,
      javaScriptEnabled: true,
      bypassCSP: true,
      ignoreHTTPSErrors: true
    });
    
    // Proxy settings - null check ekle
    if (proxySettings && proxySettings.server) {
      contextOptions.proxy = proxySettings;
      console.log(`🌐 Proxy kullanılıyor: ${proxySettings.server.replace('http://', '')}`);
    } else {
      console.log(`🌐 Proxy olmadan devam ediliyor`);
      // Proxy yoksa context options'tan proxy'yi kaldır
      delete contextOptions.proxy;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Advanced anti-detection script injection
    await page.addInitScript(fingerprintManager.getAntiDetectionScript(fingerprint));

    // İnsan benzeri davranış - sayfa yüklenmeden önce delay
    if (behavior) {
      await behavior.humanDelay();
    }

    // Intelligent resource blocking
    await page.route('**/*', route => {
      const requestUrl = route.request().url();
      const type = route.request().resourceType();

      const blockPatterns = [
        'amazon-adsystem',
        'googlesyndication', 
        'doubleclick',
        'google-analytics',
        'googletagmanager',
        'gstatic.com',
        'fls-na.amazon',
        'fls-eu.amazon',
        'unagi',
        'm.media-amazon.com',
        'amazonwebservices.com'
      ];

      // Akıllı blocking - bazı kaynakları geçir (daha doğal)
      const shouldBlock = 
        blockPatterns.some(pattern => requestUrl.includes(pattern)) ||
        (type === 'image' && Math.random() < 0.85) || // %85 image engelle
        (type === 'stylesheet' && Math.random() < 0.70) || // %70 CSS engelle
        (type === 'font' && Math.random() < 0.90) || // %90 font engelle
        (type === 'media' && Math.random() < 0.95); // %95 media engelle

      return shouldBlock ? route.abort() : route.continue();
    });

    // Request performance monitoring
    let totalBytesTransferred = 0;
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    client.on('Network.loadingFinished', (event) => {
      totalBytesTransferred += event.encodedDataLength || 0;
    });

    // Ana sayfa yükleme
    console.log(`📄 Sayfa yükleniyor: ${url}`);
    await page.goto(url, {
      timeout: 5000,
      waitUntil: 'domcontentloaded'
    });

    // CAPTCHA detection ve handling
    const hasCaptcha = await captchaHandler.detectCaptcha(page);
    if (hasCaptcha) {
      console.warn(`🛑 CAPTCHA tespit edildi: ${url}`);
      
      const captchaResolved = await captchaHandler.handleCaptcha(
        page, 
        selectedProxy, 
        sessionManager, 
        sessionId
      );
      
      if (!captchaResolved) {
        await context.close();
        const responseTime = Date.now() - startTime;
        
        // Proxy ve session sonucu kaydet
        if (selectedProxy) {
          webshareManager.recordProxyResult(selectedProxy.id, false, responseTime, 'captcha');
        }
        if (sessionId) {
          sessionManager.recordSessionResult(sessionId, false, responseTime, true);
        }
        
        return { asins: [], categories: [], blocked: true, captcha: true, responseTime };
      }
    }

    // İnsan benzeri davranış simülasyonu
    if (behavior) {
      await behavior.performFullBehaviorSimulation(page);
    }

    // %20 ihtimalle random navigation
    if (Math.random() < 0.20) {
      await performRandomNavigation(page);
    }

    // ASIN bekleme (geliştirilmiş)
    console.log(`⏳ ASIN listesi bekleniyor: ${url}`);
    
    try {
      await page.waitForFunction(() => {
        return document.querySelector('div[data-asin]') || 
               document.querySelector('[data-component-type="s-search-result"]') ||
               document.body.innerText.includes('No results') ||
               document.body.innerText.includes('no results found') ||
               document.body.innerText.includes('did not match any products');
      }, { timeout: 5000 });
      
      console.log(`✅ ASIN listesi yüklendi: ${url}`);
    } catch (e) {
      console.log(`⚠️ ASIN bekleme timeout: ${url} - Devam ediliyor`);
    }

    // Final CAPTCHA check
    if (await captchaHandler.detectCaptcha(page)) {
      console.warn(`🛑 İkinci CAPTCHA tespit edildi, sayfa atlanıyor: ${url}`);
      await context.close();
      
      const responseTime = Date.now() - startTime;
      if (selectedProxy) {
        webshareManager.recordProxyResult(selectedProxy.id, false, responseTime, 'captcha_final');
      }
      if (sessionId) {
        sessionManager.recordSessionResult(sessionId, false, responseTime, true);
      }
      
      return { asins: [], categories: [], blocked: true, captcha: true, responseTime };
    }

    // Enhanced ASIN extraction
    const asins = await page.evaluate(() => {
      const results = new Set();
      
      // Multiple ASIN extraction strategies
      const strategies = [
        // Strategy 1: data-asin attribute
        () => {
          document.querySelectorAll('div[data-asin], [data-asin]').forEach(el => {
            const asin = el.getAttribute('data-asin');
            if (asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin)) {
              results.add(asin);
            }
          });
        },
        
        // Strategy 2: Search result containers
        () => {
          document.querySelectorAll('[data-component-type="s-search-result"]').forEach(el => {
            const asin = el.getAttribute('data-asin');
            if (asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin)) {
              results.add(asin);
            }
          });
        },
        
        // Strategy 3: Product links
        () => {
          document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]').forEach(link => {
            const href = link.getAttribute('href');
            const asinMatch = href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
            if (asinMatch && asinMatch[1]) {
              results.add(asinMatch[1]);
            }
          });
        }
      ];
      
      // Execute all strategies
      strategies.forEach(strategy => {
        try {
          strategy();
        } catch (e) {
          console.warn('ASIN extraction strategy failed:', e);
        }
      });
      
      return Array.from(results);
    });

    // Kategori çıkarma tamamen kaldırıldı - sadece boş array döner
    const categories = [];

    await context.close();

    // Performance metrics
    const responseTime = Date.now() - startTime;
    const mbTransferred = (totalBytesTransferred / 1024 / 1024).toFixed(2);

    // Success recording
    if (selectedProxy) {
      webshareManager.recordProxyResult(selectedProxy.id, true, responseTime);
    }
    if (sessionId) {
      sessionManager.recordSessionResult(sessionId, true, responseTime, hasCaptcha);
    }

    console.log(`✅ Scraping başarılı: ${asins.length} ASIN | ${responseTime}ms | ${mbTransferred}MB`);

    return { 
      asins, 
      categories, // Artık hep boş array
      success: true, 
      responseTime,
      bytesTransferred: totalBytesTransferred,
      captcha: hasCaptcha,
      proxy: selectedProxy?.ip,
      sessionId
    };

  } catch (error) {
    console.log(`❌ Scraping hatası: ${url} - ${error.message}`);
    forceClose = true;
    
    const responseTime = Date.now() - startTime;
    const errorType = error.name || 'UnknownError';
    
    // Error recording
    if (selectedProxy) {
      webshareManager.recordProxyResult(selectedProxy.id, false, responseTime, errorType);
    }
    if (sessionId) {
      sessionManager.recordSessionResult(sessionId, false, responseTime, false, errorType);
    }
    
    return { 
      asins: [], 
      categories: [], 
      error: error.message,
      responseTime,
      errorType,
      proxy: selectedProxy?.ip,
      sessionId
    };
  } finally {
    if (browser) {
      await returnBrowser(browser, forceClose);
    }
  }
}

// Random navigation helper
async function performRandomNavigation(page) {
  try {
    console.log('🎯 Random navigation simülasyonu');
    
    const actions = [
      // Amazon logo'ya hover
      async () => {
        const logo = await page.$('#nav-logo, .nav-logo');
        if (logo) await logo.hover();
      },
      
      // Search box'a tıklama
      async () => {
        const searchBox = await page.$('#twotabsearchtextbox, input[name="field-keywords"]');
        if (searchBox) {
          await searchBox.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      },
      
      // Category hover
      async () => {
        const categories = await page.$$('#nav-shop .nav-a, .nav-category-menu a');
      },
      
      // Scroll biraz
      async () => {
        await page.evaluate(() => {
          window.scrollBy(0, 200 + Math.random() * 300);
        });
      }
    ];

    // 1-2 random action yap
    const actionCount = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < actionCount; i++) {
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      await randomAction();
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
    }

  } catch (error) {
    console.log('⚠️ Random navigation error:', error.message);
  }
}

// Export functions
module.exports = {
  scrapeSinglePage,
  initWebshareProxies,
  
  // Manager getters
  getWebshareManager: () => webshareManager,
  getFingerprintManager: () => fingerprintManager,
  getCaptchaHandler: () => captchaHandler,
  getSessionManager: () => sessionManager,
  
  // Stats functions
  getWebshareStats: () => webshareManager ? webshareManager.getProxyStats() : null,
  getCaptchaStats: () => captchaHandler.getCaptchaStats(),
  getSessionStats: () => sessionManager.getSessionStats(),
  getFingerprintStats: () => fingerprintManager.getStats(),
  
  // Utility functions
  resetWebshareProxies: () => webshareManager ? webshareManager.resetAllProxies() : null,
  clearAllSessions: () => sessionManager.clearAllSessions(),
  
  // Risk assessment
  getCaptchaRiskAssessment: () => captchaHandler.assessCaptchaRisk()
};