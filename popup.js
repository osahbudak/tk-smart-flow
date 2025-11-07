// =====================
// TK SmartFlow - Popup Script
// =====================

// =====================
// Constants & Configuration
// =====================
const CONFIG = {
  REFRESH_INTERVAL: 3000, // 3 seconds
  CLOSE_DELAY: 1000, // 1 second
  LOADING_DELAY: 1500, // 1.5 seconds
  MAX_LOG_ENTRIES: 20
};

// =====================
// DOM Elements & State
// =====================
let elements = {};
let state = {
  processed: 0,
  refreshInterval: null
};

document.addEventListener('DOMContentLoaded', function() {
  // Initialize DOM elements
  initializeElements();
  
  // Initialize popup
  initializePopup();
});

// =====================
// Initialization Functions
// =====================
function initializeElements() {
  elements = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    runOnceBtn: document.getElementById('runOnceBtn'),
    skipWaitBtn: document.getElementById('skipWaitBtn'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    statusCard: document.getElementById('statusCard'),
    statusText: document.getElementById('statusText'),
    activityLog: document.getElementById('activityLog'),
    processedCount: document.getElementById('processedCount')
  };
}

function initializePopup() {
  setupEventListeners();
  setupMessageListener();
  startRefreshCycle();
  
  // Initial load
  refreshStats();
  
  // Show initial message
  setTimeout(() => {
    addLog('TK SmartFlow v2.2 hazır - Popup desteği aktif');
  }, 500);
}

// =====================
// Event Listeners
// =====================
function setupEventListeners() {
  elements.startBtn.addEventListener('click', handleStartClick);
  elements.stopBtn.addEventListener('click', handleStopClick);
  elements.runOnceBtn.addEventListener('click', handleRunOnceClick);
  elements.skipWaitBtn.addEventListener('click', handleSkipWaitClick);
  elements.analyzeBtn.addEventListener('click', handleAnalyzeClick);
  elements.processedCount.addEventListener('dblclick', handleStatsReset);
  
  // Cleanup on popup close
  window.addEventListener('beforeunload', cleanup);
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
}

function startRefreshCycle() {
  state.refreshInterval = setInterval(refreshStats, CONFIG.REFRESH_INTERVAL);
}

function cleanup() {
  if (state.refreshInterval) {
    clearInterval(state.refreshInterval);
  }
}
  
// =====================
// Event Handlers
// =====================
function handleStartClick() {
  setButtonLoading(elements.startBtn, 'Başlatılıyor...');
  
  chrome.storage.local.set({isActive: true});
  chrome.runtime.sendMessage({action: 'start'}, function(response) {
    setTimeout(() => {
      updateUI(true);
      addLog('✅ Auto-run modu başlatıldı - 15sn rate limit + sürekli döngü', 'success');
      
      setTimeout(() => {
        window.close();
      }, CONFIG.CLOSE_DELAY);
    }, CONFIG.LOADING_DELAY);
  });
}

function handleStopClick() {
  setButtonLoading(elements.stopBtn, 'Durduruluyor...');
  
  chrome.storage.local.set({isActive: false});
  chrome.runtime.sendMessage({action: 'stop'}, function(response) {
    // Content script'lere de durdurma mesajı gönder
    sendStopMessageToTabs();
    
    setTimeout(() => {
      updateUI(false);
      addLog('⏹️ Auto-run modu durduruldu', 'warning');
      
      setTimeout(() => {
        window.close();
      }, CONFIG.CLOSE_DELAY);
    }, CONFIG.CLOSE_DELAY);
  });
}

function handleStatsReset() {
  state.processed = 0;
  updateStats();
  addLog('İstatistikler sıfırlandı', 'warning');
}

function handleRunOnceClick() {
  console.log('🚀 Run Once button clicked');
  setButtonLoading(elements.runOnceBtn, '🔄 Çalıştırılıyor...');
  
  // THY sekmesine runOnce mesajı gönder
  chrome.tabs.query({url: ["https://turuncuhat.thy.com/*"]}, function(tabs) {
    if (tabs && tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'runOnce'}, function(response) {
        console.log('🚀 Run Once response:', response);
        console.log('🚀 Chrome runtime error:', chrome.runtime.lastError);
        
        setTimeout(() => {
          elements.runOnceBtn.disabled = false;
          elements.runOnceBtn.textContent = '🚀 Tek Seferlik Çalıştır';
          
          if (chrome.runtime.lastError) {
            addLog(`❌ Mesaj gönderilemedi: ${chrome.runtime.lastError.message}`, 'error');
            addLog('💡 Content script henüz hazır değil - THY sayfasını yenileyin', 'warning');
          } else if (response && response.success) {
            addLog('✅ Tek seferlik çalıştırma başlatıldı', 'success');
            if (response.message) {
              addLog(`📝 ${response.message}`, 'info');
            }
          } else if (response && !response.success) {
            addLog(`⚠️ Çalıştırılamadı: ${response.message || 'Bilinmeyen sebep'}`, 'warning');
          } else {
            addLog('⚠️ Content script yanıt vermedi', 'warning');
            addLog('💡 THY sayfasını yenileyin ve tekrar deneyin', 'info');
          }
        }, 1500);
      });
    } else {
      setTimeout(() => {
        elements.runOnceBtn.disabled = false;
        elements.runOnceBtn.textContent = '🚀 Tek Seferlik Çalıştır';
        addLog('❌ THY sekmesi bulunamadı', 'error');
      }, 1000);
    }
  });
}

