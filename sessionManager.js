// sessionManager.js - Gelişmiş Session Yöneticisi
const BrowserFingerprintManager = require('./fingerprintManager');
const HumanBehaviorSimulator = require('./humanBehavior');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.proxySessionMap = new Map(); // proxyId -> sessionId mapping
    this.fingerprintManager = new BrowserFingerprintManager();
    
    // Configuration
    this.config = {
      maxSessionAge: 35 * 60 * 1000, // 35 dakika (Amazon session timeout'undan önce)
      maxRequestsPerSession: 50, // Session başına maksimum istek
      maxCaptchaPerSession: 2, // Session başına maksimum CAPTCHA
      minSuccessRate: 0.6, // Minimum başarı oranı (%60)
      cooldownPeriod: 10 * 60 * 1000, // 10 dakika cooldown
      healthCheckInterval: 3 * 60 * 1000, // 3 dakikada bir health check
      maxConcurrentSessions: 20, // Maksimum eş zamanlı session
      sessionRotationThreshold: 0.7 // %70 başarı oranının altında rotasyon
    };
    
    // Statistics
    this.globalStats = {
      totalSessionsCreated: 0,
      totalSessionsExpired: 0,
      totalSessionsBlocked: 0,
      totalRequests: 0,
      totalSuccessfulRequests: 0,
      totalFailedRequests: 0,
      totalCaptchaEncounters: 0
    };

    // Initialize periodic tasks
    this.initHealthCheck();
    this.initSessionRotation();
  }

  createSession(proxyInfo, countryCode = 'us') {
    // Eğer bu proxy için zaten aktif session varsa onu döndür
    const existingSessionId = this.proxySessionMap.get(proxyInfo.id);
    if (existingSessionId && this.sessions.has(existingSessionId)) {
      const existingSession = this.sessions.get(existingSessionId);
      if (this.isSessionValid(existingSession)) {
        console.log(`♻️ Mevcut session kullanılıyor: ${existingSessionId}`);
        return existingSessionId;
      } else {
        // Geçersiz session'ı temizle
        this.removeSession(existingSessionId);
      }
    }

    // Session limitini kontrol et
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      console.warn(`⚠️ Maksimum session limitine ulaşıldı (${this.config.maxConcurrentSessions})`);
      this.cleanupOldestSessions(5); // En eski 5 session'ı temizle
    }

    // Yeni session oluştur
    const sessionId = `${countryCode}_${proxyInfo.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const fingerprint = this.fingerprintManager.generateFingerprint(countryCode);
    const behavior = new HumanBehaviorSimulator();
    
    // Yoğun saatlere göre behavior ayarla
    behavior.adjustForTrafficHours();
    
    const session = {
      id: sessionId,
      proxyInfo,
      fingerprint,
      behavior,
      countryCode: countryCode.toLowerCase(),
      
      // Timestamps
      createdAt: Date.now(),
      lastUsed: Date.now(),
      lastSuccessfulRequest: null,
      
      // Counters
      requestCount: 0,
      successfulRequests: 0,
      failedRequests: 0,
      captchaCount: 0,
      blockedCount: 0,
      
      // Performance metrics
      avgResponseTime: 0,
      responseTimes: [],
      successRate: 1.0,
      
      // Status
      status: 'active', // active, warning, blocked, expired
      blockReason: null,
      warnings: [],
      
      // Session health
      lastHealthCheck: Date.now(),
      healthScore: 100, // 0-100
      consecutiveFailures: 0,
      
      // Behavior tracking
      requestPattern: [],
      avgDelayBetweenRequests: 0
    };
    
    // Session'ı kaydet
    this.sessions.set(sessionId, session);
    this.proxySessionMap.set(proxyInfo.id, sessionId);
    this.globalStats.totalSessionsCreated++;
    
    console.log(`🆕 Yeni session oluşturuldu: ${sessionId} | Proxy: ${proxyInfo.id} | Ülke: ${countryCode.toUpperCase()}`);
    console.log(`📊 Aktif session sayısı: ${this.sessions.size}/${this.config.maxConcurrentSessions}`);
    
    return sessionId;
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      console.warn(`⚠️ Session bulunamadı: ${sessionId}`);
      return null;
    }
    
    // Session geçerliliğini kontrol et
    if (!this.isSessionValid(session)) {
      const reason = this.getInvalidityReason(session);
      console.log(`❌ Session geçersiz: ${sessionId} - ${reason}`);
      this.removeSession(sessionId);
      return null;
    }
    
    // Session'ı güncelle
    session.lastUsed = Date.now();
    session.requestCount++;
    this.globalStats.totalRequests++;
    
    // Request pattern tracking
    const now = Date.now();
    session.requestPattern.push(now);
    
    // Son 10 request'i sakla
    if (session.requestPattern.length > 10) {
      session.requestPattern.shift();
    }
    
    // Ortalama delay hesapla
    if (session.requestPattern.length >= 2) {
      const delays = [];
      for (let i = 1; i < session.requestPattern.length; i++) {
        delays.push(session.requestPattern[i] - session.requestPattern[i-1]);
      }
      session.avgDelayBetweenRequests = delays.reduce((a, b) => a + b, 0) / delays.length;
    }
    
    return session;
  }

  recordSessionResult(sessionId, success, responseTime = 0, hadCaptcha = false, errorType = null) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const now = Date.now();

    if (success) {
      session.successfulRequests++;
      session.lastSuccessfulRequest = now;
      session.consecutiveFailures = 0;
      this.globalStats.totalSuccessfulRequests++;
      
      // Health score iyileştir
      session.healthScore = Math.min(100, session.healthScore + 2);
      
    } else {
      session.failedRequests++;
      session.consecutiveFailures++;
      this.globalStats.totalFailedRequests++;
      
      // Health score düşür
      session.healthScore = Math.max(0, session.healthScore - 5);
      
      // Error type tracking
      if (errorType) {
        if (!session.errorTypes) session.errorTypes = {};
        session.errorTypes[errorType] = (session.errorTypes[errorType] || 0) + 1;
      }
    }

    if (hadCaptcha) {
      session.captchaCount++;
      session.healthScore = Math.max(0, session.healthScore - 10);
      this.globalStats.totalCaptchaEncounters++;
      
      console.warn(`🛑 Session CAPTCHA aldı: ${sessionId} (${session.captchaCount}/${this.config.maxCaptchaPerSession})`);
    }

    // Response time tracking
    if (responseTime > 0) {
      session.responseTimes.push(responseTime);
      if (session.responseTimes.length > 20) {
        session.responseTimes.shift(); // Son 20'yi sakla
      }
      
      // Ortalama response time güncelle
      session.avgResponseTime = session.responseTimes.reduce((a, b) => a + b, 0) / session.responseTimes.length;
    }

    // Success rate güncelle
    const totalRequests = session.successfulRequests + session.failedRequests;
    session.successRate = totalRequests > 0 ? session.successfulRequests / totalRequests : 1.0;

    // Session status güncelle
    this.updateSessionStatus(session);

    // Performance logging
    const successRate = (session.successRate * 100).toFixed(1);
    const healthScore = session.healthScore.toFixed(0);
    console.log(`📊 Session: ${sessionId.split('_')[0]} | Success: ${successRate}% | Health: ${healthScore}/100 | Captcha: ${session.captchaCount}`);
  }

  updateSessionStatus(session) {
    const totalRequests = session.successfulRequests + session.failedRequests;
    
    // Status güncelleme mantığı
    if (session.captchaCount >= this.config.maxCaptchaPerSession) {
      session.status = 'blocked';
      session.blockReason = 'Too many CAPTCHAs';
    } else if (session.consecutiveFailures >= 5) {
      session.status = 'blocked';
      session.blockReason = 'Too many consecutive failures';
    } else if (totalRequests >= 5 && session.successRate < this.config.minSuccessRate) {
      session.status = 'blocked';
      session.blockReason = 'Low success rate';
    } else if (session.healthScore < 30) {
      session.status = 'warning';
    } else {
      session.status = 'active';
    }

    // Warning tracking
    if (session.status === 'warning' && !session.warnings.includes('low_health')) {
      session.warnings.push('low_health');
    }
    
    if (session.successRate < 0.8 && !session.warnings.includes('low_success_rate')) {
      session.warnings.push('low_success_rate');
    }
  }

  isSessionValid(session) {
    const now = Date.now();
    
    // Yaş kontrolü
    if (now - session.createdAt > this.config.maxSessionAge) {
      return false;
    }
    
    // Request sayısı kontrolü
    if (session.requestCount >= this.config.maxRequestsPerSession) {
      return false;
    }
    
    // CAPTCHA kontrolü
    if (session.captchaCount >= this.config.maxCaptchaPerSession) {
      return false;
    }
    
    // Status kontrolü
    if (session.status === 'blocked') {
      return false;
    }
    
    // Başarı oranı kontrolü (en az 5 request sonrası)
    const totalRequests = session.successfulRequests + session.failedRequests;
    if (totalRequests >= 5 && session.successRate < this.config.minSuccessRate) {
      return false;
    }
    
    return true;
  }

  getInvalidityReason(session) {
    const now = Date.now();
    const totalRequests = session.successfulRequests + session.failedRequests;
    
    if (now - session.createdAt > this.config.maxSessionAge) {
      return `Session expired (${Math.round((now - session.createdAt) / 60000)} minutes old)`;
    }
    
    if (session.requestCount >= this.config.maxRequestsPerSession) {
      return `Request limit exceeded (${session.requestCount}/${this.config.maxRequestsPerSession})`;
    }
    
    if (session.captchaCount >= this.config.maxCaptchaPerSession) {
      return `Too many CAPTCHAs (${session.captchaCount}/${this.config.maxCaptchaPerSession})`;
    }
    
    if (session.status === 'blocked') {
      return `Blocked: ${session.blockReason}`;
    }
    
    if (totalRequests >= 5 && session.successRate < this.config.minSuccessRate) {
      return `Low success rate (${(session.successRate * 100).toFixed(1)}%)`;
    }
    
    return 'Unknown reason';
  }

  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Proxy mapping'i temizle
      this.proxySessionMap.delete(session.proxyInfo.id);
      
      // Session'ı sil
      this.sessions.delete(sessionId);
      this.globalStats.totalSessionsExpired++;
      
      console.log(`🗑️ Session kaldırıldı: ${sessionId}`);
    }
  }

  cleanupOldestSessions(count = 5) {
    const sessionArray = Array.from(this.sessions.values());
    
    // En eski session'ları bul
    const oldestSessions = sessionArray
      .sort((a, b) => a.lastUsed - b.lastUsed)
      .slice(0, count);
    
    oldestSessions.forEach(session => {
      console.log(`🧹 Eski session temizleniyor: ${session.id}`);
      this.removeSession(session.id);
    });
  }

  // Periodic health check
  initHealthCheck() {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [sessionId, session] of this.sessions.entries()) {
        // Yaşlı session'ları temizle
        if (now - session.lastUsed > this.config.maxSessionAge) {
          this.removeSession(sessionId);
          cleanedCount++;
        }
        // Health check yap
        else {
          session.lastHealthCheck = now;
          this.updateSessionStatus(session);
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 Health check: ${cleanedCount} session temizlendi`);
      }
    }, this.config.healthCheckInterval);
  }

  // Proactive session rotation
  initSessionRotation() {
    setInterval(() => {
      const sessionsToRotate = [];
      
      for (const [sessionId, session] of this.sessions.entries()) {
        const totalRequests = session.successfulRequests + session.failedRequests;
        
        // Rotasyon kriterleri
        const shouldRotate = 
          (totalRequests >= 5 && session.successRate < this.config.sessionRotationThreshold) ||
          (session.healthScore < 50) ||
          (session.consecutiveFailures >= 3) ||
          (session.requestCount >= this.config.maxRequestsPerSession * 0.8); // %80'e yaklaştıysa
        
        if (shouldRotate) {
          sessionsToRotate.push(sessionId);
        }
      }
      
      if (sessionsToRotate.length > 0) {
        console.log(`🔄 ${sessionsToRotate.length} session rotasyona alınıyor`);
        sessionsToRotate.forEach(sessionId => this.removeSession(sessionId));
      }
    }, 5 * 60 * 1000); // 5 dakikada bir kontrol
  }

  // Session istatistikleri
  getSessionStats() {
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active');
    const warningSessions = Array.from(this.sessions.values()).filter(s => s.status === 'warning');
    const blockedSessions = Array.from(this.sessions.values()).filter(s => s.status === 'blocked');
    
    // Ülkelere göre dağılım
    const byCountry = {};
    for (const session of this.sessions.values()) {
      const country = session.countryCode;
      if (!byCountry[country]) {
        byCountry[country] = { count: 0, requests: 0, success: 0 };
      }
      byCountry[country].count++;
      byCountry[country].requests += session.requestCount;
      byCountry[country].success += session.successfulRequests;
    }
    
    // Ortalama metrikler
    const allSessions = Array.from(this.sessions.values());
    const avgSessionAge = allSessions.length > 0 ? 
      allSessions.reduce((sum, s) => sum + (Date.now() - s.createdAt), 0) / allSessions.length / 1000 : 0;
    
    const avgSuccessRate = allSessions.length > 0 ?
      allSessions.reduce((sum, s) => sum + s.successRate, 0) / allSessions.length : 0;
    
    const avgHealthScore = allSessions.length > 0 ?
      allSessions.reduce((sum, s) => sum + s.healthScore, 0) / allSessions.length : 0;

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      warningSessions: warningSessions.length,
      blockedSessions: blockedSessions.length,
      
      globalStats: {
        ...this.globalStats,
        overallSuccessRate: this.globalStats.totalRequests > 0 ? 
          (this.globalStats.totalSuccessfulRequests / this.globalStats.totalRequests * 100).toFixed(1) + '%' : '0%'
      },
      
      averages: {
        sessionAge: `${Math.round(avgSessionAge)}s`,
        successRate: `${(avgSuccessRate * 100).toFixed(1)}%`,
        healthScore: `${avgHealthScore.toFixed(1)}/100`,
        requestsPerSession: allSessions.length > 0 ? 
          Math.round(allSessions.reduce((sum, s) => sum + s.requestCount, 0) / allSessions.length) : 0
      },
      
      byCountry,
      
      performance: {
        maxConcurrentSessions: this.config.maxConcurrentSessions,
        currentUtilization: `${Math.round((this.sessions.size / this.config.maxConcurrentSessions) * 100)}%`,
        avgResponseTime: allSessions.length > 0 ?
          `${Math.round(allSessions.reduce((sum, s) => sum + s.avgResponseTime, 0) / allSessions.length)}ms` : '0ms'
      }
    };
  }

  // Session detayları
  getSessionDetails(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();
    const sessionAge = Math.round((now - session.createdAt) / 1000);
    const timeSinceLastUse = Math.round((now - session.lastUsed) / 1000);

    return {
      id: session.id,
      status: session.status,
      proxy: session.proxyInfo.id,
      country: session.countryCode.toUpperCase(),
      
      timing: {
        age: `${sessionAge}s`,
        timeSinceLastUse: `${timeSinceLastUse}s`,
        lastSuccessfulRequest: session.lastSuccessfulRequest ? 
          `${Math.round((now - session.lastSuccessfulRequest) / 1000)}s ago` : 'Never'
      },
      
      metrics: {
        requestCount: session.requestCount,
        successfulRequests: session.successfulRequests,
        failedRequests: session.failedRequests,
        captchaCount: session.captchaCount,
        successRate: `${(session.successRate * 100).toFixed(1)}%`,
        healthScore: `${session.healthScore}/100`,
        avgResponseTime: `${Math.round(session.avgResponseTime)}ms`,
        avgDelayBetweenRequests: `${Math.round(session.avgDelayBetweenRequests / 1000)}s`
      },
      
      warnings: session.warnings,
      blockReason: session.blockReason,
      
      browser: {
        userAgent: session.fingerprint.userAgent.substring(0, 50) + '...',
        viewport: `${session.fingerprint.viewport.width}x${session.fingerprint.viewport.height}`,
        platform: session.fingerprint.platform,
        timezone: session.fingerprint.timezone
      }
    };
  }

  // Tüm session'ları temizle
  clearAllSessions() {
    const count = this.sessions.size;
    this.sessions.clear();
    this.proxySessionMap.clear();
    console.log(`🧹 Tüm session'lar temizlendi: ${count} session`);
  }

  // Session sayısını sınırla
  limitSessions(maxSessions) {
    while (this.sessions.size > maxSessions) {
      this.cleanupOldestSessions(1);
    }
  }
}

module.exports = SessionManager;