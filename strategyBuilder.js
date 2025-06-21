// strategyBuilder.js - 20.000 ASIN için ultra detaylı micro-segmentation
const URLValidator = require('./urlValidator');
const { scrapeSinglePage, getSessionManager, initWebshareProxies, getWebshareManager } = require('./scraper');
const adaptiveScrape = require('./adaptiveScraper');

const urlValidator = new URLValidator();

async function getAsinsWithStrategy(config) {
  const {
    baseUrl,
    maxPages = 20,
    targetAsinCount = 20000, // 20K ASIN hedefi
    concurrency = 3,
    maxEmptyPagesInRow = 2,
    storefrontId = null
  } = config;

  const allAsins = new Set();
  const stats = {
    successfulRequests: 0,
    blockedRequests: 0,
    errorRequests: 0,
    pagesProcessed: 0,
    strategiesUsed: 0,
    strategiesSkipped: 0,
    urlValidationErrors: 0,
    strategiesCompleted: 0,
    detectedStorefrontId: extractStorefrontId(baseUrl),
    segmentPerformance: {}
  };

  // URL validation
  const urlValidation = urlValidator.validateAndCleanURL(baseUrl);
  if (!urlValidation.isValid) {
    throw new Error(`URL validation failed: ${urlValidation.error}`);
  }

  const cleanBaseUrl = urlValidation.cleanURL;
  const isStorefront = cleanBaseUrl.includes('me=') || storefrontId;
  
  if (!isStorefront) {
    throw new Error('Bu uygulama sadece storefront URL\'leri için çalışır. Lütfen me= parametresi içeren bir URL kullanın.');
  }
  
  console.log(`✅ Base URL validated: ${cleanBaseUrl}`);
  console.log(`🏪 Storefront detected: ${stats.detectedStorefrontId}`);
  console.log(`🎯 ULTRA TARGET: ${targetAsinCount} ASIN (20K hedefi!)`);
  console.log(`📄 Max empty pages in row: ${maxEmptyPagesInRow}`);

  // ULTRA DETAILED strategy generation
  const strategies = generateUltraDetailedPriceStrategies(cleanBaseUrl, targetAsinCount);
  
  console.log(`💰 ${strategies.length} ultra detaylı micro-segment oluşturuldu`);
  console.log(`📊 Toplam potansiyel sayfa: ${strategies.reduce((sum, s) => sum + s.urls.length, 0)}`);
  console.log(`🚀 Hedef: 20.000 ASIN (ortalama 1.55 ASIN/sayfa ile ~12.900 sayfa gerekli)`);

  // Process strategies
  for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex++) {
    const strategy = strategies[strategyIndex];
    
    console.log(`\n🔍 Micro-Segment ${strategyIndex + 1}/${strategies.length}: ${strategy.name}`);
    
    // Target reached check
    if (targetAsinCount > 0 && allAsins.size >= targetAsinCount) {
      console.log(`🎯 20K ASIN hedefine ulaşıldı: ${allAsins.size}/${targetAsinCount}! 🎉`);
      break;
    }

    let emptyPagesInRow = 0;
    let strategyHasResults = false;
    let shouldBreakStrategy = false;
    let segmentStats = {
      totalPages: 0,
      successfulPages: 0,
      totalAsins: 0,
      newAsins: 0,
      startTime: Date.now()
    };
    
    // Process pages in batches
    for (let i = 0; i < strategy.urls.length && !shouldBreakStrategy; i += concurrency) {
      const batch = strategy.urls.slice(i, i + concurrency);
      
      console.log(`📄 ${strategy.name} - Batch ${Math.ceil((i + 1) / concurrency)}: ${batch.length} sayfa (${i + 1}-${i + batch.length})`);
      
      // Validate URLs in batch
      const validatedBatch = [];
      for (const urlObj of batch) {
        const validation = urlValidator.validateAndCleanURL(urlObj.url);
        if (validation.isValid) {
          validatedBatch.push({
            ...urlObj,
            url: validation.cleanURL
          });
        } else {
          console.warn(`⚠️ Geçersiz URL atlandı: ${urlObj.url}`);
          stats.urlValidationErrors++;
        }
      }

      if (validatedBatch.length === 0) {
        console.warn(`⚠️ Batch'te geçerli URL kalmadı`);
        continue;
      }

      // Process batch with individual sessions
      await initWebshareProxies();
      const sm = getSessionManager();
      const wm = getWebshareManager();
      const results = await Promise.all(
        validatedBatch.map(async urlObj => {
          const proxy = wm.getNextProxy();
          const sessionId = await sm.createSession(proxy, 'us');
          const sess = sm.getSession(sessionId);
          const res = await adaptiveScrape(urlObj.url);

          await sm.removeSession(sessionId);
          return res;
        })
      );

      // Process results
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const urlInfo = validatedBatch[j];
        stats.pagesProcessed++;
        segmentStats.totalPages++;

        if (result.success) {
          stats.successfulRequests++;
          segmentStats.successfulPages++;
          
          const sizeBefore = allAsins.size;
          result.asins.forEach(asin => allAsins.add(asin));
          const newAsinsCount = allAsins.size - sizeBefore;
          
          segmentStats.totalAsins += result.asins.length;
          segmentStats.newAsins += newAsinsCount;

          if (result.asins.length === 0) {
            console.log(`⚠️ ${urlInfo.priceRange} sayfa ${urlInfo.page}: BOŞ SAYFA`);
            emptyPagesInRow++;
          } else if (newAsinsCount > 0) {
            console.log(`✅ ${urlInfo.priceRange} sayfa ${urlInfo.page}: ${result.asins.length} ASIN (${newAsinsCount} yeni)`);
            emptyPagesInRow = 0;
            strategyHasResults = true;
          } else {
            console.log(`🔄 ${urlInfo.priceRange} sayfa ${urlInfo.page}: ${result.asins.length} ASIN (tekrar) - BOŞ SAYFA`);
            emptyPagesInRow++;
          }
        } else if (result.blocked || result.captcha) {
          stats.blockedRequests++;
          console.log(`🚫 ${urlInfo.priceRange} sayfa ${urlInfo.page}: Engellenmiş`);
          emptyPagesInRow++;
        } else {
          stats.errorRequests++;
          console.log(`❌ ${urlInfo.priceRange} sayfa ${urlInfo.page}: ${result.error || 'Hata'}`);
          emptyPagesInRow++;
        }

        // Progress with 20K target
        const progressPercentage = Math.min(100, Math.round((allAsins.size / targetAsinCount) * 100));
        const remainingAsins = targetAsinCount - allAsins.size;
        const currentRate = allAsins.size / stats.pagesProcessed;
        const estimatedPagesNeeded = Math.ceil(remainingAsins / currentRate);
        
        console.log(`📊 İlerleme: ${allAsins.size}/${targetAsinCount} ASIN (%${progressPercentage}) | Kalan: ${remainingAsins} | Tahmini sayfa: ${estimatedPagesNeeded}`);
        
        // 2 boş sayfa kontrolü
        if (emptyPagesInRow >= maxEmptyPagesInRow) {
          console.log(`🔄 ${strategy.name}: ${maxEmptyPagesInRow} boş sayfa → SONRAKİ MICRO-SEGMENT`);
          stats.strategiesSkipped++;
          shouldBreakStrategy = true;
          break;
        }
      }

      if (shouldBreakStrategy) break;

      // Target reached check
      if (targetAsinCount > 0 && allAsins.size >= targetAsinCount) {
        console.log(`🎯 20K ASIN hedefine ulaşıldı!`);
        return buildFinalResult(allAsins, stats, targetAsinCount, true);
      }

      // Rate limiting
      if (i + concurrency < strategy.urls.length && !shouldBreakStrategy) {
       const delay = 640 + Math.random() * 960;
        console.log(`⏱️ Batch arası: ${(delay/1000).toFixed(1)}s`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Segment completion
    segmentStats.duration = Date.now() - segmentStats.startTime;
    segmentStats.asinPerMinute = segmentStats.newAsins / (segmentStats.duration / 60000);
    stats.segmentPerformance[strategy.name] = segmentStats;

    if (strategyHasResults && !shouldBreakStrategy) {
      stats.strategiesUsed++;
      stats.strategiesCompleted++;
      console.log(`✅ Micro-segment tamamlandı: ${strategy.name} - ${segmentStats.newAsins} yeni ASIN (${segmentStats.asinPerMinute.toFixed(1)} ASIN/dk)`);
    } else {
      if (!shouldBreakStrategy) stats.strategiesSkipped++;
      console.log(`❌ Micro-segment boş: ${strategy.name} - ${segmentStats.newAsins} yeni ASIN`);
    }
  }

  return buildFinalResult(allAsins, stats, targetAsinCount, false);
}

function generateUltraDetailedPriceStrategies(baseUrl, targetAsinCount) {
  const strategies = [];
  
  // ULTRA DETAILED MICRO-SEGMENTATION - 20.000 ASIN için
  const microSegments = [];
  
  // $0-100 arası: 5$ aralıklarla (20 segment × 20 sayfa = 400 sayfa)
  for (let i = 20; i < 100; i += 5) {
    microSegments.push({
      min: i,
      max: i + 5,
      label: `$${i}-${i + 5}`,
      expectedDensity: 'very-high',
      pages: 20
    });
  }
  
  // $100-200 arası: 10$ aralıklarla (10 segment × 20 sayfa = 200 sayfa)
  for (let i = 100; i < 200; i += 10) {
    microSegments.push({
      min: i,
      max: i + 10,
      label: `$${i}-${i + 10}`,
      expectedDensity: 'high',
      pages: 20
    });
  }
  
  // $200-500 arası: 20$ aralıklarla (15 segment × 20 sayfa = 300 sayfa)
  for (let i = 200; i < 500; i += 20) {
    microSegments.push({
      min: i,
      max: i + 20,
      label: `$${i}-${i + 20}`,
      expectedDensity: 'medium',
      pages: 20
    });
  }
  
  // $500-1000 arası: 50$ aralıklarla (10 segment × 20 sayfa = 200 sayfa)
  for (let i = 500; i < 1000; i += 50) {
    microSegments.push({
      min: i,
      max: i + 50,
      label: `$${i}-${i + 50}`,
      expectedDensity: 'low',
      pages: 20
    });
  }
  
  // $1000-2000 arası: 100$ aralıklarla (10 segment × 20 sayfa = 200 sayfa)
  for (let i = 1000; i < 2000; i += 100) {
    microSegments.push({
      min: i,
      max: i + 100,
      label: `$${i}-${i + 100}`,
      expectedDensity: 'very-low',
      pages: 20
    });
  }
  
  // $2000+ (1 segment × 20 sayfa = 20 sayfa)
  microSegments.push({
    min: 2000,
    max: null,
    label: '$2000+',
    expectedDensity: 'ultra-low',
    pages: 20
  });

  console.log(`💰 ${microSegments.length} micro-segment oluşturuldu:`);
  console.log(`   • $0-100: 5$ aralıklar (20 segment × 20 sayfa = 400 sayfa)`);
  console.log(`   • $100-200: 10$ aralıklar (10 segment × 20 sayfa = 200 sayfa)`);
  console.log(`   • $200-500: 20$ aralıklar (15 segment × 20 sayfa = 300 sayfa)`);
  console.log(`   • $500-1000: 50$ aralıklar (10 segment × 20 sayfa = 200 sayfa)`);
  console.log(`   • $1000-2000: 100$ aralıklar (10 segment × 20 sayfa = 200 sayfa)`);
  console.log(`   • $2000+: 1 segment × 20 sayfa = 20 sayfa`);
  
  const totalPotentialPages = microSegments.reduce((sum, seg) => sum + seg.pages, 0);
  console.log(`📊 TOPLAM: ${totalPotentialPages} sayfa (${totalPotentialPages * 16} potansiyel ASIN kapasitesi)`);

  // Her micro-segment için strategy oluştur
  for (const segment of microSegments) {
    const urls = [];
    const segmentBaseUrl = addPriceRangeToUrl(baseUrl, segment.min, segment.max);
    
    for (let page = 1; page <= segment.pages; page++) {
      urls.push({
        url: addPageParam(segmentBaseUrl, page),
        priceRange: segment.label,
        page: page,
        type: 'micro_price_segment',
        minPrice: segment.min,
        maxPrice: segment.max,
        expectedDensity: segment.expectedDensity
      });
    }
    
    strategies.push({
      name: `Micro-Segment: ${segment.label}`,
      type: 'micro_price_segment',
      urls: urls,
      priceMin: segment.min,
      priceMax: segment.max,
      expectedDensity: segment.expectedDensity,
      maxPages: segment.pages
    });
  }

  // Yüksek density önce
  strategies.sort((a, b) => {
    const densityOrder = { 'very-high': 0, 'high': 1, 'medium': 2, 'low': 3, 'very-low': 4, 'ultra-low': 5 };
    return densityOrder[a.expectedDensity] - densityOrder[b.expectedDensity];
  });
  
  console.log(`🎯 Micro-segmentler density'ye göre sıralandı (very-high → ultra-low)`);
  
  return strategies;
}

// Helper functions (aynı)
function extractStorefrontId(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('me') || null;
  } catch (e) {
    return null;
  }
}