function handleSkipWaitClick() {
  console.log('⚡ Skip Wait button clicked');
  setButtonLoading(elements.skipWaitBtn, '⚡ Taranıyor...');
  
  // THY sekmesine skipWait mesajı gönder
  chrome.tabs.query({url: ["https://turuncuhat.thy.com/*"]}, function(tabs) {
    if (tabs && tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'skipWait'}, function(response) {
        setTimeout(() => {
          elements.skipWaitBtn.disabled = false;
          elements.skipWaitBtn.textContent = '⚡ Hızlı Tarama';
          addLog('⚡ Hızlı PR taraması başlatıldı', 'success');
        }, 2000);
      });
    } else {
      setTimeout(() => {
        elements.skipWaitBtn.disabled = false;
        elements.skipWaitBtn.textContent = '⚡ Hızlı Tarama';
        addLog('❌ THY sekmesi bulunamadı', 'error');
      }, 1000);
    }
  });
}

function handleAnalyzeClick() {
  console.log('📊 Analyze button clicked');
  setButtonLoading(elements.analyzeBtn, '📊 Analiz ediliyor...');
  
  // THY sekmesine analyze mesajı gönder
  chrome.tabs.query({url: ["https://turuncuhat.thy.com/*"]}, function(tabs) {
    if (tabs && tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'analyze'}, function(response) {
        console.log('📊 Analyze response:', response);
        console.log('📊 Chrome runtime error:', chrome.runtime.lastError);
        
        setTimeout(() => {
          elements.analyzeBtn.disabled = false;
          elements.analyzeBtn.textContent = '📊 Sistem Analizi';
          
          if (chrome.runtime.lastError) {
            addLog(`❌ Mesaj gönderilemedi: ${chrome.runtime.lastError.message}`, 'error');
            addLog('💡 Content script henüz yüklenmemiş olabilir - Sayfayı yenileyin', 'warning');
          } else if (response && response.success && response.data) {
            const data = response.data;
            
            // Başlık
            addLog('📊 === SİSTEM ANALİZİ ===', 'success');
            
            // URL ve sayfa bilgisi
            const urlShort = data.url.length > 50 ? data.url.substring(0, 50) + '...' : data.url;
            addLog(`📍 ${urlShort}`, 'info');
            addLog(`📄 Sayfa: ${data.pageType.toUpperCase()}`, 'info');
            
            // DOM elementi sayıları
            if (data.tableRows > 0 || data.dashboardCards > 0) {
              addLog(`📊 DOM: ${data.tableRows} tablo satırı, ${data.dashboardCards} dashboard kartı`, 'info');
              if (data.prRows !== undefined && data.prRows > 0) {
                addLog(`🎯 PR Bulundu: ${data.prRows} adet PR tespit edildi`, 'success');
              } else if (data.prRows === 0) {
                addLog('🎯 PR Bulunamadı: Tabloda PR kodu yok', 'warning');
              }
            } else {
              addLog('📊 DOM: Tablo/kart elementi bulunamadı', 'warning');
            }
            
            // Sistem durumu
            const statusIcon = data.isRunning ? '🟢' : '🔴';
            const statusText = data.isRunning ? 'ÇALIŞIYOR' : 'BEKLEMEDE';
            addLog(`⚙️ İşlem Durumu: ${statusIcon} ${statusText}`, data.isRunning ? 'success' : 'warning');
            
            const autoIcon = data.autoRunEnabled ? '🟢' : '🔴';
            const autoText = data.autoRunEnabled ? 'AKTİF' : 'DEVRE DIŞI';
            addLog(`🔄 Auto-run: ${autoIcon} ${autoText}`, data.autoRunEnabled ? 'success' : 'warning');
            
            const intervalIcon = data.autoRunInterval ? '🟢' : '🔴';
            const intervalText = data.autoRunInterval ? 'ÇALIŞIYOR' : 'DURMUŞ';
            addLog(`⏱️ Interval: ${intervalIcon} ${intervalText}`, data.autoRunInterval ? 'success' : 'warning');
            
            // Processing lock durumu
            if (data.processingLock !== undefined) {
              const lockIcon = data.processingLock ? '🔒' : '🔓';
              const lockText = data.processingLock ? 'KİLİTLİ' : 'AÇIK';
              addLog(`🔐 PR İşlem Kilidi: ${lockIcon} ${lockText}`, data.processingLock ? 'warning' : 'success');
            }
            
            // Timestamp
            if (data.timestamp) {
              addLog(`🕐 Analiz Zamanı: ${data.timestamp}`, 'info');
            }
            
            // Sonuç özeti
            addLog('✅ Detaylı analiz tamamlandı', 'success');
            
          } else if (response && !response.success) {
            addLog(`❌ Analiz hatası: ${response.message || 'Bilinmeyen hata'}`, 'error');
          } else {
            addLog('⚠️ Content script yanıt vermedi', 'warning');
            addLog('💡 THY sayfasını yenileyin ve tekrar deneyin', 'info');
          }
        }, 1500);
      });
    } else {
      setTimeout(() => {
        elements.analyzeBtn.disabled = false;
        elements.analyzeBtn.textContent = '📊 Sistem Analizi';
        addLog('❌ THY sekmesi bulunamadı - Önce THY sayfasını açın', 'error');
      }, 1000);
    }
  });
}


