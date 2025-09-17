// =====================
// Constants & Configuration
// =====================
const CONFIG = {
  INTERVAL_TIMEOUT: 600000, // 10 minutes
  RETRY_DELAY: 2000,
  TAB_LOAD_TIMEOUT: 20000,
  TARGET_URLS: [
    "https://turuncuhat.thy.com/*",
    "https://auth.thy.com/*"
  ],
  BASE_URL: "https://turuncuhat.thy.com/"
};

// =====================
// State Management
// =====================
let intervalId = null;

// =====================
// Message Handlers
// =====================
const messageHandlers = {
  start: handleStartRequest,
  stop: handleStopRequest,
  getStats: handleGetStatsRequest,
  incrementProcessed: handleIncrementProcessedRequest
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  try {
    const handler = messageHandlers[request.action];
    if (handler) {
      handler(request, sendResponse);
    } else {
      sendResponse({success: false, message: 'Unknown action'});
    }
  } catch (error) {
    console.error('Background script error:', error);
    sendResponse({success: false, message: error.message});
  }
  
  return true; // Always return true to indicate async response
});

function handleStartRequest(request, sendResponse) {
  startHyperFlow();
  sendResponse({success: true, message: 'Auto-run mode started'});
}

function handleStopRequest(request, sendResponse) {
  stopHyperFlow();
  
  // Tüm THY sekmelerine durdurma mesajı gönder
  chrome.tabs.query({ url: CONFIG.TARGET_URLS }, (tabs) => {
    tabs.forEach(tab => {
      sendMessageToTab(tab.id, {action: 'stopAutoRun'});
    });
  });
  
  sendResponse({success: true, message: 'Auto-run mode stopped'});
}

function handleGetStatsRequest(request, sendResponse) {
  chrome.storage.local.get(['processedCount'], (result) => {
    sendResponse({
      processedCount: result.processedCount || 0
    });
  });
}

function handleIncrementProcessedRequest(request, sendResponse) {
  chrome.storage.local.get(['processedCount'], (result) => {
    const newCount = (result.processedCount || 0) + 1;
    chrome.storage.local.set({processedCount: newCount}, () => {
      console.log(`📈 İşlenen PR sayısı güncellendi: ${newCount}`);
      // Popup'a güncelleme mesajı gönder
      sendRuntimeMessage({ action: 'processedUpdate', count: newCount });
    });
  });
  sendResponse({success: true});
}


// =====================
// Utility Functions
// =====================
function sendMessageToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) {
      // Hata varsa sessizce geç
      return;
    }
  });
}

function sendRuntimeMessage(message) {
  try { 
    chrome.runtime.sendMessage(message); 
  } catch (e) {
    // Popup kapalıysa hata verebilir, sessizce geç
  }
}


// =====================
// HyperFlow Management
// =====================
function startHyperFlow() {
  // Önce varsa durdur
  stopHyperFlow();
  
  console.log('🔥 THY HyperFlow başlatılıyor...');
  
  // Interval başlat
  intervalId = setInterval(doHyperFlowTick, CONFIG.INTERVAL_TIMEOUT);
  
  // İlk başlatmada beklemeden bir kez çalıştır
  doHyperFlowTick();
  
  console.log('🔥 TK SmartFlow başlatıldı - 10 dakika güvenlik ağı ile');
}

function stopHyperFlow() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('⏹️ THY HyperFlow durduruldu');
  }
}

// Extension kapatılırken temizle
chrome.runtime.onSuspend.addListener(() => {
  console.log('🛑 Extension kapanıyor - HyperFlow durduruluyor');
  stopHyperFlow();
});

// Service worker yeniden başladığında
chrome.runtime.onStartup.addListener(() => {
  console.log('🚀 Chrome başlangıcında HyperFlow hazırlanıyor');
});

// Extension yüklendiğinde mesaj
chrome.runtime.onInstalled.addListener((details) => {
  console.log('🚀 TK SmartFlow yüklendi ve hazır!');
  console.log('📋 Yükleme detayları:', details);
  
  if (details.reason === 'install') {
    console.log('🎉 İlk kurulum tamamlandı');
  } else if (details.reason === 'update') {
    console.log('🔄 Güncelleme tamamlandı');
  }
});

// =====================
// Tab Management
// =====================
function doHyperFlowTick() {
  console.log('🔄 SmartFlow interval çalışıyor - Aktif sekmeler aranıyor...');
  
  sendRuntimeMessage({ action: 'log', message: `🔄 THY sekmesi aranıyor ve PR kontrolü yapılıyor` });
  
  // Önce son odaklı pencerede ara
  findTabInFocusedWindow()
    .then(tab => {
      if (tab) {
        activateAndRunTab(tab, 'odaklı pencerede');
      } else {
        return findTabInAllWindows();
      }
    })
    .then(tab => {
      if (tab) {
        activateAndRunTab(tab, 'global');
      } else {
        createNewTab();
      }
    })
    .catch(error => {
      console.error('Tab arama hatası:', error);
    });
}

