// captchaHandler.js - Gelişmiş CAPTCHA Tespit ve Çözüm
class AdvancedCaptchaHandler {
  constructor() {
    this.captchaPatterns = [
      // Text patterns (case insensitive)
      'enter the characters you see below',
      'sorry, we just need to make sure',
      'robot check',
      'automated traffic',
      'unusual traffic from your computer',
      'verify you are not a robot',
      'please complete the security check',
      'to continue shopping',
      'something went wrong on our end',
      'try again',
      'sorry for the interruption',
      'we apologize for the inconvenience',
      'security check',
      'human verification',
      'prove you\'re not a robot',
      'anti-bot verification',
      'captcha verification',
      'please verify that you are a human',
      'confirm you are not a bot'
    ];
    
    this.captchaSelectors = [
      // Visual CAPTCHA elements
      'img[src*="captcha"]',
      'img[alt*="captcha"]',
      '.g-recaptcha',
      '#captchacharacters',
      'input[name="captchacharacters"]',
      '[data-a-target="captcha"]',
      '.cvf-widget',
      '#captcha',
      '.captcha-container',
      '.robot-check',
      '[id*="captcha"]',
      '[class*="captcha"]',
      'iframe[src*="recaptcha"]',
      'iframe[src*="captcha"]',
      '[data-sitekey]' // reCAPTCHA
    ];

    this.urlPatterns = [
      'captcha',
      'robot-check',
      'validateCaptcha',
      'security-check',
      'human-check',
      'anti-bot',
      'verify-human'
    ];

    this.stats = {
      totalDetected: 0,
      totalResolved: 0,
      totalFailed: 0,
      byStrategy: {
        refresh: { attempts: 0, success: 0 },
        homepage: { attempts: 0, success: 0 },
        wait: { attempts: 0, success: 0 },
        userAgent: { attempts: 0, success: 0 }
      }
    };

    this.lastCaptchaTime = 0;
    this.captchaFrequency = [];
  }

  async detectCaptcha(page) {
    try {
      // Multi-layer detection
      const detectionResults = await Promise.all([
        this.detectTextPatterns(page),
        this.detectVisualElements(page), 
        this.detectUrlPatterns(page),
        this.detectPageTitle(page),
        this.detectNetworkRequests(page)
      ]);

      const isCaptcha = detectionResults.some(result => result);
      
      if (isCaptcha) {
        this.stats.totalDetected++;
        this.recordCaptchaFrequency();
        
        // Hangi detection method'u tetiklediğini logla
        const methods = ['text', 'visual', 'url', 'title', 'network'];
        const triggeredMethods = methods.filter((_, index) => detectionResults[index]);
        console.log(`🛑 CAPTCHA tespit edildi - Method: ${triggeredMethods.join(', ')}`);
      }

      return isCaptcha;
    } catch (error) {
      console.warn('⚠️ CAPTCHA detection error:', error.message);
      return false;
    }
  }

  async detectTextPatterns(page) {
    try {
      const bodyText = await page.evaluate(() => {
        // Tüm visible text'i al
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              
              const style = window.getComputedStyle(parent);
              if (style.display === 'none' || 
                  style.visibility === 'hidden' || 
                  style.opacity === '0') {
                return NodeFilter.FILTER_REJECT;
              }
              
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        
        let text = '';
        let node;
        while (node = walker.nextNode()) {
          text += node.textContent + ' ';
        }
        
        return text.toLowerCase();
      });

      return this.captchaPatterns.some(pattern => 
        bodyText.includes(pattern.toLowerCase())
      );
    } catch (error) {
      return false;
    }
  }

