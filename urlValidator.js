// urlValidator.js - URL Doğrulama ve Temizleme
class URLValidator {
  constructor() {
    // Problematik parametreler
    this.problematicParams = [
      'me=', // Seller ID - sorunlu olabiliyor
      'mcid=', // Merchant Center ID
      'marketplaceID=',
      'merchId=',
      'sellerID='
    ];
    
    // Geçersiz karakterler
    this.invalidChars = /[<>"\s{}\|\\\^`\[\]]/g;
  }

  validateAndCleanURL(url) {
    try {
      console.log(`🔍 URL doğrulanıyor: ${url}`);
      
      // 1. Temel URL format kontrolü
      if (!url || typeof url !== 'string') {
        throw new Error('Geçersiz URL formatı');
      }

      // 2. URL objesini oluştur
      let urlObj;
      try {
        urlObj = new URL(url);
      } catch (e) {
        throw new Error(`URL parse edilemedi: ${e.message}`);
      }

      // 3. Amazon domain kontrolü
      if (!this.isAmazonDomain(urlObj.hostname)) {
        throw new Error('Amazon domain değil');
      }

      // 4. Problematik parametreleri temizle
      this.cleanProblematicParams(urlObj);

      // 5. Geçersiz karakterleri temizle
      const cleanedURL = this.removeInvalidCharacters(urlObj.toString());

      // 6. URL uzunluk kontrolü
      if (cleanedURL.length > 2048) {
        throw new Error('URL çok uzun');
      }

      console.log(`✅ URL temizlendi: ${cleanedURL}`);
      return {
        isValid: true,
        cleanURL: cleanedURL,
        originalURL: url,
        warnings: this.getWarnings(url, cleanedURL)
      };

    } catch (error) {
      console.error(`❌ URL validation hatası: ${error.message}`);
      return {
        isValid: false,
        error: error.message,
        originalURL: url
      };
    }
  }

  isAmazonDomain(hostname) {
    const amazonDomains = [
      'amazon.com', 'amazon.ca', 'amazon.co.uk', 'amazon.de',
      'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.co.jp',
      'amazon.com.au', 'amazon.com.br', 'amazon.com.mx',
      'amazon.in', 'amazon.nl', 'amazon.se', 'amazon.pl',
      'amazon.com.tr', 'amazon.ae', 'amazon.sa', 'amazon.sg'
    ];
    
    return amazonDomains.some(domain => hostname.includes(domain));
  }

  cleanProblematicParams(urlObj) {
    const paramsToRemove = [];
    
    // Seller ID parametrelerini KORUYALIM (storefront için gerekli)
    for (const [key, value] of urlObj.searchParams.entries()) {
      // me= parametresini KORUYUN - storefront için gerekli
      if (key === 'me') {
        console.log(`🏪 Storefront ID korunuyor: ${key}=${value}`);
        continue; // Bu parametreyi kaldırma
      }
      
      // marketplaceID'yi de koruyalım
      if (key === 'marketplaceID') {
        console.log(`🌍 Marketplace ID korunuyor: ${key}=${value}`);
        continue;
      }
      
      // Sadece gerçekten problematik olanları kaldır
      if (key === 'sellerID' || key === 'merchId') {
        console.warn(`⚠️ Problematik parametre kaldırılıyor: ${key}=${value}`);
        paramsToRemove.push(key);
      }
      
      // Çok uzun değerler
      if (value && value.length > 200) { // Limit'i artırdık
        console.warn(`⚠️ Uzun parametre kaldırılıyor: ${key}=${value.substring(0, 20)}...`);
        paramsToRemove.push(key);
      }
      
      // Gerçekten tehlikeli karakterler
      const dangerousChars = /[<>"'\s{}|\\^`\[\]]/g;
      if (value && dangerousChars.test(value)) {
        console.warn(`⚠️ Tehlikeli karakter içeren parametre temizleniyor: ${key}=${value}`);
        // Parametreyi kaldırmak yerine temizle
        urlObj.searchParams.set(key, value.replace(dangerousChars, ''));
      }
    }
    
    // Sadece gerçekten problematik parametreleri kaldır
    paramsToRemove.forEach(param => {
      urlObj.searchParams.delete(param);
    });
  }

  removeInvalidCharacters(url) {
    // Geçersiz karakterleri URL encode et
    return url.replace(this.invalidChars, (match) => {
      return encodeURIComponent(match);
    });
  }

  getWarnings(originalURL, cleanedURL) {
    const warnings = [];
    
    if (originalURL !== cleanedURL && !originalURL.includes('me=')) {
      warnings.push('URL temizlendi ve parametreler kaldırıldı');
    }
    
    // me= parametresi için warning'i kaldır - storefront için normal
    if (originalURL.includes('me=')) {
      console.log('🏪 Storefront URL detected - me= parameter preserved');
    }
    
    return warnings;
  }

  // Alternative URL generation - seller page yerine category/search page
  generateAlternativeURL(originalURL) {
    try {
      const urlObj = new URL(originalURL);
      
      // Seller page ise search page'e çevir
      if (urlObj.searchParams.has('me')) {
        const baseURL = `${urlObj.protocol}//${urlObj.hostname}/s`;
        const newUrlObj = new URL(baseURL);
        
        // Fiyat filtrelerini koru
        if (urlObj.searchParams.has('rh')) {
          const rh = urlObj.searchParams.get('rh');
          if (rh.includes('p_36:')) {
            newUrlObj.searchParams.set('rh', rh);
          }
        }
        
        // Page parametresini koru
        if (urlObj.searchParams.has('page')) {
          newUrlObj.searchParams.set('page', urlObj.searchParams.get('page'));
        }
        
        // Generic search term ekle
        newUrlObj.searchParams.set('k', 'products');
        
        console.log(`🔄 Alternative URL oluşturuldu: ${newUrlObj.toString()}`);
        return newUrlObj.toString();
      }
      
      return originalURL;
    } catch (e) {
      return originalURL;
    }
  }
}

module.exports = URLValidator;