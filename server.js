// server.js - Storefront Kontrolü ile Güncellenmiş
const express = require('express');
const cors = require('cors');
const cluster = require('cluster');
const os = require('os');

const { getAsinsWithStrategy } = require('./strategyBuilder');
const {
  initBrowserPool,
  closeAllBrowsers,
  MAX_BROWSERS
} = require('./browserPools');

// Worker sayısı = CPU sayısı - 1
const NUM_WORKERS = Math.max(1, os.cpus().length - 1);

if (cluster.isMaster) {
  console.log(`🚀 Ana süreç ${process.pid} başlatıldı, ${NUM_WORKERS} işçi oluşturuluyor...`);
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker) => {
    console.log(`⚠️ Worker ${worker.process.pid} çöktü. Yeniden başlatılıyor...`);
    cluster.fork();
  });
} else {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Helper function to check if URL is a storefront
  function isStorefrontUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.has('me');
    } catch (e) {
      return false;
    }
  }

  // Ana scraping endpoint'i - SADECE Storefront desteği
  app.get('/get-asins', async (req, res) => {
    const {
      url: baseUrl,
      pages,
      target_asins,
      storefront_id,
      concurrency,
      max_empty_pages
    } = req.query;

    if (!baseUrl) {
      return res.status(400).json({ 
        error: "Lütfen 'url' parametresi sağlayın.",
        storefront_required: true 
      });
    }

    // Storefront kontrolü
    if (!isStorefrontUrl(baseUrl) && !storefront_id) {
      return res.status(400).json({ 
        error: "Bu uygulama sadece storefront URL'leri için çalışır. Lütfen 'me=' parametresi içeren bir URL kullanın.",
        storefront_required: true,
        example: "https://amazon.com/s?me=STOREFRONT_ID&marketplaceID=ATVPDKIKX0DER"
      });
    }

    const config = {
      baseUrl,
      maxPages: parseInt(pages) || 100,
      targetAsinCount: parseInt(target_asins) || 1000,
      concurrency: parseInt(concurrency) || 3,
      maxEmptyPagesInRow: 2, // Sabit 2 boş sayfa
      storefrontId: storefront_id || null
    };

    try {
      console.log(`📥 STOREFRONT ASIN toplama isteği:`);
      console.log(`🌐 URL: ${baseUrl}`);
      console.log(`🎯 Hedef ASIN: ${config.targetAsinCount}`);
      console.log(`📄 Max empty pages: ${config.maxEmptyPagesInRow}`);
      if (config.storefrontId) {
        console.log(`🏪 Storefront ID: ${config.storefrontId}`);
      }
      
      const result = await getAsinsWithStrategy(config);

      return res.json({
        success: true,
        count: result.asins.length,
        asins: result.asins,
        stats: result.stats,
        worker: process.pid,
        storefront: {
          id: result.stats.detectedStorefrontId,
          isStorefront: true,
          maxEmptyPages: config.maxEmptyPagesInRow
        },
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error("❌ Hata:", e);
      
      // Storefront hatası özel mesajı
      if (e.message.includes('storefront')) {
        return res.status(400).json({ 
          error: e.message,
          storefront_required: true,
          example: "https://amazon.com/s?me=STOREFRONT_ID&marketplaceID=ATVPDKIKX0DER"
        });
      }
      
      return res.status(500).json({ error: e.message });
    }
  });

  // Sistem durumu endpoint'i
  app.get('/status', (req, res) => {
    return res.json({
      success: true,
      status: 'Server çalışıyor (SADECE STOREFRONT)',
      worker: process.pid,
      requirements: {
        storefront_only: true,
        max_empty_pages: 2,
        categories_disabled: true
      },
      timestamp: new Date().toISOString()
    });
  });

  // Test endpoint'i - storefront kontrolü ile
  app.post('/test', async (req, res) => {
    const { 
      url = 'https://amazon.com/s?me=A2L77EE7U53NWQ&marketplaceID=ATVPDKIKX0DER', 
      count = 3 
    } = req.body;
    
    // Test URL'i storefront kontrolü
    if (!isStorefrontUrl(url)) {
      return res.status(400).json({ 
        error: "Test URL'i storefront olmalıdır (me= parametresi içermeli)",
        provided_url: url,
        example: "https://amazon.com/s?me=STOREFRONT_ID&marketplaceID=ATVPDKIKX0DER"
      });
    }
    
    try {
      console.log(`🧪 STOREFRONT Test başlatılıyor: ${count} test`);
      
      const results = [];
      for (let i = 0; i < count; i++) {
        const startTime = Date.now();
        
        // Basit test için scraper'ı import et
        const { scrapeSinglePage } = require('./scraper');
        const result = await scrapeSinglePage(url, true);
        
        const duration = Date.now() - startTime;
        
        results.push({
          test: i + 1,
          success: result.success || false,
          asins: result.asins ? result.asins.length : 0,
          duration: `${duration}ms`,
          error: result.error || null,
          storefront: true
        });
        
        // Test'ler arası bekleme
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      return res.json({
        success: true,
        testResults: results,
        storefront_mode: true,
        timestamp: new Date().toISOString()
      });
      
    } catch (e) {
      console.error('Test hatası:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Storefront URL validator endpoint
  app.get('/validate-storefront', (req, res) => {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        error: "URL parametresi gerekli" 
      });
    }

    const isStorefront = isStorefrontUrl(url);
    let storefrontId = null;
    
    if (isStorefront) {
      try {
        const urlObj = new URL(url);
        storefrontId = urlObj.searchParams.get('me');
      } catch (e) {
        // ignore
      }
    }

    return res.json({
      url,
      isStorefront,
      storefrontId,
      valid: isStorefront,
      message: isStorefront ? 
        "Geçerli storefront URL'i" : 
        "Geçersiz - Storefront URL'i değil (me= parametresi bulunamadı)"
    });
  });

  const PORT = process.env.PORT || 5000;
  
  Promise.all([
    initBrowserPool(),
    // Webshare proxy'leri de başlangıçta yükle
    (async () => {
      try {
        const { initWebshareProxies } = require('./scraper');
        await initWebshareProxies();
        console.log('🌐 Webshare proxy sistemi başlatıldı');
      } catch (e) {
        console.warn('⚠️ Webshare proxy sistemi başlatılamadı:', e.message);
      }
    })()
  ]).then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Worker ${process.pid} dinleniyor → http://localhost:${PORT}`);
      console.log(`✅ Sistem hazır - SADECE STOREFRONT URL'leri desteklenir`);
      console.log(`🏪 /get-asins endpoint'i - me= parametresi zorunlu`);
      console.log(`📄 Max empty pages: 2 (sabit)`);
      console.log(`❌ Kategori çıkarma: Devre dışı`);
    });
  }).catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('🧹 Sunucu kapatılıyor...');
    await closeAllBrowsers();
    process.exit(0);
  });
}