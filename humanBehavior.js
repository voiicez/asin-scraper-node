// humanBehavior.js - Daha hızlı ve verimli bekleme süreleri
class HumanBehaviorSimulator {
  constructor() {
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.sessionStartTime = Date.now();
    this.recentDelays = [];
    this.behaviorPattern = this.generateBehaviorPattern();
  }

  // Her session için farklı davranış paterni oluştur - DAHA HIZLI
  generateBehaviorPattern() {
    return {
      baseDelayMin: 2000 + Math.random() * 1000, // 2-3 saniye (eskiden 3-5)
      baseDelayMax: 5000 + Math.random() * 2000, // 5-7 saniye (eskiden 8-12)
      longBreakChance: 0.05 + Math.random() * 0.05, // %5-10 (eskiden %10-20)
      quickActionChance: 0.15 + Math.random() * 0.15, // %15-30 (eskiden %5-15)
      mouseMovementChance: 0.40 + Math.random() * 0.20, // %40-60 (eskiden %60-80)
      scrollChance: 0.30 + Math.random() * 0.20, // %30-50 (eskiden %50-80)
      interactionChance: 0.10 + Math.random() * 0.15, // %10-25 (eskiden %20-40)
      readingChance: 0.15 + Math.random() * 0.20 // %15-35 (eskiden %30-60)
    };
  }

  async humanDelay() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Request frequency kontrolü
    const sessionDuration = now - this.sessionStartTime;
    const requestFrequency = this.requestCount / (sessionDuration / 1000);
    
    // Çok hızlı istek yapılıyorsa gecikmeyi arttır (daha az agresif)
    const frequencyMultiplier = Math.max(1, requestFrequency / 0.2); // 0.1'den 0.2'ye
    
    // Base delay hesaplama
    const baseDelay = this.behaviorPattern.baseDelayMin + 
      Math.random() * (this.behaviorPattern.baseDelayMax - this.behaviorPattern.baseDelayMin);
    
    let finalDelay = baseDelay * frequencyMultiplier;
    
    // Uzun mola pattern'i - DAHA KISA
    if (Math.random() < this.behaviorPattern.longBreakChance) {
      finalDelay *= (1.5 + Math.random() * 1.5); // 1.5-3x arası (eskiden 2-5x)
      console.log('💤 Uzun mola veriliyor...');
    }
    
    // Hızlı hareket pattern'i
    if (Math.random() < this.behaviorPattern.quickActionChance) {
      finalDelay = Math.max(800, finalDelay * 0.3); // 800ms minimum (eskiden 1000ms)
      console.log('⚡ Hızlı hareket...');
    }
    
    // Pattern detection'ı önlemek için delay history kontrolü
    this.recentDelays.push(finalDelay);
    if (this.recentDelays.length > 10) {
      this.recentDelays.shift();
    }
    
    // Çok benzer delay'ler varsa randomize et
    if (this.recentDelays.length >= 3) {
      const avgDelay = this.recentDelays.reduce((a, b) => a + b, 0) / this.recentDelays.length;
      const variance = this.recentDelays.reduce((acc, delay) => acc + Math.pow(delay - avgDelay, 2), 0) / this.recentDelays.length;
      
      if (variance < 500000) { // Düşük varyans threshold düşürüldü
        finalDelay += Math.random() * 2000 - 1000; // ±1 saniye (eskiden ±2.5)
        console.log('🔀 Pattern detection önlemi - delay randomize edildi');
      }
    }
    
    // Minimum delay garantisi - DAHA DÜŞÜK
    finalDelay = Math.max(1000, finalDelay); // 1 saniye minimum (eskiden 1.5)
    
    // Maximum delay limiti - YENİ EKLEME
    finalDelay = Math.min(15000, finalDelay); // 15 saniye maksimum
    
    console.log(`⏱️ İnsan benzeri bekleme: ${(finalDelay/1000).toFixed(1)}s (freq: ${requestFrequency.toFixed(2)}/s)`);
    
