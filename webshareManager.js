// webshareManager.js - Webshare Proxy Manager
const fs = require('fs').promises;
const path = require('path');

class WebshareProxyManager {
  constructor() {
    this.proxies = [];
    this.activeProxies = new Set();
    this.blockedProxies = new Set();
    this.cooldownProxies = new Set(); // Cooldown'daki proxy'ler
    this.proxyStats = new Map(); // {ip: {success: 0, failed: 0, lastUsed: 0, blocked: false}}
    this.rotationIndex = 0;
    
    // Configuration
    this.config = {
      maxFailuresBeforeBlock: 3, // 3 başarısız denemeden sonra engelle
      blockDuration: 30 * 60 * 1000, // 30 dakika engelleme süresi
      cooldownDuration: 5 * 60 * 1000, // 5 dakika cooldown
      healthCheckInterval: 3 * 60 * 1000, // 3 dakikada bir health check
      maxConcurrentUse: 1, // Aynı anda bir proxy'yi sadece 1 session kullanabilir
      requestsBeforeCooldown: 30, // 30 request sonra cooldown
      minTimeBetweenRequests: 3000, // Proxy'ler arası minimum 3 saniye
      rotationStrategy: 'round_robin' // round_robin, random, least_used
    };
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      blockedProxies: 0,
      cooldownProxies: 0,
      avgResponseTime: 0,
      responseTimes: []
    };
    
