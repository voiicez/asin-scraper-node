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
    
    if (!baseUrl.includes('i=')) {
      const connector = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${connector}i=${categoryId}`;
    } else {
      const urlParts = baseUrl.split('i=');
      const restOfUrl = urlParts[1].includes('&') ? 
        urlParts[1].substring(urlParts[1].indexOf('&')) : '';
      return `${urlParts[0]}i=${categoryId}${restOfUrl}`;
    }
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
    getProxyForUrl
  };
  