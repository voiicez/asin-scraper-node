const { addSortToUrl, addSearchTermToUrl, ensurePageParam, buildCategoryUrl, chunkArray } = require('./utils');
const { scrapeSinglePage } = require('./scraper');
const { MAX_BROWSERS } = require('./browserPools');
const { getProxyForUrl } = require('./utils');

async function fetchCategories(baseUrl, actualProxy) {
  console.log(`🔍 Kategoriler inceleniyor: ${baseUrl}`);
  try {
    const result = await scrapeSinglePage(baseUrl, actualProxy);
    if (result.success && result.categories?.length > 0) {
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
    proxy = null,
    useOxylabsProxy = true,
    
    sortOptions = [],
    searchTerms = [],
    maxEmptyPagesInRow = 3,
    enableCategorySearch = true
  } = config;
  let actualProxy = proxy;
  if (useOxylabsProxy && !actualProxy) {
    const { getProxyForUrl } = require('./utils');
    actualProxy = getProxyForUrl(baseUrl);
    if (actualProxy) {
      const masked = actualProxy.toString().replace(/:[^:]*@/, ':***@');
      console.log(`🔒 OxyLabs proxy kullanılacak: ${masked}`);
    } else {
      console.warn('⚠️ Proxy belirlenemedi, sistem IP kullanılacak.');
    }
  }
  const allAsins = new Set();
  let totalBytes = 0;

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

  const urlStrategies = [];

  // STRATEJİ 1: Sıralamalar
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
    urlStrategies.push({ type: 'sort', name: sort, urls });
  }

  // STRATEJİ 2: Kategoriler
  let categories = [];
  if (enableCategorySearch) {
    categories = await fetchCategories(baseUrl, proxy);
    stats.categoriesFound = categories.length;

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
            sort,
            page: i
          });
        }
        urlStrategies.push({
          type: 'category_sort',
          name: `${category.name} (${sort})`,
          urls
        });
      }
    }
  }

  // STRATEJİ 3: Arama terimleri
  if (searchTerms?.length > 0) {
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
      urlStrategies.push({ type: 'search', name: term, urls });

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
            urls
          });
        }
      }
    }
  }

  // STRATEJİLERİ UYGULA
  for (const strategy of urlStrategies) {
    if (targetAsinCount > 0 && allAsins.size >= targetAsinCount) break;
    let emptyPagesInRow = 0;
    const batchSize = Math.min(concurrency, MAX_BROWSERS);

    if (strategy.type.includes('category')) stats.categoriesSearched++;

    for (let start = 0; start < strategy.urls.length; start += batchSize) {
      if (targetAsinCount > 0 && allAsins.size >= targetAsinCount) break;
      if (emptyPagesInRow >= maxEmptyPagesInRow) {
        stats.strategiesSkipped++;
        break;
      }

      const batch = strategy.urls.slice(start, start + batchSize);
      const results = await Promise.all(batch.map(urlObj => scrapeSinglePage(urlObj.url, actualProxy)));

      let batchHasResults = false;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        totalBytes += result.bytesTransferred || 0;
        const urlInfo = batch[i];
        stats.pagesProcessed++;

        if (result.success) {
          stats.successfulRequests++;
          const sizeBefore = allAsins.size;
          result.asins.forEach(asin => allAsins.add(asin));
          const newAsins = allAsins.size - sizeBefore;

          if (newAsins > 0) {
            emptyPagesInRow = 0;
            batchHasResults = true;
          } else {
            emptyPagesInRow++;
          }
        } else if (result.blocked) {
          stats.blockedRequests++;
        } else {
          stats.errorRequests++;
        }
      }

      if (!batchHasResults) emptyPagesInRow++;
    }

    stats.strategiesUsed++;
  }
  console.log(`📦 Toplam veri kullanımı: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

  return {
    asins: Array.from(allAsins),
    stats: {
      uniqueAsinCount: allAsins.size,
      ...stats,
      targetReached: targetAsinCount > 0 && allAsins.size >= targetAsinCount
    }
  };
}

module.exports = { getAsinsWithStrategy };