function addPageParam(url, page) {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('page', page.toString());
    return urlObj.toString();
  } catch (e) {
    const connector = url.includes('?') ? '&' : '?';
    return `${url}${connector}page=${page}`;
  }
}

function addPriceRangeToUrl(url, minPrice, maxPrice) {
  try {
    const urlObj = new URL(url);
    
    const currentRh = urlObj.searchParams.get('rh') || '';
    const cleanRh = currentRh.replace(/p_36:[^,]*,?/g, '').replace(/,$/, '');
    
    const priceFilter = maxPrice ? 
      `p_36:${minPrice * 100}-${maxPrice * 100}` : 
      `p_36:${minPrice * 100}-`;
    
    const newRh = cleanRh ? `${cleanRh},${priceFilter}` : priceFilter;
    urlObj.searchParams.set('rh', newRh);
    
    return urlObj.toString();
  } catch (e) {
    const connector = url.includes('?') ? '&' : '?';
    const priceFilter = maxPrice ? 
      `p_36:${minPrice * 100}-${maxPrice * 100}` : 
      `p_36:${minPrice * 100}-`;
    return `${url}${connector}rh=${priceFilter}`;
  }
}

function buildFinalResult(allAsins, stats, targetAsinCount, targetReached) {
  const successRate = stats.pagesProcessed > 0 ? 
    Math.round((stats.successfulRequests / stats.pagesProcessed) * 100) : 0;

  const segmentsByPerformance = Object.entries(stats.segmentPerformance)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.asinPerMinute - a.asinPerMinute)
    .slice(0, 10); // Top 10 göster

  return {
    asins: Array.from(allAsins),
    stats: {
      uniqueAsinCount: allAsins.size,
      ...stats,
      successRate: `${successRate}%`,
      targetReached,
      completionRate: targetAsinCount > 0 ? 
        `${Math.min(100, Math.round((allAsins.size / targetAsinCount) * 100))}%` : '100%',
      topPerformingMicroSegments: segmentsByPerformance,
      averageAsinPerPage: (allAsins.size / stats.pagesProcessed).toFixed(2)
    }
  };
}

module.exports = { getAsinsWithStrategy };