function findTabInFocusedWindow() {
  return new Promise((resolve) => {
    chrome.tabs.query({
      url: CONFIG.TARGET_URLS,
      lastFocusedWindow: true,
      windowType: 'normal',
      discarded: false
    }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0] : null);
    });
  });
}

function findTabInAllWindows() {
  return new Promise((resolve) => {
    chrome.tabs.query({
      url: CONFIG.TARGET_URLS,
      windowType: 'normal',
      discarded: false
    }, (tabs) => {
      console.log(`📊 ${tabs.length} aktif THY sekmesi bulundu (global arama)`);
      resolve(tabs && tabs.length > 0 ? tabs[0] : null);
    });
  });
}

function activateAndRunTab(tab, source) {
  console.log(`🎯 Hedef sekme (${source}): ${tab.url}`);
  sendRuntimeMessage({ action: 'log', message: `🎯 Mevcut THY sekmesi: ${tab.url}` });
  
  chrome.windows.update(tab.windowId, { focused: true });
  chrome.tabs.update(tab.id, { active: true });
  sendRuntimeMessage({ action: 'log', message: '🔎 THY sekmesi öne getirildi' });
  
  sendAutoRunToTab(tab.id);
}

function createNewTab() {
  console.log('⚠️ Aktif THY sekmesi bulunamadı, yeni sekme açılıyor...');
  sendRuntimeMessage({ action: 'log', message: '🆕 Aktif THY sekmesi yok, yeni sekme açılıyor...' });
  
  chrome.tabs.create({ url: CONFIG.BASE_URL, active: true }, (newTab) => {
    if (chrome.runtime.lastError) {
      console.error('Yeni sekme açma hatası:', chrome.runtime.lastError.message);
      sendRuntimeMessage({ action: 'log', message: `❌ Yeni sekme açılamadı: ${chrome.runtime.lastError.message}` });
      return;
    }
    console.log('🆕 Yeni THY sekmesi açıldı');
    sendRuntimeMessage({ action: 'log', message: `✅ Yeni sekme açıldı (id: ${newTab.id})` });
    waitTabCompleteAndRun(newTab.id, CONFIG.TAB_LOAD_TIMEOUT);
  });
}

function sendAutoRunToTab(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'autoRun' }, (response) => {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message || '';
      console.warn('Content script mesaj hatası:', msg);
      
      // Sadece connection kurulamadıysa bir kez daha dene (çoklu tetikleme önleme)
      if (msg.includes('Could not establish connection')) {
        setTimeout(() => {
          retryAutoRunMessage(tabId);
        }, CONFIG.RETRY_DELAY);
      }
    } else {
      console.log('✅ Otomasyon başarıyla tetiklendi:', response);
      sendRuntimeMessage({ action: 'log', message: '✅ Otomasyon tetiklendi' });
    }
  });
}

function retryAutoRunMessage(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'autoRun' }, (retryResponse) => {
    if (chrome.runtime.lastError) {
      console.error('Content script henüz hazır değil:', chrome.runtime.lastError.message);
    } else {
      console.log('✅ Retry başarılı:', retryResponse);
      sendRuntimeMessage({ action: 'log', message: '✅ Otomasyon tetiklendi' });
    }
  });
}

// Belirli bir sekmenin 'complete' olmasını bekleyip ardından autoRun gönderir
function waitTabCompleteAndRun(tabId, timeoutMs = 15000) {
  let done = false;

  const listener = (updatedTabId, changeInfo, tab) => {
    if (updatedTabId === tabId && changeInfo.status === 'complete') {
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      sendRuntimeMessage({ action: 'log', message: '✅ Yeni sekme yüklendi, otomasyon tetikleniyor' });
      sendAutoRunToTab(tabId);
    }
  };

  chrome.tabs.onUpdated.addListener(listener);

  // Zaman aşımı - çifte tetikleme önleme
  setTimeout(() => {
    if (!done) {
      done = true;
      sendRuntimeMessage({ action: 'log', message: '⏱️ Yükleme beklemesi zaman aşımına uğradı, yine de tetikleniyor' });
      chrome.tabs.onUpdated.removeListener(listener);
      sendAutoRunToTab(tabId);
    }
  }, timeoutMs);
}

// =====================
// Event Listeners
// =====================
// Tab güncelleme dinleyicisi - THY sayfaları için content script enjeksiyonu
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (isThyUrl(tab.url)) {
      console.log(`📄 THY sayfası yüklendi: ${tab.url}`);
      
      // Content script'in yüklendiğinden emin ol
      setTimeout(() => {
        checkContentScriptReady(tabId);
      }, 1000);
    }
  }
});

// =====================
// Helper Functions
// =====================
function isThyUrl(url) {
  return url.includes('turuncuhat.thy.com') || url.includes('auth.thy.com');
}

function checkContentScriptReady(tabId) {
  chrome.tabs.sendMessage(tabId, {action: 'ping'}, (response) => {
    if (chrome.runtime.lastError) {
      console.log('📥 Content script henüz hazır değil, yeniden denenecek...');
    } else {
      console.log('✅ Content script hazır');
    }
  });
}

// =====================
// Error Handlers
// =====================
self.addEventListener('error', (event) => {
  console.error('Background script global error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Background script unhandled promise rejection:', event.reason);
});