    this.initHealthCheck();
    this.initCooldownManager();
  }

  async loadProxies() {
    try {
      // Birden fazla muhtemel dosya yolu dene
      const possiblePaths = [
        path.join(process.cwd(), 'Webshare 60 proxies.txt'),
        path.join(__dirname, 'Webshare 60 proxies.txt'),
        path.join(process.cwd(), 'proxies', 'Webshare 60 proxies.txt'),
        'Webshare 60 proxies.txt'
      ];
      
      let proxyFile = null;
      let content = null;
      
      for (const filePath of possiblePaths) {
        try {
          console.log(`📂 Deneniyor: ${filePath}`);
          content = await fs.readFile(filePath, 'utf8');
          proxyFile = filePath;
          console.log(`✅ Proxy dosyası bulundu: ${filePath}`);
          break;
        } catch (err) {
          console.log(`❌ Bulunamadı: ${filePath}`);
          continue;
        }
      }
      
      if (!content) {
        console.log('🔄 Hard-coded proxy listesi kullanılıyor...');
        this.loadHardcodedProxies();
        return;
      }
      
      this.proxies = content.trim().split('\n').map((line, index) => {
        const parts = line.trim().split(':');
        if (parts.length !== 4) {
          console.warn(`⚠️ Geçersiz proxy formatı satır ${index + 1}: ${line}`);
          return null;
        }
        
        const [ip, port, username, password] = parts;
        return {
          ip: ip.trim(),
          port: parseInt(port.trim()),
          username: username.trim(),
          password: password.trim(),
          id: `${ip.trim()}:${port.trim()}`,
          url: `http://${username.trim()}:${password.trim()}@${ip.trim()}:${port.trim()}`,
          country: 'us' // Tüm proxy'ler US olduğu belirtilmiş
        };
      }).filter(proxy => proxy !== null);

      // Tüm proxy'leri aktif olarak başlat
      this.proxies.forEach(proxy => {
        this.activeProxies.add(proxy.id);
        this.proxyStats.set(proxy.id, {
          success: 0,
          failed: 0,
          lastUsed: 0,
          blocked: false,
          blockedAt: null,
          cooldownAt: null,
          requestCount: 0,
          avgResponseTime: 0,
          responseTimes: [],
          consecutiveFailures: 0,
          lastError: null,
          healthScore: 100
        });
      });

      console.log(`✅ ${this.proxies.length} Webshare proxy yüklendi`);
      console.log(`🔄 ${this.activeProxies.size} proxy aktif durumda`);
      
      // İlk birkaç proxy'yi logla
      console.log('📋 İlk 3 proxy:');
      this.proxies.slice(0, 3).forEach((proxy, index) => {
        console.log(`  ${index + 1}. ${proxy.ip}:${proxy.port}`);
      });
      
    } catch (error) {
      console.error('❌ Proxy dosyası yüklenirken hata:', error);
      console.log('🔄 Hard-coded proxy listesi kullanılıyor...');
      this.loadHardcodedProxies();
    }
  }

  // Hard-coded fallback proxy listesi
  loadHardcodedProxies() {
    const hardcodedProxies = [
      "45.248.55.50:6636:lscwfhky:5086c0bj7cgo",
      "46.203.161.46:5543:lscwfhky:5086c0bj7cgo",
      "72.1.155.234:7625:lscwfhky:5086c0bj7cgo",
      "45.196.33.96:6077:lscwfhky:5086c0bj7cgo",
      "156.237.27.218:5616:lscwfhky:5086c0bj7cgo",
      "156.237.35.181:5584:lscwfhky:5086c0bj7cgo",
      "130.180.237.110:7053:lscwfhky:5086c0bj7cgo",
      "103.210.12.184:6112:lscwfhky:5086c0bj7cgo",
      "192.46.200.149:5819:lscwfhky:5086c0bj7cgo",
      "216.98.230.154:6607:lscwfhky:5086c0bj7cgo"
    ];
    
    this.proxies = hardcodedProxies.map(line => {
      const [ip, port, username, password] = line.split(':');
      return {
        ip,
        port: parseInt(port),
        username,
        password,
        id: `${ip}:${port}`,
        url: `http://${username}:${password}@${ip}:${port}`,
        country: 'us'
      };
    });

    this.proxies.forEach(proxy => {
      this.activeProxies.add(proxy.id);
      this.proxyStats.set(proxy.id, {
        success: 0,
        failed: 0,
        lastUsed: 0,
        blocked: false,
        blockedAt: null,
        cooldownAt: null,
        requestCount: 0,
        avgResponseTime: 0,
        responseTimes: [],
        consecutiveFailures: 0,
        lastError: null,
        healthScore: 100
      });
    });

    console.log(`✅ ${this.proxies.length} hard-coded proxy yüklendi (fallback)`);
  }

  getNextProxy(strategy = null) {
    const availableProxyIds = Array.from(this.activeProxies).filter(proxyId => {
      const stats = this.proxyStats.get(proxyId);
      const now = Date.now();
      
      // Minimum time between requests kontrolü
      if (stats.lastUsed && (now - stats.lastUsed) < this.config.minTimeBetweenRequests) {
        return false;
      }
      
      // Cooldown kontrolü
      if (this.cooldownProxies.has(proxyId)) {
        return false;
      }
      
      return true;
    });
    
    if (availableProxyIds.length === 0) {
      console.warn('⚠️ Hiç kullanılabilir proxy kalmadı!');
      return null;
    }

    let selectedProxyId;
    const usedStrategy = strategy || this.config.rotationStrategy;

    switch (usedStrategy) {
      case 'random':
        selectedProxyId = availableProxyIds[Math.floor(Math.random() * availableProxyIds.length)];
        break;
        
      case 'least_used':
        selectedProxyId = availableProxyIds.reduce((least, current) => {
          const leastStats = this.proxyStats.get(least);
          const currentStats = this.proxyStats.get(current);
          return currentStats.requestCount < leastStats.requestCount ? current : least;
        });
        break;
        
      case 'round_robin':
      default:
        selectedProxyId = availableProxyIds[this.rotationIndex % availableProxyIds.length];
        this.rotationIndex++;
        break;
    }
    
    const proxy = this.proxies.find(p => p.id === selectedProxyId);
    
    if (proxy) {
      const stats = this.proxyStats.get(selectedProxyId);
      stats.lastUsed = Date.now();
      stats.requestCount++;
      
      console.log(`🔄 Proxy seçildi: ${proxy.ip} | Strateji: ${usedStrategy} | Kullanım: ${stats.requestCount} | Health: ${stats.healthScore}`);
      
      // Request sayısına göre cooldown kontrolü
      if (stats.requestCount >= this.config.requestsBeforeCooldown) {
        this.putProxyOnCooldown(selectedProxyId);
      }
    }
    
    return proxy;
  }

  recordProxyResult(proxyId, success, responseTime = 0, errorType = null) {
    const stats = this.proxyStats.get(proxyId);
    if (!stats) return;

    this.stats.totalRequests++;

    if (success) {
      stats.success++;
      stats.consecutiveFailures = 0;
      stats.healthScore = Math.min(100, stats.healthScore + 2);
      this.stats.successfulRequests++;
      
      console.log(`✅ Proxy başarılı: ${proxyId} | Success: ${stats.success}/${stats.success + stats.failed} | Health: ${stats.healthScore}`);
    } else {
      stats.failed++;
      stats.consecutiveFailures++;
      stats.healthScore = Math.max(0, stats.healthScore - 5);
      stats.lastError = errorType;
      this.stats.failedRequests++;
      
      console.log(`❌ Proxy başarısız: ${proxyId} | Failed: ${stats.failed}/${stats.success + stats.failed} | Consecutive: ${stats.consecutiveFailures}`);
      
      // Çok fazla başarısızlık varsa proxy'yi engelle
      if (stats.consecutiveFailures >= this.config.maxFailuresBeforeBlock) {
        this.blockProxy(proxyId, `${stats.consecutiveFailures} consecutive failures`);
      }
    }

    // Response time tracking
    if (responseTime > 0) {
      stats.responseTimes.push(responseTime);
      this.stats.responseTimes.push(responseTime);
      
      // Son 10 response time'ı sakla
      if (stats.responseTimes.length > 10) {
        stats.responseTimes.shift();
      }
      if (this.stats.responseTimes.length > 100) {
        this.stats.responseTimes.shift();
      }
      
      // Ortalama response time güncelle
      stats.avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
      this.stats.avgResponseTime = this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length;
    }
  }

  putProxyOnCooldown(proxyId) {
    const stats = this.proxyStats.get(proxyId);
    if (stats) {
      stats.cooldownAt = Date.now();
      stats.requestCount = 0; // Reset request count
    }
    
    this.activeProxies.delete(proxyId);
    this.cooldownProxies.add(proxyId);
    this.stats.cooldownProxies++;
    
    console.log(`😴 Proxy cooldown'a alındı: ${proxyId} | Aktif: ${this.activeProxies.size}`);
  }

  blockProxy(proxyId, reason = 'Unknown') {
    const stats = this.proxyStats.get(proxyId);
    if (stats) {
      stats.blocked = true;
      stats.blockedAt = Date.now();
      stats.healthScore = 0;
    }
    
    this.activeProxies.delete(proxyId);
    this.cooldownProxies.delete(proxyId);
    this.blockedProxies.add(proxyId);
    this.stats.blockedProxies++;
    
    console.log(`🚫 Proxy engellendi: ${proxyId} | Sebep: ${reason} | Aktif: ${this.activeProxies.size}`);
  }

  unblockProxy(proxyId) {
    const stats = this.proxyStats.get(proxyId);
    if (stats) {
      stats.blocked = false;
      stats.blockedAt = null;
      stats.consecutiveFailures = 0;
      stats.healthScore = 70; // Partial recovery
    }
    
    this.blockedProxies.delete(proxyId);
    this.activeProxies.add(proxyId);
    
    console.log(`✅ Proxy engeli kaldırıldı: ${proxyId} | Aktif: ${this.activeProxies.size}`);
  }

  removeCooldown(proxyId) {
    const stats = this.proxyStats.get(proxyId);
    if (stats) {
      stats.cooldownAt = null;
      stats.requestCount = 0;
      stats.healthScore = Math.min(100, stats.healthScore + 10);
    }
    
    this.cooldownProxies.delete(proxyId);
    this.activeProxies.add(proxyId);
    
    console.log(`🔄 Proxy cooldown'dan çıkarıldı: ${proxyId} | Aktif: ${this.activeProxies.size}`);
  }

  // Health check - engellenen ve cooldown'daki proxy'leri kontrol et
  initHealthCheck() {
    setInterval(() => {
      const now = Date.now();
      
      // Engellenen proxy'leri kontrol et
      for (const proxyId of this.blockedProxies) {
        const stats = this.proxyStats.get(proxyId);
        if (stats && stats.blockedAt && (now - stats.blockedAt > this.config.blockDuration)) {
          console.log(`🔄 Proxy engeli süresi doldu: ${proxyId}`);
          this.unblockProxy(proxyId);
        }
      }
    }, this.config.healthCheckInterval);
  }

  // Cooldown manager
  initCooldownManager() {
    setInterval(() => {
      const now = Date.now();
      
      for (const proxyId of this.cooldownProxies) {
        const stats = this.proxyStats.get(proxyId);
        if (stats && stats.cooldownAt && (now - stats.cooldownAt > this.config.cooldownDuration)) {
          console.log(`😴 Proxy cooldown süresi doldu: ${proxyId}`);
          this.removeCooldown(proxyId);
        }
      }
    }, 30000); // 30 saniyede bir kontrol
  }

  getProxyStats() {
    const totalProxies = this.proxies.length;
    const activeCount = this.activeProxies.size;
    const blockedCount = this.blockedProxies.size;
    const cooldownCount = this.cooldownProxies.size;
    
    const overallSuccessRate = this.stats.totalRequests > 0 ? 
      (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(1) : '0.0';

    // En iyi ve en kötü proxy'leri bul
    let bestProxy = null;
    let worstProxy = null;
    let highestSuccessRate = -1;
    let lowestSuccessRate = 101;

    for (const [proxyId, stats] of this.proxyStats.entries()) {
      const totalRequests = stats.success + stats.failed;
      if (totalRequests >= 5) { // En az 5 request olması lazım
        const successRate = (stats.success / totalRequests) * 100;
        if (successRate > highestSuccessRate) {
          highestSuccessRate = successRate;
          bestProxy = { id: proxyId, rate: successRate.toFixed(1) };
        }
        if (successRate < lowestSuccessRate) {
          lowestSuccessRate = successRate;
          worstProxy = { id: proxyId, rate: successRate.toFixed(1) };
        }
      }
    }

    return {
      totalProxies,
      activeProxies: activeCount,
      blockedProxies: blockedCount,
      cooldownProxies: cooldownCount,
      utilizationRate: `${Math.round((activeCount / totalProxies) * 100)}%`,
      
      performance: {
        overallSuccessRate: `${overallSuccessRate}%`,
        totalRequests: this.stats.totalRequests,
        avgResponseTime: this.stats.responseTimes.length > 0 ? 
          `${Math.round(this.stats.avgResponseTime)}ms` : '0ms',
        requestsPerMinute: this.calculateRequestsPerMinute()
      },
      
      topPerformers: {
        best: bestProxy,
        worst: worstProxy
      },
      
      health: {
        healthyProxies: Array.from(this.proxyStats.entries())
          .filter(([_, stats]) => stats.healthScore >= 70).length,
        avgHealthScore: this.calculateAverageHealthScore().toFixed(1)
      }
    };
  }

  calculateRequestsPerMinute() {
    // Basit implementasyon - daha sofistike olabilir
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let recentRequests = 0;
    for (const stats of this.proxyStats.values()) {
      if (stats.lastUsed && stats.lastUsed > oneMinuteAgo) {
        recentRequests++;
      }
    }
    
    return recentRequests;
  }

  calculateAverageHealthScore() {
    const scores = Array.from(this.proxyStats.values()).map(stats => stats.healthScore);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  // Proxy formatını Playwright için hazırla
  getProxySettings(proxy) {
    if (!proxy) return null;
    
    return {
      server: `http://${proxy.ip}:${proxy.port}`,
      username: proxy.username,
      password: proxy.password
    };
  }

  // Tüm proxy'lerin detaylı bilgilerini al
  getAllProxyDetails() {
    return Array.from(this.proxyStats.entries()).map(([proxyId, stats]) => {
      const proxy = this.proxies.find(p => p.id === proxyId);
      const totalRequests = stats.success + stats.failed;
      const successRate = totalRequests > 0 ? (stats.success / totalRequests * 100).toFixed(1) : '0.0';
      
      let status = 'active';
      if (this.blockedProxies.has(proxyId)) status = 'blocked';
      else if (this.cooldownProxies.has(proxyId)) status = 'cooldown';
      else if (!this.activeProxies.has(proxyId)) status = 'inactive';

      return {
        id: proxyId,
        ip: proxy?.ip,
        status,
        requests: totalRequests,
        successRate: `${successRate}%`,
        healthScore: stats.healthScore,
        avgResponseTime: `${Math.round(stats.avgResponseTime)}ms`,
        consecutiveFailures: stats.consecutiveFailures,
        lastUsed: stats.lastUsed ? new Date(stats.lastUsed).toLocaleTimeString() : 'Never',
        lastError: stats.lastError
      };
    });
  }

  // Proxy'leri yeniden başlat (emergency reset)
  resetAllProxies() {
    console.log('🔄 Tüm proxyler yeniden başlatılıyor...');
    
    this.activeProxies.clear();
    this.blockedProxies.clear();
    this.cooldownProxies.clear();
    
    // Tüm proxy'leri aktif duruma getir ve istatistikleri sıfırla
    this.proxies.forEach(proxy => {
      this.activeProxies.add(proxy.id);
      this.proxyStats.set(proxy.id, {
        success: 0,
        failed: 0,
        lastUsed: 0,
        blocked: false,
        blockedAt: null,
        cooldownAt: null,
        requestCount: 0,
        avgResponseTime: 0,
        responseTimes: [],
        consecutiveFailures: 0,
        lastError: null,
        healthScore: 100
      });
    });
    
    this.rotationIndex = 0;
    
    console.log(`✅ ${this.proxies.length} proxy yeniden başlatıldı`);
  }
}

module.exports = WebshareProxyManager;