    await new Promise(resolve => setTimeout(resolve, finalDelay));
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async simulateMouseMovement(page) {
    if (Math.random() < this.behaviorPattern.mouseMovementChance) {
      const moveCount = Math.floor(Math.random() * 3) + 1; // 1-3 hareket (eskiden 1-4)
      
      console.log(`🖱️ Mouse hareketi simülasyonu (${moveCount} hareket)`);
      
      for (let i = 0; i < moveCount; i++) {
        // Viewport boyutunu al
        const viewport = page.viewportSize();
        const maxX = viewport ? viewport.width - 100 : 1200;
        const maxY = viewport ? viewport.height - 100 : 600;
        
        const x = Math.floor(Math.random() * maxX) + 50;
        const y = Math.floor(Math.random() * maxY) + 50;
        const steps = Math.floor(Math.random() * 5) + 3; // 3-7 step (eskiden 5-14)
        
        await page.mouse.move(x, y, { steps });
        await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 50)); // 50-350ms (eskiden 100-600)
      }
    }
  }

  async simulateScrolling(page) {
    if (Math.random() < this.behaviorPattern.scrollChance) {
      const scrollCount = Math.floor(Math.random() * 2) + 1; // 1-2 scroll (eskiden 1-3)
      
      console.log(`📜 Scroll simülasyonu (${scrollCount} scroll)`);
      
      for (let i = 0; i < scrollCount; i++) {
        const scrollY = Math.floor(Math.random() * 400) + 100; // 100-500px (eskiden 200-800)
        const scrollDirection = Math.random() > 0.15 ? scrollY : -scrollY * 0.4; // Çoğunlukla aşağı
        
        await page.evaluate((y) => {
          window.scrollBy({
            top: y,
            behavior: Math.random() > 0.4 ? 'smooth' : 'auto'
          });
        }, scrollDirection);
        
        await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 300)); // 300-1100ms (eskiden 500-2000)
      }
    }
  }

  async simulateReading(page) {
    if (Math.random() < this.behaviorPattern.readingChance) {
      const readingTime = Math.random() * 2000 + 800; // 0.8-2.8 saniye (eskiden 1.5-5.5)
      console.log(`📖 Sayfa okunuyor... (${(readingTime/1000).toFixed(1)}s)`);
      await new Promise(resolve => setTimeout(resolve, readingTime));
    }
  }

  async randomPageInteraction(page) {
    if (Math.random() < this.behaviorPattern.interactionChance) {
      try {
        console.log('🎯 Random sayfa etkileşimi');
        
        const interactionSelectors = [
          'a[href*="nav"]', // Navigation linklerine hover
          '.s-pagination-strip a', // Pagination
          '.a-dropdown-prompt', // Dropdown'lara hover
          'h2 a[href*="/dp/"]', // Ürün başlıklarına hover
          '.a-price', // Fiyatlara hover
          '.s-navigation-item a', // Sol menu kategorilerine hover
          '#departments a' // Departman linklerine hover
        ];
        
        const selector = interactionSelectors[Math.floor(Math.random() * interactionSelectors.length)];
        const elements = await page.$$(selector);
        
        if (elements.length > 0) {
          const randomElement = elements[Math.floor(Math.random() * Math.min(elements.length, 3))]; // 3'e sınırla (eskiden 5)
          
          // Hover işlemi - DAHA KISA
          await randomElement.hover();
          const hoverTime = Math.random() * 1000 + 300; // 300-1300ms (eskiden 500-2500)
          await new Promise(resolve => setTimeout(resolve, hoverTime));
          
          // %10 ihtimalle tıklama (eskiden %15)
          if (Math.random() < 0.10) {
            try {
              const href = await randomElement.getAttribute('href');
              if (href && !href.includes('amazon.') && href.startsWith('/')) {
                console.log('🖱️ Middle click simülasyonu (yeni tab)');
                await randomElement.click({ button: 'middle' });
                await new Promise(resolve => setTimeout(resolve, 100)); // 100ms (eskiden 200)
              }
            } catch (e) {
              // Tıklama başarısız olursa sessizce geç
            }
          }
        }
      } catch (e) {
        // Etkileşim başarısız olursa sessizce geç
      }
    }
  }

  async performFullBehaviorSimulation(page) {
    // Tam davranış simülasyonu - random sırada AMA DAHA AZ
    const behaviors = [
      () => this.simulateMouseMovement(page),
      () => this.simulateScrolling(page),
      () => this.simulateReading(page),
      () => this.randomPageInteraction(page)
    ];
    
    // Behavior'ları karıştır
    const shuffledBehaviors = behaviors.sort(() => Math.random() - 0.5);
    
    // 2-3 behavior seç (eskiden hepsini)
    const behaviorCount = Math.floor(Math.random() * 2) + 2; // 2-3 behavior
    const selectedBehaviors = shuffledBehaviors.slice(0, behaviorCount);
    
    // Her behavior'ı sırayla çalıştır (kısa bekleme ile)
    for (const behavior of selectedBehaviors) {
      await behavior();
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200)); // 200-700ms (eskiden 300-1300)
    }
  }

  // Yoğun trafik saatlerinde daha temkinli davranış - DAHA AZ AGRESIF
  adjustForTrafficHours() {
    const hour = new Date().getHours();
    const isRushHour = (hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16) || (hour >= 19 && hour <= 21);
    
    if (isRushHour) {
      this.behaviorPattern.baseDelayMin *= 1.2; // 1.5'ten 1.2'ye
      this.behaviorPattern.baseDelayMax *= 1.2; // 1.5'ten 1.2'ye
      this.behaviorPattern.longBreakChance *= 1.1; // 1.3'ten 1.1'e
      console.log('🕐 Yoğun saatler - daha temkinli davranış');
    }
  }

  getBehaviorStats() {
    const now = Date.now();
    const sessionDuration = now - this.sessionStartTime;
    const avgDelay = this.recentDelays.length > 0 ? 
      this.recentDelays.reduce((a, b) => a + b, 0) / this.recentDelays.length : 0;
    
    return {
      sessionDuration: Math.round(sessionDuration / 1000), // saniye
      totalRequests: this.requestCount,
      avgRequestFrequency: this.requestCount / (sessionDuration / 1000),
      avgDelay: Math.round(avgDelay),
      behaviorPattern: this.behaviorPattern
    };
  }
}

module.exports = HumanBehaviorSimulator;