function handleRuntimeMessage(request, sender, sendResponse) {
  if (request.action === 'processedUpdate' && request.count) {
    state.processed = request.count;
    updateStats();
    console.log(`📈 Popup: İşlenen PR sayısı güncellendi: ${state.processed}`);
  } else if (request.action === 'log' && request.message) {
    addLog(request.message);
  }
  return true;
}

// =====================
// Utility Functions
// =====================
function setButtonLoading(button, text) {
  button.disabled = true;
  button.textContent = text;
}


function sendStopMessageToTabs() {
  chrome.tabs.query({url: ["https://turuncuhat.thy.com/*", "https://auth.thy.com/*"]}, function(tabs) {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {action: 'stopAutoRun'}, function(response) {
        // Hata varsa sessizce geç
        if (chrome.runtime.lastError) return;
      });
    });
  });
}

// =====================
// Data Management
// =====================
function refreshStats() {
  chrome.storage.local.get(['isActive', 'processedCount'], function(result) {
    updateUI(result.isActive || false);
    state.processed = result.processedCount || 0;
    updateStats();
    
    // Background'dan güncel istatistikleri iste
    chrome.runtime.sendMessage({action: 'getStats'}, function(response) {
      if (response && !chrome.runtime.lastError) {
        if (response.processedCount !== undefined) {
          state.processed = response.processedCount;
        }
        updateStats();
      }
    });
  });
}

// =====================
// UI Management
// =====================
function updateUI(isActive) {
  if (isActive) {
    elements.startBtn.style.display = 'none';
    elements.stopBtn.style.display = 'block';
    elements.stopBtn.disabled = false;
    elements.stopBtn.textContent = 'Otomasyonu Durdur';
    elements.statusCard.className = 'status-card active';
    elements.statusText.textContent = 'Otomasyon Aktif';
  } else {
    elements.startBtn.style.display = 'block';
    elements.stopBtn.style.display = 'none';
    elements.startBtn.disabled = false;
    elements.startBtn.textContent = 'Otomasyonu Başlat';
    elements.statusCard.className = 'status-card inactive';
    elements.statusText.textContent = 'Sistem Hazır';
  }
}

function updateStats() {
  elements.processedCount.textContent = state.processed;
  
  // Storage'a kaydet
  chrome.storage.local.set({
    processedCount: state.processed
  });
}

// =====================
// Logging System
// =====================
function addLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const logDiv = document.createElement('div');
  logDiv.className = `log-entry ${type}`;
  logDiv.textContent = `[${time}] ${message}`;
  
  elements.activityLog.appendChild(logDiv);
  elements.activityLog.scrollTop = elements.activityLog.scrollHeight;
  
  // Eski logları temizle
  cleanupOldLogs();
}

function cleanupOldLogs() {
  while (elements.activityLog.children.length > CONFIG.MAX_LOG_ENTRIES) {
    elements.activityLog.removeChild(elements.activityLog.firstChild);
  }
}

function determineLogType(message) {
  const msg = message.toLowerCase();
  
  if (msg.includes('✅') || msg.includes('başarı') || msg.includes('tamam')) {
    return 'success';
  } else if (msg.includes('❌') || msg.includes('hata') || msg.includes('başarısız')) {
    return 'error';
  } else if (msg.includes('⚠️') || msg.includes('uyarı')) {
    return 'warning';
  }
  
  return 'info';
}