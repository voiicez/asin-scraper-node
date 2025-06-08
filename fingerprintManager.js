// fingerprintManager.js - Browser Fingerprint Yöneticisi
class BrowserFingerprintManager {
  constructor() {
    this.userAgents = {
      chrome: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
      ],
      firefox: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0"
      ],
      safari: [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15"
      ]
    };

    this.viewports = [
      { width: 1920, height: 1080 }, // Full HD
      { width: 1366, height: 768 },  // Laptop
      { width: 1536, height: 864 },  // Laptop HD+
      { width: 1440, height: 900 },  // MacBook
      { width: 1280, height: 720 },  // HD
      { width: 1600, height: 900 },  // 16:9
      { width: 2560, height: 1440 }, // 2K
      { width: 1680, height: 1050 }  // WSXGA+
    ];

    this.languages = {
      'us': ['en-US', 'en'],
      'ca': ['en-CA', 'fr-CA', 'en'],
      'gb': ['en-GB', 'en'],
      'de': ['de-DE', 'de', 'en'],
      'fr': ['fr-FR', 'fr', 'en'],
      'it': ['it-IT', 'it', 'en'],
      'es': ['es-ES', 'es', 'en'],
      'jp': ['ja-JP', 'ja', 'en'],
      'au': ['en-AU', 'en']
    };

    this.timezones = {
      'us': ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'America/Denver', 'America/Phoenix'],
      'ca': ['America/Toronto', 'America/Vancouver', 'America/Montreal', 'America/Edmonton'],
      'gb': ['Europe/London'],
      'de': ['Europe/Berlin'],
      'fr': ['Europe/Paris'],
      'it': ['Europe/Rome'],
      'es': ['Europe/Madrid'],
      'jp': ['Asia/Tokyo'],
      'au': ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane']
    };

    this.deviceSpecs = [
      { memory: 4, cores: 4, platform: 'Win32' },
      { memory: 8, cores: 4, platform: 'Win32' },
      { memory: 8, cores: 8, platform: 'Win32' },
      { memory: 16, cores: 8, platform: 'Win32' },
      { memory: 16, cores: 12, platform: 'Win32' },
      { memory: 8, cores: 8, platform: 'MacIntel' },
      { memory: 16, cores: 8, platform: 'MacIntel' },
      { memory: 32, cores: 16, platform: 'MacIntel' }
    ];

    this.usedFingerprints = new Set();
    this.fingerprintRotationIndex = 0;
  }

  generateFingerprint(countryCode = 'us', browserPreference = null) {
    // Browser tipi seçimi (Chrome ağırlıklı - gerçek dünya kullanımına uygun)
    const browserTypes = browserPreference ? [browserPreference] : ['chrome', 'chrome', 'chrome', 'firefox', 'safari'];
    const selectedBrowser = browserTypes[Math.floor(Math.random() * browserTypes.length)];
    
    // User Agent seçimi
    const userAgentList = this.userAgents[selectedBrowser];
    const userAgent = userAgentList[Math.floor(Math.random() * userAgentList.length)];
    
    // Viewport seçimi (ağırlıklı - yaygın çözünürlüklere öncelik)
    const weightedViewports = [
      ...this.viewports.slice(0, 4), // En yaygın 4'ü 2 kez
      ...this.viewports.slice(0, 4),
      ...this.viewports // Tümü 1 kez
    ];
    const viewport = weightedViewports[Math.floor(Math.random() * weightedViewports.length)];
    
    // Device specs
    const deviceSpec = this.deviceSpecs[Math.floor(Math.random() * this.deviceSpecs.length)];
    
    // Platform uyumluluğu kontrolü
    let platform = deviceSpec.platform;
    if (userAgent.includes('Windows') && platform !== 'Win32') {
      platform = 'Win32';
    } else if (userAgent.includes('Macintosh') && platform !== 'MacIntel') {
      platform = 'MacIntel';
    }
    
    // Timezone ve dil
    const timezone = this.getTimezoneForCountry(countryCode);
    const languages = this.getLanguagesForCountry(countryCode);
    
    // WebGL renderer/vendor (GPU fingerprinting için)
    const gpuSpecs = this.getRandomGPUSpecs();
    
    const fingerprint = {
      userAgent,
      viewport,
      platform,
      timezone,
      languages,
      locale: this.getLocaleForCountry(countryCode),
      deviceMemory: deviceSpec.memory,
      hardwareConcurrency: deviceSpec.cores,
      browserType: selectedBrowser,
      gpu: gpuSpecs,
      screen: this.generateScreenProperties(viewport),
      canvas: this.generateCanvasFingerprint(),
      audio: this.generateAudioFingerprint(),
      webgl: this.generateWebGLFingerprint(),
      fonts: this.generateFontList(platform),
      plugins: this.generatePluginList(selectedBrowser),
      countryCode: countryCode.toLowerCase()
    };

    // Benzersizlik kontrolü
    const fingerprintHash = this.hashFingerprint(fingerprint);
    let attempts = 0;
    while (this.usedFingerprints.has(fingerprintHash) && attempts < 10) {
      // Küçük değişiklikler yaparak benzersiz hale getir
      fingerprint.viewport.width += Math.floor(Math.random() * 20) - 10;
      fingerprint.viewport.height += Math.floor(Math.random() * 20) - 10;
      fingerprint.canvas = this.generateCanvasFingerprint();
      fingerprint.audio = this.generateAudioFingerprint();
      
      const newHash = this.hashFingerprint(fingerprint);
      if (!this.usedFingerprints.has(newHash)) {
        this.usedFingerprints.add(newHash);
        break;
      }
      attempts++;
    }

    // Kullanılan fingerprint'leri temizle (memory leak önlemi)
    if (this.usedFingerprints.size > 1000) {
      const fingerprintsArray = Array.from(this.usedFingerprints);
      this.usedFingerprints = new Set(fingerprintsArray.slice(-500)); // Son 500'ü sakla
    }

    console.log(`🎭 Fingerprint oluşturuldu: ${selectedBrowser.toUpperCase()} | ${viewport.width}x${viewport.height} | ${countryCode.toUpperCase()}`);
    
    return fingerprint;
  }

  hashFingerprint(fingerprint) {
    const str = JSON.stringify({
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      deviceMemory: fingerprint.deviceMemory,
      hardwareConcurrency: fingerprint.hardwareConcurrency
    });
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit integer'a dönüştür
    }
    return hash;
  }

  getTimezoneForCountry(country) {
    const zones = this.timezones[country.toLowerCase()] || this.timezones['us'];
    return zones[Math.floor(Math.random() * zones.length)];
  }

  getLanguagesForCountry(country) {
    return this.languages[country.toLowerCase()] || this.languages['us'];
  }

  getLocaleForCountry(country) {
    const localeMap = {
      'us': 'en-US',
      'ca': Math.random() > 0.7 ? 'fr-CA' : 'en-CA',
      'gb': 'en-GB',
      'de': 'de-DE',
      'fr': 'fr-FR',
      'it': 'it-IT',
      'es': 'es-ES',
      'jp': 'ja-JP',
      'au': 'en-AU'
    };
    return localeMap[country.toLowerCase()] || 'en-US';
  }

  getRandomGPUSpecs() {
    const vendors = ['Intel Inc.', 'AMD', 'NVIDIA Corporation'];
    const renderers = {
      'Intel Inc.': [
        'Intel(R) Iris(TM) Graphics 6100',
        'Intel(R) HD Graphics 620',
        'Intel(R) UHD Graphics 630',
        'Intel(R) Iris(TM) Xe Graphics'
      ],
      'AMD': [
        'AMD Radeon Graphics',
        'AMD Radeon RX 580',
        'AMD Radeon RX 6600',
        'AMD Radeon Pro 5500 XT'
      ],
      'NVIDIA Corporation': [
        'NVIDIA GeForce GTX 1060',
        'NVIDIA GeForce RTX 3070',
        'NVIDIA GeForce GTX 1650',
        'NVIDIA GeForce RTX 4060'
      ]
    };
    
    const vendor = vendors[Math.floor(Math.random() * vendors.length)];
    const rendererList = renderers[vendor];
    const renderer = rendererList[Math.floor(Math.random() * rendererList.length)];
    
    return { vendor, renderer };
  }

  generateScreenProperties(viewport) {
    const pixelRatio = [1, 1.25, 1.5, 2][Math.floor(Math.random() * 4)];
    
    return {
      width: viewport.width,
      height: viewport.height,
      availWidth: viewport.width - Math.floor(Math.random() * 10),
      availHeight: viewport.height - Math.floor(Math.random() * 80) - 20, // Taskbar vs.
      colorDepth: 24,
      pixelDepth: 24,
      devicePixelRatio: pixelRatio
    };
  }

  generateCanvasFingerprint() {
    // Canvas fingerprint için rastgele değerler
    return {
      hash: Math.random().toString(36).substring(2, 15),
      geometry: `${Math.floor(Math.random() * 1000)},${Math.floor(Math.random() * 1000)}`,
      text: Math.random().toString(36).substring(2, 10)
    };
  }

  generateAudioFingerprint() {
    // Audio context fingerprint için rastgele değerler
    return {
      sampleRate: [44100, 48000][Math.floor(Math.random() * 2)],
      maxChannelCount: [2, 6, 8][Math.floor(Math.random() * 3)],
      numberOfInputs: Math.floor(Math.random() * 4) + 1,
      numberOfOutputs: Math.floor(Math.random() * 4) + 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers'
    };
  }

  generateWebGLFingerprint() {
    return {
      version: 'WebGL 1.0',
      shadingLanguageVersion: 'WebGL GLSL ES 1.0',
      maxTextureSize: [4096, 8192, 16384][Math.floor(Math.random() * 3)],
      maxRenderBufferSize: [4096, 8192, 16384][Math.floor(Math.random() * 3)],
      maxViewportDims: [4096, 8192, 16384][Math.floor(Math.random() * 3)]
    };
  }

  generateFontList(platform) {
    const commonFonts = [
      'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Trebuchet MS', 'Arial Black', 'Impact'
    ];
    
    const windowsFonts = [
      'Calibri', 'Cambria', 'Consolas', 'Constantia', 'Corbel',
      'Franklin Gothic Medium', 'Gabriola', 'Lucida Console',
      'Lucida Sans Unicode', 'Microsoft Sans Serif', 'Segoe UI',
      'Tahoma', 'Times', 'Webdings', 'Wingdings'
    ];
    
    const macFonts = [
      'Apple Chancery', 'Apple Color Emoji', 'Apple SD Gothic Neo',
      'Avenir', 'Avenir Next', 'Chalkboard', 'Chalkboard SE',
      'Cochin', 'Copperplate', 'Geneva', 'Helvetica Neue',
      'Hoefler Text', 'Lucida Grande', 'Marker Felt', 'Menlo',
      'Monaco', 'Noteworthy', 'Optima', 'Papyrus', 'SF Pro Display',
      'SF Pro Text', 'Skia', 'Zapfino'
    ];
    
    let fonts = [...commonFonts];
    
    if (platform === 'Win32') {
      fonts = fonts.concat(windowsFonts);
    } else if (platform === 'MacIntel') {
      fonts = fonts.concat(macFonts);
    }
    
    // Rastgele font subset'i döndür (gerçekçi olması için)
    const shuffled = fonts.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.floor(Math.random() * 20) + 15); // 15-35 font arası
  }

  generatePluginList(browserType) {
    const chromePlugins = [
      'Chrome PDF Plugin',
      'Chrome PDF Viewer',
      'Native Client',
      'WebKit built-in PDF'
    ];
    
    const firefoxPlugins = [
      'PDF.js',
      'OpenH264 Video Codec provided by Cisco Systems, Inc.',
      'Widevine Content Decryption Module provided by Google Inc.'
    ];
    
    const safariPlugins = [
      'WebKit built-in PDF',
      'QuickTime Plugin'
    ];
    
    switch (browserType) {
      case 'chrome':
        return chromePlugins;
      case 'firefox':
        return firefoxPlugins;
      case 'safari':
        return safariPlugins;
      default:
        return chromePlugins;
    }
  }

  // Playwright context için fingerprint hazırlama
  prepareContextOptions(fingerprint) {
    return {
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      geolocation: this.getGeolocationForCountry(fingerprint.countryCode),
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': fingerprint.languages.join(','),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': Math.random() > 0.5 ? '1' : '0',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    };
  }

  getGeolocationForCountry(countryCode) {
    // Ülkelere göre yaklaşık koordinatlar
    const locations = {
      'us': { latitude: 39.8283, longitude: -98.5795 }, // Kansas (merkez)
      'ca': { latitude: 56.1304, longitude: -106.3468 }, // Saskatoon
      'gb': { latitude: 55.3781, longitude: -3.4360 }, // UK merkez
      'de': { latitude: 51.1657, longitude: 10.4515 }, // Almanya merkez
      'fr': { latitude: 46.2276, longitude: 2.2137 }, // Fransa merkez
      'it': { latitude: 41.8719, longitude: 12.5674 }, // Roma
      'es': { latitude: 40.4637, longitude: -3.7492 }, // Madrid
      'jp': { latitude: 36.2048, longitude: 138.2529 }, // Japonya merkez
      'au': { latitude: -25.2744, longitude: 133.7751 } // Avustralya merkez
    };
    
    const baseLocation = locations[countryCode] || locations['us'];
    
    // Koordinatlara küçük randomizasyon ekle (şehir içi variation)
    return {
      latitude: baseLocation.latitude + (Math.random() - 0.5) * 2, // ±1 derece
      longitude: baseLocation.longitude + (Math.random() - 0.5) * 2 // ±1 derece
    };
  }

  // Anti-fingerprinting JavaScript injection kodu
  getAntiDetectionScript(fingerprint) {
    return `
      // WebGL fingerprinting bypass
      (function() {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // VENDOR
          if (parameter === 37445) {
            return '${fingerprint.gpu.renderer}';
          }
          // RENDERER  
          if (parameter === 37446) {
            return '${fingerprint.gpu.vendor}';
          }
          return getParameter.call(this, parameter);
        };
      })();

      // Canvas fingerprinting bypass
      (function() {
        const toDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
          if (type === 'image/png') {
            return 'data:image/png;base64,${fingerprint.canvas.hash}AAAASUVORK5CYII=';
          }
          return toDataURL.apply(this, arguments);
        };

        const getImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function() {
          const imageData = getImageData.apply(this, arguments);
          // Slight pixel manipulation
          for (let i = 0; i < imageData.data.length; i += 4) {
            if (Math.random() < 0.001) { // 0.1% of pixels
              imageData.data[i] = (imageData.data[i] + Math.floor(Math.random() * 10) - 5) % 256;
            }
          }
          return imageData;
        };
      })();

      // Audio context fingerprinting bypass
      (function() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
          AudioContext.prototype.createAnalyser = function() {
            const analyser = originalCreateAnalyser.call(this);
            const originalGetFrequencyData = analyser.getFloatFrequencyData;
            analyser.getFloatFrequencyData = function(array) {
              originalGetFrequencyData.call(this, array);
              for (let i = 0; i < array.length; i++) {
                array[i] += (Math.random() - 0.5) * 0.0001;
              }
            };
            return analyser;
          };
        }
      })();

      // Navigator properties spoofing
      (function() {
        Object.defineProperty(navigator, 'deviceMemory', { 
          value: ${fingerprint.deviceMemory}, 
          writable: false 
        });
        Object.defineProperty(navigator, 'hardwareConcurrency', { 
          value: ${fingerprint.hardwareConcurrency}, 
          writable: false 
        });
        Object.defineProperty(navigator, 'platform', { 
          value: '${fingerprint.platform}', 
          writable: false 
        });

        // Plugin masking
        const originalPlugins = navigator.plugins;
        Object.defineProperty(navigator, 'plugins', {
          get: function() {
            const mockPlugins = ${JSON.stringify(fingerprint.plugins)};
            return new Proxy(originalPlugins, {
              get: function(target, prop) {
                if (typeof prop === 'string' && !isNaN(prop)) {
                  return mockPlugins[parseInt(prop)];
                }
                if (prop === 'length') {
                  return mockPlugins.length;
                }
                return target[prop];
              }
            });
          }
        });
      })();

      // Screen properties randomization
      (function() {
        const screen = window.screen;
        Object.defineProperty(window, 'screen', {
          value: new Proxy(screen, {
            get(target, prop) {
              const mockScreen = ${JSON.stringify(fingerprint.screen)};
              if (mockScreen.hasOwnProperty(prop)) {
                return mockScreen[prop];
              }
              return target[prop];
            }
          })
        });
      })();

      // Font detection bypass
      (function() {
        const originalOffscreenCanvas = window.OffscreenCanvas;
        if (originalOffscreenCanvas) {
          window.OffscreenCanvas = function(...args) {
            const canvas = new originalOffscreenCanvas(...args);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const originalMeasureText = ctx.measureText;
              ctx.measureText = function(text) {
                const result = originalMeasureText.call(this, text);
                // Slight measurement variations
                result.width += (Math.random() - 0.5) * 0.1;
                return result;
              };
            }
            return canvas;
          };
        }
      })();

      // Timezone masking
      (function() {
        const originalDateTimeFormat = Intl.DateTimeFormat;
        Intl.DateTimeFormat = function(...args) {
          if (!args[1] || !args[1].timeZone) {
            args[1] = args[1] || {};
            args[1].timeZone = '${fingerprint.timezone}';
          }
          return new originalDateTimeFormat(...args);
        };
      })();

      // Language masking
      (function() {
        Object.defineProperty(navigator, 'language', {
          value: '${fingerprint.languages[0]}',
          writable: false
        });
        Object.defineProperty(navigator, 'languages', {
          value: ${JSON.stringify(fingerprint.languages)},
          writable: false
        });
      })();

      console.log('🎭 Anti-detection script loaded');
    `;
  }

  getStats() {
    return {
      totalFingerprintsGenerated: this.usedFingerprints.size,
      supportedCountries: Object.keys(this.timezones).length,
      availableUserAgents: Object.values(this.userAgents).flat().length,
      availableViewports: this.viewports.length,
      memoryUsage: `${this.usedFingerprints.size} fingerprints cached`
    };
  }
}

module.exports = BrowserFingerprintManager;