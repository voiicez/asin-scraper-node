const WebshareProxyManager = require('./webshareManager');
let webshareManager = null;
// WebshareProxyManager'ı başlat
async function initWebshareProxies() {
  webshareManager = new WebshareProxyManager();
  await webshareManager.loadProxies();
  return webshareManager;
}

// Webshare proxy al
function getWebshareProxy() {
  if (!webshareManager) {
    console.warn('⚠️ WebshareProxyManager henüz başlatılmamış');
    return null;
  }
  
  const proxy = webshareManager.getNextProxy();
  return proxy ? webshareManager.getProxySettings(proxy) : null;
}

// Webshare proxy sonucu kaydet
function recordWebshareResult(proxySettings, success, responseTime = 0) {
  if (!webshareManager || !proxySettings) return;
  
  // Proxy ID'sini server string'inden çıkar
  const serverParts = proxySettings.server.replace('http://', '').split(':');
  const proxyId = `${serverParts[0]}:${serverParts[1]}`;
  
  webshareManager.recordProxyResult(proxyId, success, responseTime);
}

// Webshare proxy istatistikleri
function getWebshareStats() {
  return webshareManager ? webshareManager.getProxyStats() : null;
}

function ensurePageParam(url) {
    if (!url.includes("page=")) {
      return url + (url.includes("?") ? "&page=" : "?page=");
    }
    return url;
  }
  
  function addSortToUrl(url, sort) {
    let baseUrl = url.replace(/([?&])s=[^&]*/g, ''); // önceki s= parametresini temizle
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}s=${sort}`;
  }
  
  function addSearchTermToUrl(url, term) {
    const baseUrl = url.split('&k=')[0].split('?k=')[0];
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}k=${term}`;
  }
  
  function buildCategoryUrl(baseUrl, categoryId) {
    // i=merchant-items varsa temizle
    baseUrl = baseUrl.replace(/&?i=merchant-items/, '').replace(/&?rh=[^&]*/g, '');
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}rh=n%3A${categoryId}`;
  }
  
  function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  function detectCountryFromAmazonUrl(url) {
    try {
      const hostname = new URL(url).hostname;
  
      const amazonDomainMap = {
        'amazon.com.mx': 'mx',
        'amazon.com.br': 'br',
        'amazon.com.au': 'au',
        'amazon.com.tr': 'tr',
        'amazon.com': 'us',
        'amazon.co.uk': 'gb',
        'amazon.co.jp': 'jp',
        'amazon.de': 'de',
        'amazon.fr': 'fr',
        'amazon.it': 'it',
        'amazon.es': 'es',
        'amazon.ca': 'ca',
        'amazon.in': 'in',
        'amazon.nl': 'nl',
        'amazon.se': 'se',
        'amazon.pl': 'pl',
        'amazon.ae': 'ae',
        'amazon.sa': 'sa',
        'amazon.sg': 'sg'
      };
      
  
      for (const [domain, countryCode] of Object.entries(amazonDomainMap)) {
        if (hostname.includes(domain)) {
          console.log(`🌍 URL ${url} için ülke tespit edildi: ${countryCode.toUpperCase()}`);
          return countryCode;
        }
      }
  
      console.log(`⚠️ URL ${url} için ülke tespit edilemedi, varsayılan US kullanılıyor`);
      return 'us';
    } catch (error) {
      console.error(`❌ Ülke tespiti sırasında hata: ${error.message}`);
      return 'us';
    }
  }
  
 const proxyMap = {
  "us": { host: "us-pr.oxylabs.io", port: 10000 },
  "ca": { host: "ca-pr.oxylabs.io", port: 30000 },
  "gb": { host: "gb-pr.oxylabs.io", port: 20000 },
  "de": { host: "de-pr.oxylabs.io", port: 30000 },
  "fr": { host: "fr-pr.oxylabs.io", port: 40000 },
  "mx": { host: "mx-pr.oxylabs.io", port: 10000 },
  "tr": { host: "tr-pr.oxylabs.io", port: 30000 },
  "jp": { host: "jp-pr.oxylabs.io", port: 40000 },
  // Diğer ülkeleri CSV'den genişletebilirsin
};

function getOxylabsProxy(countryCode) {
  const OXYLABS_USERNAME = "customer-behlul_x6NlH";
  const OXYLABS_PASSWORD = "_Deneme12345";

  const country = (countryCode || 'us').toLowerCase();
  const proxy = proxyMap[country] || proxyMap['us'];

  return new URL(`http://${OXYLABS_USERNAME}:${OXYLABS_PASSWORD}@${proxy.host}:${proxy.port}`);
}

function addPriceRangeToUrl(url, minPrice, maxPrice) {
  const connector = url.includes('?') ? '&' : '?';
  const priceFilter = `rh=p_36:${minPrice * 100}-${maxPrice ? maxPrice * 100 : ''}`;
  return `${url}${connector}${priceFilter}`;
}
function addPriceToExistingRh(url, min, max) {
  const parsed = new URL(url);
  const rh = parsed.searchParams.get('rh') || '';
  const price = `p_36:${min * 100}-${max * 100}`;
  const updatedRh = rh.includes('p_36') ? rh : rh ? `${rh},${price}` : price;
  parsed.searchParams.set('rh', updatedRh);
  return parsed.toString();
}

  
  function getProxyForUrl(url) {
    if (!url) {
      console.warn('⚠️ URL belirtilmedi, proxy kullanılmıyor');
      return null;
    }
  
    const countryCode = detectCountryFromAmazonUrl(url);
    return getOxylabsProxy(countryCode);
  }
  
  module.exports = {
    ensurePageParam,
    addSortToUrl,
    addSearchTermToUrl,
    buildCategoryUrl,
    chunkArray,
    detectCountryFromAmazonUrl,
    getOxylabsProxy,
    getProxyForUrl,
    addPriceRangeToUrl,
     addPriceToExistingRh,
       initWebshareProxies,
  getWebshareProxy,
  recordWebshareResult,
  getWebshareStats
  };
  