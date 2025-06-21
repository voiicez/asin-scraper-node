// fastMode.js
const { MAX_BROWSERS } = require('./browserPools');
const SessionManager = require('./sessionManager');
const WebshareProxyManager = require('./webshareManager');
const HumanBehaviorSimulator = require('./humanBehavior');

// Hız ayarlarını uygula
function enableFastMode() {
  console.log('⚡ FAST MODE aktif edildi');

  // Browser sayısını artır
  global.FAST_MODE_MAX_BROWSERS = 10;

  // SessionManager ayarlarını override et
  const sm = new SessionManager();
  sm.config.maxRequestsPerSession = 100;
  sm.config.maxConcurrentSessions = 30;
  sm.config.maxCaptchaPerSession = 3;
  sm.config.minSuccessRate = 0.4;

  // Proxy Manager stratejisini değiştir
  const wm = new WebshareProxyManager();
  wm.config.rotationStrategy = 'least_used';
  wm.config.requestsBeforeCooldown = 50;
  wm.config.minTimeBetweenRequests = 1000;

  // Human behavior delay ayarlarını sıkılaştır
  const originalGenerator = HumanBehaviorSimulator.prototype.generateBehaviorPattern;
  HumanBehaviorSimulator.prototype.generateBehaviorPattern = function () {
    return {
      baseDelayMin: 500,
      baseDelayMax: 1500,
      longBreakChance: 0,
      quickActionChance: 0.5,
      mouseMovementChance: 0,
      scrollChance: 0,
      interactionChance: 0,
      readingChance: 0
    };
  };

  // Minimum delay'i düşür
  HumanBehaviorSimulator.prototype.humanDelay = async function () {
    const delay = 500 + Math.random() * 300;
    console.log(`⏩ FAST MODE delay: ${Math.round(delay)}ms`);
    await new Promise(r => setTimeout(r, delay));
  };

  console.log('🚀 Ayarlar uygulandı → maxBrowsers: 10, concurrency: ↑, delay: ↓');
}

module.exports = { enableFastMode };