  async detectVisualElements(page) {
    try {
      for (const selector of this.captchaSelectors) {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            console.log(`🔍 CAPTCHA element bulundu: ${selector}`);
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async detectUrlPatterns(page) {
    const currentUrl = page.url().toLowerCase();
    return this.urlPatterns.some(pattern => currentUrl.includes(pattern));
  }

  async detectPageTitle(page) {
    try {
      const title = await page.title();
      const captchaTitlePatterns = [
        'robot check',
        'security check', 
        'captcha',
        'verify',
        'human verification'
      ];
      
      return captchaTitlePatterns.some(pattern => 
        title.toLowerCase().includes(pattern)
      );
    } catch (error) {
      return false;
    }
  }

  async detectNetworkRequests(page) {
    try {
      // Son birkaç saniyede CAPTCHA-related request var mı kontrol et
      const responses = await page.evaluate(() => {
        // Performance API ile son request'leri kontrol et
        const entries = performance.getEntriesByType('resource');
        const recentEntries = entries.filter(entry => 
          Date.now() - entry.startTime < 10000 // Son 10 saniye
        );
        
        return recentEntries.some(entry => 
          entry.name.includes('captcha') || 
          entry.name.includes('recaptcha') ||
          entry.name.includes('hcaptcha')
        );
      });
      
      return responses;
    } catch (error) {
      return false;
    }
  }

  async handleCaptcha(page, proxyInfo = null, sessionManager = null, sessionId = null) {
    console.warn(`🛑 CAPTCHA handling başlatılıyor...`);
    
    const strategies = [
      { name: 'wait', method: this.strategyWaitAndRefresh },
      { name: 'homepage', method: this.strategyHomepageNavigation },
      { name: 'userAgent', method: this.strategyUserAgentChange },
      { name: 'refresh', method: this.strategySimpleRefresh }
    ];

    // Session'a CAPTCHA kaydını yap
    if (sessionManager && sessionId) {
      sessionManager.recordSessionResult(sessionId, false, 0, true);
    }

    // Proxy bilgisini logla
    if (proxyInfo) {
      console.log(`🌐 CAPTCHA Proxy: ${proxyInfo.ip || 'Unknown'}`);
    }

    // Stratejileri sırayla dene
    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      console.log(`🎯 CAPTCHA strateji ${i + 1}/${strategies.length}: ${strategy.name}`);
      
      this.stats.byStrategy[strategy.name].attempts++;
      
      try {
        const success = await strategy.method.call(this, page);
        
        if (success) {
          this.stats.byStrategy[strategy.name].success++;
          this.stats.totalResolved++;
          console.log(`✅ CAPTCHA çözüldü - Strateji: ${strategy.name}`);
          return true;
        } else {
          console.log(`❌ Strateji başarısız: ${strategy.name}`);
        }
      } catch (error) {
        console.log(`💥 Strateji hatası (${strategy.name}): ${error.message}`);
      }

      // Son strateji değilse kısa bekleme
      if (i < strategies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    this.stats.totalFailed++;
    console.log(`❌ Tüm CAPTCHA stratejileri başarısız`);
    return false;
  }

  // Strateji 1: Bekleme ve Refresh
  async strategyWaitAndRefresh(page) {
    const waitTime = 8000 + Math.random() * 10000; // 8-18 saniye
    console.log(`⏳ Bekleme stratejisi: ${(waitTime/1000).toFixed(1)}s`);
    
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    await page.reload({ 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return !(await this.detectCaptcha(page));
  }

  // Strateji 2: Ana sayfa navigasyonu
  async strategyHomepageNavigation(page) {
    const currentUrl = page.url();
    const homepageUrl = this.getHomepageUrl(currentUrl);
    
    console.log(`🏠 Ana sayfa stratejisi: ${homepageUrl}`);
    
    // Ana sayfaya git
    await page.goto(homepageUrl, { 
      waitUntil: 'networkidle',
      timeout: 20000 
    });
    
    // Biraz dolaş (insan benzeri)
    await this.simulateHomepageBrowsing(page);
    
    // Temiz bir URL ile geri dön
    const cleanUrl = this.sanitizeUrl(currentUrl);
    await page.goto(cleanUrl, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return !(await this.detectCaptcha(page));
  }

  // Strateji 3: User Agent değiştirme (context level'da olmasa da attempt)
  async strategyUserAgentChange(page) {
    console.log(`🎭 User Agent stratejisi`);
    
    // JavaScript ile user agent override dene
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        writable: false
      });
    });
    
    await page.reload({ 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return !(await this.detectCaptcha(page));
  }

  // Strateji 4: Basit refresh
  async strategySimpleRefresh(page) {
    console.log(`🔄 Basit refresh stratejisi`);
    
    await page.reload({ 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return !(await this.detectCaptcha(page));
  }

  async simulateHomepageBrowsing(page) {
    try {
      // Ana sayfada biraz gezinme simülasyonu
      const actions = [
        // Kategorilere hover
        async () => {
          const categoryLinks = await page.$$('a[href*="nav"], a[href*="department"]');
          if (categoryLinks.length > 0) {
            const randomLink = categoryLinks[Math.floor(Math.random() * Math.min(categoryLinks.length, 3))];
            await randomLink.hover();
          }
        },
        
        // Arama kutusuna tıklama (ama arama yapmama)
        async () => {
          const searchBox = await page.$('#twotabsearchtextbox, input[name="field-keywords"]');
          if (searchBox) {
            await searchBox.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        },
        
        // Scroll
        async () => {
          await page.evaluate(() => {
            window.scrollBy(0, 300 + Math.random() * 400);
          });
        }
      ];

      // 1-2 random action yap
      const actionCount = Math.floor(Math.random() * 2) + 1;
      for (let i = 0; i < actionCount; i++) {
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        await randomAction();
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
      }

    } catch (error) {
      console.log('⚠️ Homepage browsing simulation error:', error.message);
    }
  }

  getHomepageUrl(currentUrl) {
    try {
      const url = new URL(currentUrl);
      const hostname = url.hostname;
      
      // Amazon homepage mapping
      const homepageMap = {
        'amazon.com': 'https://amazon.com',
        'amazon.ca': 'https://amazon.ca',
        'amazon.co.uk': 'https://amazon.co.uk',
        'amazon.de': 'https://amazon.de',
        'amazon.fr': 'https://amazon.fr',
        'amazon.it': 'https://amazon.it',
        'amazon.es': 'https://amazon.es',
        'amazon.co.jp': 'https://amazon.co.jp',
        'amazon.com.au': 'https://amazon.com.au',
        'amazon.com.br': 'https://amazon.com.br',
        'amazon.com.mx': 'https://amazon.com.mx',
        'amazon.in': 'https://amazon.in',
        'amazon.nl': 'https://amazon.nl',
        'amazon.se': 'https://amazon.se',
        'amazon.pl': 'https://amazon.pl',
        'amazon.com.tr': 'https://amazon.com.tr',
        'amazon.ae': 'https://amazon.ae',
        'amazon.sa': 'https://amazon.sa',
        'amazon.sg': 'https://amazon.sg'
      };
      
      for (const [domain, homepage] of Object.entries(homepageMap)) {
        if (hostname.includes(domain)) {
          return homepage;
        }
      }
      
      return 'https://amazon.com';
    } catch (error) {
      return 'https://amazon.com';
    }
  }

  sanitizeUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Problematic parametreleri kaldır
      const problematicParams = [
        'ref', 'pf_rd_r', 'pf_rd_p', 'pf_rd_m', 'pf_rd_s', 'pf_rd_t',
        'pf_rd_i', '_encoding', 'pd_rd_r', 'pd_rd_w', 'pf_rd_', 'pd_rd_',
        'content-id', 'camp', 'creative', 'creativeASIN', 'linkCode',
        'tag', 'linkId', 'ascsubtag', 'ie'
      ];
      
      problematicParams.forEach(param => {
        // Exact match ve wildcard match
        Array.from(urlObj.searchParams.keys()).forEach(key => {
          if (key === param || key.startsWith(param)) {
            urlObj.searchParams.delete(key);
          }
        });
      });
      
      return urlObj.toString();
    } catch (error) {
      console.warn('URL sanitization error:', error.message);
      return url;
    }
  }

  recordCaptchaFrequency() {
    const now = Date.now();
    this.captchaFrequency.push(now);
    
    // Son 1 saatlik veriyi sakla
    const oneHourAgo = now - (60 * 60 * 1000);
    this.captchaFrequency = this.captchaFrequency.filter(time => time > oneHourAgo);
    
    this.lastCaptchaTime = now;
  }

  getCaptchaStats() {
    const now = Date.now();
    const timeSinceLastCaptcha = this.lastCaptchaTime ? 
      Math.round((now - this.lastCaptchaTime) / 1000) : null;
    
    const captchasLastHour = this.captchaFrequency.length;
    const avgTimeBetweenCaptchas = this.captchaFrequency.length > 1 ? 
      Math.round((this.captchaFrequency[this.captchaFrequency.length - 1] - this.captchaFrequency[0]) / 
                 (this.captchaFrequency.length - 1) / 1000) : null;

    const overallSuccessRate = this.stats.totalDetected > 0 ? 
      Math.round((this.stats.totalResolved / this.stats.totalDetected) * 100) : 0;

    return {
      totalDetected: this.stats.totalDetected,
      totalResolved: this.stats.totalResolved,
      totalFailed: this.stats.totalFailed,
      overallSuccessRate: `${overallSuccessRate}%`,
      captchasLastHour,
      timeSinceLastCaptcha: timeSinceLastCaptcha ? `${timeSinceLastCaptcha}s` : 'Never',
      avgTimeBetweenCaptchas: avgTimeBetweenCaptchas ? `${avgTimeBetweenCaptchas}s` : 'N/A',
      strategyStats: Object.entries(this.stats.byStrategy).map(([name, data]) => ({
        strategy: name,
        attempts: data.attempts,
        success: data.success,
        successRate: data.attempts > 0 ? `${Math.round((data.success / data.attempts) * 100)}%` : '0%'
      }))
    };
  }

  // CAPTCHA risk assessment
  assessCaptchaRisk() {
    const captchasInLastHour = this.captchaFrequency.length;
    let riskLevel = 'LOW';
    let recommendation = 'Normal operation';

    if (captchasInLastHour >= 10) {
      riskLevel = 'CRITICAL';
      recommendation = 'Stop operations, review proxy and behavior patterns';
    } else if (captchasInLastHour >= 5) {
      riskLevel = 'HIGH';
      recommendation = 'Reduce request frequency, increase delays';
    } else if (captchasInLastHour >= 2) {
      riskLevel = 'MEDIUM';
      recommendation = 'Monitor closely, slight delay increase recommended';
    }

    return {
      riskLevel,
      captchasInLastHour,
      recommendation,
      shouldPause: riskLevel === 'CRITICAL'
    };
  }
}

module.exports = AdvancedCaptchaHandler;