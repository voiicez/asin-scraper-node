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
const { DEFAULT_SORT_OPTIONS, DEFAULT_SEARCH_TERMS } = require('./defaultValues');

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

  app.get('/get-asins', async (req, res) => {
    const {
      url: baseUrl,
      pages,
      target_asins,
      proxy,
      use_oxylabs_proxy,
      sort,
      use_search,
      concurrency,
      max_empty_pages,
      use_categories
    } = req.query;

    if (!baseUrl) {
      return res.status(400).json({ error: "Lütfen 'url' parametresi sağlayın." });
    }

    const config = {
      baseUrl,
      maxPages: parseInt(pages) || 20,
      targetAsinCount: parseInt(target_asins) || 0,
      proxy: proxy || null,
      useOxylabsProxy: use_oxylabs_proxy !== 'false',
      sortOptions: sort ? [sort] : DEFAULT_SORT_OPTIONS,
      searchTerms: use_search === 'true' ? DEFAULT_SEARCH_TERMS : [],
      concurrency: parseInt(concurrency) || 3,
      maxEmptyPagesInRow: parseInt(max_empty_pages) || 3,
      enableCategorySearch: use_categories !== 'false'
    };

    try {
      console.log(`📥 API isteği: ${baseUrl}`);
      const result = await getAsinsWithStrategy(config);

      return res.json({
        count: result.asins.length,
        asins: result.asins,
        stats: result.stats,
        worker: process.pid
      });
    } catch (e) {
      console.error("❌ Hata:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  const PORT = process.env.PORT || 5000;
  initBrowserPool().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Worker ${process.pid} dinleniyor → http://localhost:${PORT}`);
    });
  });

  process.on('SIGINT', async () => {
    console.log('🧹 Sunucu kapatılıyor, tarayıcılar kapatılıyor...');
    await closeAllBrowsers();
    process.exit(0);
  });
}
