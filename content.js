// =====================
// TK SmartFlow - Content Script
// =====================

// =====================
// Constants & Configuration
// =====================
const CONFIG = {
  MAX_RECORDS: 15, // Sadece 15 PR kontrol et - zaten en güncele göre sıralı
  WAIT_TIMEOUT: 300000, // 5 minutes (default - storage'dan okunacak)
  RATE_LIMIT_DELAY: 15000, // 15 seconds
  AUTO_RUN_INTERVAL: 45000, // 45 seconds
  INITIAL_DELAY: 3000,
  PROCESSING_DELAY: 2000,
  INTERVENTION_DELAY: 1500,
  PAGE_CHANGE_TIMEOUT: 30000,
  TABLE_LOAD_TIMEOUT: 20000,
};

// Dynamic config - storage'dan yüklenir
let dynamicConfig = {
  waitTimeout: CONFIG.WAIT_TIMEOUT,
};

// Storage'dan ayarları yükle
chrome.storage.local.get(["waitTimeout"], (result) => {
  if (result.waitTimeout) {
    dynamicConfig.waitTimeout = result.waitTimeout * 1000; // saniye -> milisaniye
    console.log(
      "⚙️ Sayfa yenileme aralığı storage'dan yüklendi:",
      result.waitTimeout,
      "saniye"
    );
  }
});

// Storage değişikliklerini dinle
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.waitTimeout) {
    dynamicConfig.waitTimeout = changes.waitTimeout.newValue * 1000;
    console.log(
      "⚙️ Sayfa yenileme aralığı güncellendi:",
      changes.waitTimeout.newValue,
      "saniye"
    );
    logMessage(
      `⚙️ Sayfa yenileme aralığı ${changes.waitTimeout.newValue} saniye olarak güncellendi`
    );
  }
});

const PAGE_TYPES = {
  LOGIN: "login",
  HOME: "home",
  TASKS: "tasks",
  DETAIL: "detail",
  UNKNOWN: "unknown",
};

// =====================
// State Management
// =====================
let isRunning = false;
let autoRunEnabled = false;
let autoRunInterval = null;

// =====================
// Utility Functions
// =====================
const now = () => new Date().toISOString().substr(11, 8);
const LOG = (...args) => console.log(`[TK SmartFlow][${now()}]`, ...args);
const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));

function logMessage(msg) {
  LOG(msg);
  try {
    chrome.runtime.sendMessage({ action: "log", message: msg });
  } catch (e) {
    // Popup kapalıysa hata verebilir, sessizce geç
  }
}

async function getCurrentTabId() {
  // Content script'te chrome.tabs API'si yok
  // Background'a mesaj gönderip tab ID'yi alalım
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getCurrentTabId" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "❌ getCurrentTabId hatası:",
          chrome.runtime.lastError.message
        );
        resolve(null);
      } else {
        resolve(response?.tabId || null);
      }
    });
  });
}

// =====================
// Initialization
// =====================
if (location.href.includes("turuncuhat.thy.com")) {
  LOG("TK SmartFlow Working Version yüklendi");
}

// =====================
// Message Handlers
// =====================
const messageHandlers = {
  ping: handlePingRequest,
  autoRun: handleAutoRunRequest,
  stopAutoRun: handleStopAutoRunRequest,
  runOnce: handleRunOnceRequest,
  skipWait: handleSkipWaitRequest,
  analyze: handleAnalyzeRequest,
  clickInterventionButtonInPopup: handleClickInterventionButtonInPopupRequest,
  popupProcessed: handlePopupProcessedRequest,
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = messageHandlers[request.action];
  if (handler) {
    return handler(request, sendResponse);
  }
  return true;
});

function handlePingRequest(request, sendResponse) {
  sendResponse({
    status: "ready",
    url: location.href,
    isRunning: isRunning,
    autoRunEnabled: autoRunEnabled,
  });
  return true;
}

function handleAutoRunRequest(request, sendResponse) {
  if (!autoRunEnabled && !isRunning) {
    autoRunEnabled = true;
    chrome.storage?.local?.set({ autoRunEnabled: true });
    startAutoRun();
    sendResponse({ success: true, message: "Auto-run modu başlatıldı" });
  } else if (autoRunEnabled && !isRunning) {
    // Zaten aktif ama çalışmıyorsa tek seferlik çalıştır
    runHyperFlow();
    sendResponse({
      success: true,
      message: "Auto-run zaten aktif, tek seferlik çalıştırma",
    });
  } else {
    sendResponse({
      success: false,
      message: "Auto-run zaten aktif ve çalışıyor",
    });
  }
  return true;
}

function handleStopAutoRunRequest(request, sendResponse) {
  stopAutoRun();
  chrome.storage?.local?.set({ autoRunEnabled: false });
  sendResponse({ success: true, message: "Auto-run modu durduruldu" });
  return true;
}

function handleRunOnceRequest(request, sendResponse) {
  console.log("📨 Content: runOnce message received");

  if (!isRunning) {
    logMessage("🚀 Tek seferlik çalıştırma başlatılıyor");

    // Tek seferlik çalıştırma için autoRunEnabled kontrolünü bypass et
    runHyperFlowOnce()
      .then(() => {
        logMessage("✅ Tek seferlik çalıştırma tamamlandı");
        sendResponse({
          success: true,
          message: "Tek seferlik çalıştırma başarılı",
        });
      })
      .catch((e) => {
        logMessage(`❌ Tek seferlik çalıştırma hatası: ${e.message}`);
        sendResponse({ success: false, message: e.message });
      });
  } else {
    logMessage("⚠️ Zaten çalışıyor, tek seferlik çalıştırma atlandı");
    sendResponse({ success: false, message: "Sistem zaten çalışıyor" });
  }
  return true;
}

function handleSkipWaitRequest(request, sendResponse) {
  console.log("📨 Content: skipWait message received");
  logMessage("⚡ Rate limit atlanarak PR taraması başlatılıyor");

  if (!isRunning) {
    processPRTasks()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, message: e.message }));
  } else {
    sendResponse({ success: false, message: "Zaten çalışıyor" });
  }
  return true;
}

function handleAnalyzeRequest(request, sendResponse) {
  console.log("📨 Content: analyze message received");

  try {
    // DOM analizi
    const tableRows = document.querySelectorAll("tr").length;
    const dashboardCards = document.querySelectorAll(".dashboard-stat").length;
    const prRows =
      document.querySelectorAll("tr").length > 0
        ? [...document.querySelectorAll("tr")].filter((row) =>
            /PR-\d{6,}/gi.test(row.textContent)
          ).length
        : 0;

    const analysisData = {
      url: location.href,
      pageType: detectPageType(),
      dashboardCards: dashboardCards,
      tableRows: tableRows,
      prRows: prRows,
      isRunning: isRunning,
      autoRunEnabled: autoRunEnabled,
      autoRunInterval: !!autoRunInterval,
      timestamp: new Date().toLocaleTimeString("tr-TR"),
      processingLock: !!window.processingPRTasks,
    };

    console.table(analysisData);
    logMessage(
      `📊 Sistem analizi: ${analysisData.pageType} sayfası, ${analysisData.tableRows} satır, ${analysisData.prRows} PR`
    );

    sendResponse({ success: true, data: analysisData });
  } catch (error) {
    console.error("📨 Content: analyze error:", error);
    logMessage(`❌ Analiz hatası: ${error.message}`);
    sendResponse({ success: false, message: error.message });
  }

  return true;
}

function handleClickInterventionButtonInPopupRequest(request, sendResponse) {
  console.log("🪟 Content: clickInterventionButtonInPopup message received");
  console.log("📍 Popup URL:", location.href);
  console.log("📍 Origin Tab ID:", request.originTabId);
  console.log("📍 Popup Window ID:", request.popupWindowId);
  console.log("📍 PR Kodu:", request.prCode);
  console.log("📍 Yeni Pencere mi:", request.isNewWindow);

  // Popup sayfasında "Müdahaleye Başla" butonunu bul ve tıkla
  (async () => {
    try {
      const windowType = request.isNewWindow ? "pencerede" : "sekmede";
      logMessage(
        `🪟 ${request.prCode} - Popup ${windowType} 'Müdahaleye Başla' butonu aranıyor...`
      );

      // Sayfa tam yüklenene kadar bekle
      await waitFor(3000);

      const success = await clickInterventionButtonInPopup();

      if (success) {
        logMessage(
          `✅ ${request.prCode} - Popup'ta 'Müdahaleye Başla' butonuna basıldı`
        );

        // PR sayacını artır
        chrome.runtime.sendMessage({ action: "incrementProcessed" });

        // Popup'u kapat
        if (request.isNewWindow && request.popupWindowId) {
          // Yeni pencere senaryosu - pencereyi kapat
          logMessage(`🪟 ${request.prCode} - Popup penceresi kapatılıyor...`);
          await waitFor(2000);
          try {
            await chrome.windows.remove(request.popupWindowId);
            logMessage(`✅ ${request.prCode} - Popup penceresi kapatıldı`);
          } catch (e) {
            console.log("⚠️ Popup penceresi zaten kapatılmış olabilir:", e);
          }
        } else {
          // Yeni sekme senaryosu - sekmeyi kapat
          logMessage(`📑 ${request.prCode} - Popup sekmesi kapatılıyor...`);
          await waitFor(2000);
          try {
            // Mevcut sekmeyi kapat (popup sekmesi) - background'a mesaj gönder
            const currentTab = await chrome.runtime.sendMessage({
              action: "getCurrentTabId",
            });
            if (currentTab && currentTab.tabId) {
              const closeResult = await chrome.runtime.sendMessage({
                action: "closeTab",
                tabId: currentTab.tabId,
              });
              if (closeResult && closeResult.success) {
                logMessage(`✅ ${request.prCode} - Popup sekmesi kapatıldı`);
              } else {
                logMessage(`⚠️ ${request.prCode} - Popup sekmesi kapatılamadı`);
              }
            } else {
              logMessage(
                `⚠️ ${request.prCode} - Popup sekmesi kapatılamadı (Tab ID bulunamadı)`
              );
            }
          } catch (e) {
            console.log("⚠️ Popup sekmesi zaten kapatılmış olabilir:", e);
          }
        }

        logMessage(`✅ ${request.prCode} - Popup işlemi tamamlandı`);
        sendResponse({ success: true, message: "Popup işlendi" });
      } else {
        logMessage(
          `❌ ${request.prCode} - Popup'ta 'Müdahaleye Başla' butonu bulunamadı`
        );

        // Başarısız durumda da popup'u kapat
        if (request.isNewWindow && request.popupWindowId) {
          try {
            await chrome.windows.remove(request.popupWindowId);
          } catch (e) {
            // Sessizce geç
          }
        } else {
          try {
            const currentTab = await chrome.runtime.sendMessage({
              action: "getCurrentTabId",
            });
            if (currentTab && currentTab.tabId) {
              await chrome.runtime.sendMessage({
                action: "closeTab",
                tabId: currentTab.tabId,
              });
            }
          } catch (e) {
            // Sessizce geç
          }
        }

        sendResponse({
          success: false,
          message: "Müdahaleye Başla butonu bulunamadı",
        });
      }
    } catch (error) {
      console.error("❌ Popup işleme hatası:", error);
      logMessage(
        `❌ ${request.prCode} - Popup işleme hatası: ${error.message}`
      );

      sendResponse({ success: false, message: error.message });
    }
  })();

  return true; // Async response için
}

function handlePopupProcessedRequest(request, sendResponse) {
  console.log("✅ Popup işlendi mesajı alındı");
  logMessage("✅ PR popup'ta işlendi, devam ediliyor...");
  sendResponse({ success: true });
  return true;
}

// =====================
// Main Flow Controller
// =====================
async function runHyperFlow() {
  if (isRunning) {
    logMessage("⚠️ Zaten çalışıyor, yeni çalıştırma atlanıyor");
    return;
  }

  if (!autoRunEnabled) {
    logMessage("⏹️ Auto-run devre dışı, işlem iptal edildi");
    return;
  }

  return await executeHyperFlow();
}

// Tek seferlik çalıştırma için autoRunEnabled kontrolü olmayan versiyon
async function runHyperFlowOnce() {
  if (isRunning) {
    logMessage("⚠️ Zaten çalışıyor, tek seferlik çalıştırma atlanıyor");
    throw new Error("Sistem zaten çalışıyor");
  }

  return await executeHyperFlow();
}

// Ana işlem mantığı - hem normal hem tek seferlik için kullanılır
async function executeHyperFlow() {
  isRunning = true;

  try {
    logMessage("🚀 SmartFlow başlatıldı");
    logMessage(`📍 Mevcut URL: ${location.href}`);

    const pageType = detectPageType();
    logMessage(`📍 Sayfa türü: ${pageType}`);
    logMessage(
      `📊 DOM durumu: ${document.querySelectorAll("tr").length} satır, ${
        document.querySelectorAll(".dashboard-stat").length
      } kart`
    );

    await handlePageFlow(pageType);
    logMessage("✅ SmartFlow döngüsü tamamlandı");
  } catch (error) {
    logMessage(`❌ Kritik hata: ${error.message}`);
    logMessage(
      `📍 Hata konumu: ${error.stack?.split("\n")[1] || "Bilinmiyor"}`
    );
  } finally {
    isRunning = false;
    logMessage("🔓 İşlem kilidi açıldı");
  }
}

async function handlePageFlow(pageType) {
  switch (pageType) {
    case PAGE_TYPES.LOGIN:
      await handleLoginFlow();
      break;

    case PAGE_TYPES.TASKS:
      await handleTasksFlow();
      break;

    case PAGE_TYPES.HOME:
      await handleHomeFlow();
      break;

    default:
      await handleUnknownPageFlow();
      break;
  }
}

async function handleLoginFlow() {
  logMessage("🔐 Login sayfası tespit edildi - Otomasyon bu sayfada çalışmaz");
  // Login sayfasında hiçbir işlem yapma
  // Kullanıcı manuel login yapmalı
}

async function handleTasksFlow() {
  logMessage("✅ Görev listesi sayfasında, PR taraması başlıyor");
  logMessage(
    `🔍 Tablo kontrol: ${document.querySelectorAll("tr").length} satır mevcut`
  );
  await processPRTasks();

  if (autoRunEnabled) {
    await waitForNextCycle();
    logMessage("🔄 Sayfa yenileniyor ve yeni döngü başlıyor");
    location.reload();
  } else {
    logMessage("✅ PR tarama tamamlandı (tek seferlik çalıştırma)");
  }
}

async function handleHomeFlow() {
  logMessage(
    "🏠 Ana sayfa tespit edildi, görev kartı navigasyonu başlatılıyor"
  );
  await navigateToTasks();
}

async function handleUnknownPageFlow() {
  logMessage(
    "🔄 Bilinmeyen sayfa tespit edildi, görev kartı navigasyonu başlatılıyor"
  );
  await navigateToTasks();
}

async function waitForNextCycle() {
  const totalSeconds = dynamicConfig.waitTimeout / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  let timeText;
  if (seconds === 0) {
    timeText = `${minutes} dakika`;
  } else {
    timeText = `${minutes} dk ${seconds} sn`;
  }

  logMessage(`⏰ PR tarama tamamlandı, ${timeText} bekleyip sayfa yenilenecek`);
  for (let i = totalSeconds; i > 0; i--) {
    // Otomasyon durduruldu mu kontrol et
    if (!autoRunEnabled) {
      logMessage("⏹️ Otomasyon durduruldu, sayfa yenileme iptal edildi");
      return;
    }
    if (i % 30 === 0 || i <= 10) {
      const minutes = Math.floor(i / 60);
      const seconds = i % 60;
      if (minutes > 0) {
        logMessage(`⏳ Sayfa yenileme: ${minutes}dk ${seconds}sn kaldı`);
      } else {
        logMessage(`⏳ Sayfa yenileme: ${seconds} saniye kaldı`);
      }
    }
    await waitFor(1000);
  }
}

// =====================
// Page Detection
// =====================
function detectPageType() {
  const url = location.href;
  const content = document.body?.textContent || "";

  // Login sayfası kontrolü
  if (url.includes("auth.thy.com")) {
    return PAGE_TYPES.LOGIN;
  }

  // Detay sayfası kontrolü
  if (content.includes("Müdahaleye Başla")) {
    return PAGE_TYPES.DETAIL;
  }

  // Görev listesi sayfası kontrolü - URL'de search/cmn_work_actvty varsa
  if (
    url.includes("search/cmn_work_actvty") ||
    url.includes("MyAndGroupActivities")
  ) {
    return PAGE_TYPES.TASKS;
  }

  // Ana sayfa kontrolü
  if (isHomePage(url)) {
    return PAGE_TYPES.HOME;
  }

  // Varsayılan olarak ana sayfa (THY alan adında)
  if (url.includes("turuncuhat.thy.com")) {
    return PAGE_TYPES.HOME;
  }

  return PAGE_TYPES.UNKNOWN;
}

function isHomePage(url) {
  return (
    document.querySelector(".dashboard-stat") ||
    url === "https://turuncuhat.thy.com/" ||
    url.endsWith("/Default.aspx")
  );
}

// =====================
// Authentication
// =====================
async function handleLogin() {
  logMessage("🔐 Login işlemi");

  const loginBtn = findLoginButton();
  if (!loginBtn) {
    logMessage("❌ Login butonu bulunamadı");
    return;
  }

  loginBtn.click();

  // Yönlendirme bekle
  const success = await waitForRedirect("turuncuhat.thy.com", 30);
  if (success) {
    logMessage("✅ Login başarılı");
  } else {
    logMessage("❌ Login timeout - yönlendirme beklenen sürede gerçekleşmedi");
  }
}

function findLoginButton() {
  // Önce ID ile ara
  let loginBtn = document.querySelector('#btn_login, button[type="submit"]');

  // Bulunamazsa metin ile ara
  if (!loginBtn) {
    loginBtn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.toLowerCase().includes("bağlan")
    );
  }

  return loginBtn;
}

async function waitForRedirect(expectedUrl, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await waitFor(500);
    if (location.href.includes(expectedUrl)) {
      return true;
    }
  }
  return false;
}

// =====================
// Task Navigation
// =====================
async function navigateToTasks() {
  if (location.href === "https://turuncuhat.thy.com/") {
    logMessage(
      "🔄 Ana sayfa kök URL tespit edildi, Default.aspx'e yönlendiriliyor..."
    );
    location.href = "https://turuncuhat.thy.com/Default.aspx";
    return;
  }
  const isHome =
    location.href === "https://turuncuhat.thy.com/" ||
    location.href === "https://turuncuhat.thy.com/Default.aspx";
  if (!isHome) {
    logMessage("🛑 Şu an ana sayfada değiliz, kart arama yapılmayacak.");
    return;
  }
  logMessage("🎯 Ana sayfadayız, üçüncü col-md-3 kartından link alınıyor...");
  // Tüm col-md-3 kartlarını bul
  const cards = document.querySelectorAll(".col-md-3");
  logMessage(`📊 Bulunan col-md-3 kartları: ${cards.length} adet`);
  // Üçüncü kartı al (index 2)
  if (cards.length >= 3) {
    const thirdCard = cards[2];
    logMessage("✅ Üçüncü kart bulundu");
    // Kart içindeki linki bul
    const link = thirdCard.querySelector("a");
    if (link) {
      logMessage(`🔗 Link bulundu: ${link.href}`);
      logMessage(`📝 Link metni: "${link.textContent?.trim()}"`);
      link.click();
      logMessage("👆 Kart linkine tıklandı");
    } else {
      logMessage("❌ Üçüncü kartta link bulunamadı");
    }
  } else {
    logMessage(`❌ Yeterli kart yok: ${cards.length} adet (en az 3 gerekli)`);
  }
}

async function shouldRedirectToDefault() {
  const isMainUrl =
    location.href === "https://turuncuhat.thy.com/" ||
    location.href.endsWith("turuncuhat.thy.com/");

  if (isMainUrl && !location.href.includes("Default.aspx")) {
    logMessage("🔄 Ana URL tespit edildi, Default.aspx'e yönlendiriliyor...");
    location.href = "https://turuncuhat.thy.com/Default.aspx";
    await waitFor(5000);
    return true;
  }
  return false;
}

async function waitForDashboardCards() {
  logMessage("🎯 Dashboard kartları aranıyor...");
  const maxWait = 100;

  for (let i = 0; i < maxWait; i++) {
    await waitFor(200);
    const cards = document.querySelectorAll(".dashboard-stat");
    if (cards.length > 0) {
      logMessage(`✅ ${cards.length} dashboard kartı yüklendi`);
      return;
    }
    if (i % 25 === 0) {
      logMessage(`⏳ Kartlar yükleniyor... (${i * 200}ms)`);
    }
  }
}

function findTaskLink() {
  logMessage("🎯 Üçüncü col-md-3 kartından link alınıyor...");
  // Tüm col-md-3 kartlarını bul
  const cards = document.querySelectorAll(".col-md-3");
  logMessage(`📊 Bulunan col-md-3 kartları: ${cards.length} adet`);
  // Üçüncü kartı al (index 2)
  if (cards.length >= 3) {
    const thirdCard = cards[2];
    logMessage("✅ Üçüncü kart bulundu");
    // Kart içindeki linki bul
    const link = thirdCard.querySelector("a");
    if (link) {
      logMessage(`🔗 Link bulundu: ${link.href}`);
      logMessage(`📝 Link metni: "${link.textContent?.trim()}"`);
      return link;
    } else {
      logMessage("❌ Üçüncü kartta link bulunamadı");
    }
  } else {
    logMessage(`❌ Yeterli kart yok: ${cards.length} adet (en az 3 gerekli)`);
  }
  return null;
}

async function handleDirectNavigation() {
  logMessage("❌ Görev kartı bulunamadı");
  logMessage(
    '⚠️ Lütfen "Benim ve Grubumun Görevleri" kartını manuel olarak açın'
  );

  // Kullanıcıya uyarı göster
  alert(
    'Görev kartı bulunamadı. Lütfen "Benim ve Grubumun Görevleri" kartını manuel olarak açın.'
  );
}

async function navigateToTaskLink(taskLink) {
  logMessage(`🔗 Görev kartına tıklanıyor: ${taskLink.href}`);
  const beforeUrl = location.href;
  taskLink.click();
  logMessage("👆 Kart linkine tıklandı");
  // Sayfa değişimini bekle
  await waitForPageChange(beforeUrl);
  // Doğrudan PR taramaya başla
  await processPRTasks();
}

async function waitForPageChange(beforeUrl, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await waitFor(500);
    if (location.href !== beforeUrl || detectPageType() === PAGE_TYPES.TASKS) {
      return true;
    }
  }
  return false;
}

async function waitForRateLimit() {
  logMessage("⏰ Rate limit koruması: 15 saniye bekleniyor...");
  await waitFor(CONFIG.RATE_LIMIT_DELAY);
  logMessage("✅ Bekleme tamamlandı, PR taraması başlıyor");
}

// =====================
// PR Processing
// =====================
async function processPRTasks() {
  // Çift çalışmayı engelle
  if (window.processingPRTasks) {
    logMessage("⚠️ PR tarama zaten devam ediyor, atlanıyor");
    return;
  }
  window.processingPRTasks = true;

  try {
    logMessage("🔍 PR görevleri taranıyor...");
    logMessage(`📍 Başlangıç URL: ${location.href}`);

    // Tablo yüklenmesini bekle
    await waitForTableLoad();

    // Sıralama işlemini garantiye al
    const sorted = await sortByCreatedDateDescending();
    if (!sorted) {
      logMessage(
        "❌ Sıralama işlemi başarısız olduğu için PR işlemeye geçilmiyor."
      );
      return;
    }

    // PR'ları tara ve analiz et
    const foundPRs = await scanForPRs();

    if (foundPRs.length === 0) {
      await handleNoPRsFound();
      return;
    }

    // PR'ları işle
    await processFoundPRs(foundPRs);

    logMessage("🏁 PR işleme tamamlandı");
  } finally {
    window.processingPRTasks = false;
  }
}

async function waitForTableLoad() {
  logMessage("⏳ Tablo yüklenmesi bekleniyor...");

  for (let i = 0; i < 40; i++) {
    await waitFor(500);
    const rowCount = document.querySelectorAll("tr").length;
    if (rowCount >= 5) {
      logMessage(`✅ Tablo yüklendi: ${rowCount} satır`);
      return;
    }
    if (i % 10 === 0 && i > 0) {
      logMessage(`⏳ Tablo bekleme: ${i * 500}ms geçti, ${rowCount} satır`);
    }
  }
}

async function scanForPRs() {
  const allRows = document.querySelectorAll("tr");
  logMessage(`📊 Toplam satır sayısı: ${allRows.length}`);

  const foundPRs = [];
  const prPattern = /PR-\d{6,}/gi;
  let totalMatches = 0;
  let processedSkipped = 0;
  let hiddenSkipped = 0;

  logMessage("🔎 PR satırları taranıyor...");

  for (const row of allRows) {
    const text = row.textContent || "";
    const match = text.match(prPattern);

    if (match) {
      totalMatches++;
      const prCode = match[0];
      const assigned = row.querySelector("td:nth-child(8) span");

      if (assigned && assigned.textContent === "") {
        processedSkipped++;
        LOG(`⏭️ ${prCode} zaten işlenmiş, atlanıyor`);
        continue;
      }

      const cell = row.querySelector("td") || row;
      if (!isElementVisible(cell)) {
        hiddenSkipped++;
        LOG(`👁️ ${prCode} gizli/görünmez, atlanıyor`);
        continue;
      }

      foundPRs.push({
        code: prCode,
        cell: cell,
        text: text.substring(0, 80),
      });
      LOG(`✅ ${prCode} işlenmeye uygun`);
    }
  }

  logMessage(
    `📈 PR Analizi: ${totalMatches} toplam, ${processedSkipped} işlenmiş, ${hiddenSkipped} gizli`
  );
  logMessage(`✅ İşlenebilir PR: ${foundPRs.length}`);

  return foundPRs;
}

function isElementVisible(element) {
  return element && element.offsetParent !== null;
}

async function handleNoPRsFound() {
  logMessage("ℹ️ Hiç işlenebilir PR bulunamadı");

  // Debug için ilk 3 satırı göster
  logMessage("🔍 Debug - İlk 3 satır örneği:");
  const allRows = document.querySelectorAll("tr");
  [...allRows].slice(0, 3).forEach((row, i) => {
    const sample = row.textContent?.substring(0, 100) || "Boş";
    LOG(`Örnek ${i + 1}: ${sample}`);
  });
}

async function processFoundPRs(foundPRs) {
  const queue = foundPRs.slice(0, CONFIG.MAX_RECORDS);
  logMessage(`⚡ ${queue.length} PR işlenecek (max: ${CONFIG.MAX_RECORDS})`);

  for (let i = 0; i < queue.length; i++) {
    // Otomasyon durduruldu mu kontrol et
    if (!autoRunEnabled) {
      logMessage("⏹️ Otomasyon durduruldu, PR işleme iptal edildi");
      return;
    }
    const pr = queue[i];
    logMessage(`🎯 İşleniyor: ${i + 1}/${queue.length} - ${pr.code}`);

    try {
      await processSinglePR(pr, i, queue.length);
    } catch (error) {
      logMessage(`❌ ${pr.code} işleme hatası: ${error.message}`);
      logMessage(
        `📍 Hata stack: ${error.stack?.split("\n")[1] || "Bilinmiyor"}`
      );
    } finally {
      pr.cell.style.outline = "";
      logMessage(`🧹 ${pr.code} vurgu temizlendi`);
    }

    logMessage(`⏳ ${pr.code} işlemi tamamlandı, 2 saniye bekle`);
    await waitFor(CONFIG.PROCESSING_DELAY);
  }
  // Son bekleme öncesi dur sinyali kontrol et
  if (!autoRunEnabled) {
    logMessage("⏹️ Otomasyon durduruldu, sayfa yenileme atlandı");
    return;
  }
  // Tüm PR'lar tamamlandıktan sonra bekle ve sayfayı yenile
  const totalWaitTime = dynamicConfig.waitTimeout;
  const totalSeconds = totalWaitTime / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  let timeText;
  if (seconds === 0) {
    timeText = `${minutes} dakika`;
  } else {
    timeText = `${minutes} dk ${seconds} sn`;
  }

  logMessage(`✅ Tüm PR'ler tamamlandı, ${timeText} bekleniyor...`);
  // Beklemeyi küçük parçalara böl ki dur sinyali kontrol edilebilsin
  const checkInterval = 5000; // Her 5 saniyede kontrol et
  const iterations = Math.ceil(totalWaitTime / checkInterval);
  for (let i = 0; i < iterations; i++) {
    if (!autoRunEnabled) {
      logMessage("⏹️ Otomasyon durduruldu, sayfa yenileme iptal edildi");
      return;
    }
    const waitTime = Math.min(checkInterval, totalWaitTime - i * checkInterval);
    await waitFor(waitTime);
    // Her 30 saniyede kalan süreyi logla
    const remainingTime = totalWaitTime - (i + 1) * checkInterval;
    if (remainingTime > 0 && remainingTime % 30000 === 0) {
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      logMessage(`⏳ Sayfa yenileme: ${minutes}dk ${seconds}sn kaldı`);
    }
  }
  // Sayfa yenileme öncesi son kontrol
  if (!autoRunEnabled) {
    logMessage("⏹️ Otomasyon durduruldu, sayfa yenileme iptal edildi");
    return;
  }
  logMessage("🔄 Sayfa yenileniyor...");
  location.reload();
}

async function processSinglePR(pr, index, total) {
  logMessage(`📝 PR metni: ${pr.text}`);

  // PR'ı vurgula ve görünüme getir
  await highlightAndScrollToPR(pr);

  // Background'a popup bekleme modunu aktif et
  const currentTabId = await getCurrentTabId();
  logMessage(`🪟 Popup bekleme modu aktif ediliyor (Tab ID: ${currentTabId})`);

  try {
    await chrome.runtime.sendMessage({
      action: "waitForPopup",
      originTabId: currentTabId,
      prCode: pr.code,
    });
  } catch (e) {
    console.error("❌ waitForPopup mesajı gönderilemedi:", e);
  }

  // PR satırına tıkla
  logMessage(`👆 ${pr.code} satırına tıklanıyor (yeni pencere/sekme açılacak)`);
  pr.cell.click();

  // Yeni pencere/sekme açılmasını ve işlenmesini bekle
  // Background + popup content script bu işi halledecek
  // Popup otomatik kapanacak
  logMessage(`⏳ ${pr.code} için popup penceresi işleniyor...`);
  await waitFor(30000); // Popup açılma + işlem + otomatik kapanma süresi

  logMessage(`✅ ${pr.code} popup işlemi tamamlandı`);
}

async function highlightAndScrollToPR(pr) {
  logMessage(`🖍️ ${pr.code} vurgulanıyor ve görünüme kaydırılıyor`);
  pr.cell.style.outline = "3px solid #e30613";
  pr.cell.scrollIntoView({ behavior: "smooth", block: "center" });
  await waitFor(2000);
}

// =====================
// Intervention Button Handling
// =====================
function findInterventionButton() {
  const buttons = document.querySelectorAll("button");

  for (const button of buttons) {
    const text = button.textContent?.toLowerCase() || "";
    const isVisible = button.offsetParent !== null && !button.disabled;

    if (isVisible && text.includes("müdahaleye başla")) {
      return button;
    }
  }

  return null;
}

// Popup pencerede müdahaleye başla butonuna basma (yeni pencere için)
async function clickInterventionButtonInPopup() {
  console.log("🪟 Popup'ta 'Müdahaleye Başla' butonu aranıyor...");

  // Birkaç deneme yap (sayfa yavaş yüklenebilir)
  for (let attempt = 0; attempt < 5; attempt++) {
    const button = findInterventionButton();

    if (button) {
      console.log(
        `✅ 'Müdahaleye Başla' butonu bulundu (deneme ${attempt + 1})`
      );
      console.log(`📝 Buton metni: "${button.textContent.trim()}"`);

      // Butona tıkla
      button.style.outline = "3px solid #e30613";
      button.scrollIntoView({ behavior: "smooth", block: "center" });
      await waitFor(1000);

      button.click();
      console.log("✅ 'Müdahaleye Başla' butonuna tıklandı");

      await waitFor(2000);
      return true;
    }

    console.log(
      `⏳ 'Müdahaleye Başla' butonu bulunamadı, bekleniyor... (deneme ${
        attempt + 1
      }/5)`
    );
    await waitFor(2000);
  }

  console.log("❌ 'Müdahaleye Başla' butonu 5 denemede bulunamadı");
  return false;
}

// =====================
// Navigation Utilities
// =====================
async function returnToHome() {
  logMessage("↩️ Ana sayfaya dönülüyor...");

  // Önce history.back() dene
  if (await tryHistoryBack()) {
    return;
  }

  // Direct navigation
  await directNavigateToHome();
}

async function tryHistoryBack() {
  try {
    history.back();
    await waitFor(3000);

    if (detectPageType() === PAGE_TYPES.HOME) {
      logMessage("✅ Ana sayfaya dönüldü");
      return true;
    }
  } catch {}

  return false;
}

async function directNavigateToHome() {
  location.href = "https://turuncuhat.thy.com/";
  await waitFor(5000);
  logMessage("✅ Ana sayfaya direkt yönlendirme tamamlandı");
}

// =====================
// Console API
// =====================
window.TK_SmartFlow = {
  analyze: () => {
    const info = {
      url: location.href,
      pageType: detectPageType(),
      dashboardCards: document.querySelectorAll(".dashboard-stat").length,
      tableRows: document.querySelectorAll("tr").length,
      isRunning: isRunning,
      autoRunEnabled: autoRunEnabled,
      autoRunInterval: !!autoRunInterval,
    };
    console.table(info);
    return info;
  },

  run: () => runHyperFlow(),

  startAutoRun: () => {
    autoRunEnabled = true;
    chrome.storage?.local?.set({ autoRunEnabled: true });
    startAutoRun();
    logMessage("🔄 Auto-run modu manuel olarak başlatıldı");
  },

  stopAutoRun: () => {
    stopAutoRun();
    chrome.storage?.local?.set({ autoRunEnabled: false });
    logMessage("⏹️ Auto-run modu manuel olarak durduruldu");
  },

  skipWait: async () => {
    logMessage("⚡ Rate limit atlanarak PR taraması başlatılıyor");
    await processPRTasks();
  },

  testSort: async () => {
    logMessage("🧪 Sıralama testi başlatılıyor...");
    const result = await sortByCreatedDateDescending();
    logMessage(`🧪 Sıralama test sonucu: ${result ? "BAŞARILI" : "BAŞARISIZ"}`);
    return result;
  },

  debugSort: () => {
    const th = document.querySelector('th[sort="m_created_dt"]');
    if (th) {
      console.log("🔍 Sıralama elementi:", th);
      console.log("🔍 Class:", th.className);
      console.log("🔍 HTML:", th.outerHTML);
      console.log("🔍 İçerik:", th.innerHTML);

      const clickable = th.querySelector("button, a, span") || th;
      console.log("🔍 Tıklanacak element:", clickable);

      return { element: th, clickable: clickable, className: th.className };
    } else {
      console.log("❌ Sıralama elementi bulunamadı");
      return null;
    }
  },
};

// =====================
// Auto-Run Management
// =====================
function startAutoRun() {
  if (autoRunInterval) {
    clearInterval(autoRunInterval);
  }

  logMessage("🔄 Auto-run modu aktif - sürekli döngü başlıyor");

  // İlk çalıştırma
  setTimeout(() => {
    if (autoRunEnabled && !isRunning) {
      runHyperFlow();
    }
  }, CONFIG.INITIAL_DELAY);

  // Düzenli kontrol
  autoRunInterval = setInterval(() => {
    if (
      autoRunEnabled &&
      !isRunning &&
      location.href.includes("turuncuhat.thy.com")
    ) {
      logMessage("🔄 Auto-run: Yeni döngü başlatılıyor");
      runHyperFlow();
    }
  }, CONFIG.AUTO_RUN_INTERVAL);
}

function stopAutoRun() {
  autoRunEnabled = false;
  if (autoRunInterval) {
    clearInterval(autoRunInterval);
    autoRunInterval = null;
  }
  // Çalışan işlemi de durdur
  if (isRunning) {
    isRunning = false;
    logMessage("⏹️ Çalışan işlem zorla durduruldu");
  }
  // İşleme kilidini temizle
  if (window.processingPRTasks) {
    window.processingPRTasks = false;
    logMessage("⏹️ PR işleme kilidi temizlendi");
  }
  logMessage("⏹️ Auto-run modu tamamen durduruldu");
}

// =====================
// Utility Functions
// =====================
function waitUntilVisible(timeoutMs = 5000) {
  return new Promise(async (resolve) => {
    const started = Date.now();
    while (
      document.visibilityState !== "visible" &&
      Date.now() - started < timeoutMs
    ) {
      await waitFor(200);
    }
    resolve();
  });
}

// =====================
// Table Sorting Utility
// =====================
async function sortByCreatedDateDescending(maxAttempts = 3) {
  // Daha uzun bekle - sayfa tam yüklensin
  await waitFor(1000);

  // Element bulma fonksiyonu - her seferinde fresh element bul
  function findCreatedDateElement() {
    return document.querySelector('th[sort="m_created_dt"]');
  }

  let createdDateTh = findCreatedDateElement();
  if (!createdDateTh) {
    logMessage('❌ "Oluşturma Tarihi" başlığı bulunamadı, sıralama atlandı');
    return false;
  }

  logMessage(
    '🔽 Sıralama: "Oluşturma Tarihi" başlığı bulundu, tıklama hazırlığı'
  );

  // HTML yapısını debug et
  function debugElementStructure(element, label) {
    logMessage(`🔍 ${label} HTML: ${element.outerHTML.substring(0, 200)}...`);
    logMessage(`🔍 ${label} className: "${element.className}"`);
    logMessage(
      `🔍 ${label} sortof: "${element.getAttribute("sortof") || "yok"}"`
    );
  }

  debugElementStructure(createdDateTh, "İlk durum");

  let attempt = 0;
  let sorted = false;

  // İlk 3 satırın ID'lerini al (sıralama kontrolü için)
  function getFirstRowsIds() {
    const rows = document.querySelectorAll("tbody tr");
    const ids = [];
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const firstCell = rows[i].querySelector("td");
      if (firstCell) {
        ids.push(firstCell.textContent?.trim() || "");
      }
    }
    return ids.join(",");
  }

  let rowsOrderBefore = getFirstRowsIds();
  logMessage(`🔽 Sıralama öncesi ilk 3 satır: ${rowsOrderBefore}`);

  // Mevcut sıralama durumunu kontrol et - hem class hem sortof attribute'unu kontrol et
  function getCurrentSortState(element) {
    const className = element.className;
    const sortof = element.getAttribute("sortof");

    const isDesc = className.includes("sorting_desc") || sortof === "desc";
    const isAsc = className.includes("sorting_asc") || sortof === "asc";

    return { isDesc, isAsc, className, sortof };
  }

  const currentState = getCurrentSortState(createdDateTh);
  logMessage(
    `🔽 Sıralama durumu: class="${currentState.className}", sortof="${currentState.sortof}"`
  );
  logMessage(
    `🔽 Durum: ${
      currentState.isAsc
        ? "ASC (artan)"
        : currentState.isDesc
        ? "DESC (azalan)"
        : "belirsiz"
    }`
  );

  // Eğer zaten DESC sıralamadaysa, sıralama yapmaya gerek yok
  if (currentState.isDesc) {
    logMessage("✅ Tablo zaten DESC sıralamada, en yeni kayıtlar yukarıda");
    return true;
  }

  while (attempt < maxAttempts && !sorted) {
    logMessage(
      `🔽 Sıralama: "Oluşturma Tarihi" başlığına tıklama (deneme ${
        attempt + 1
      })`
    );

    // Her tıklamada fresh element bul
    createdDateTh = findCreatedDateElement();
    if (!createdDateTh) {
      logMessage("❌ Element kayboldu, sıralama iptal ediliyor");
      break;
    }

    // Tıklanacak elementi bul
    let clickable = createdDateTh.querySelector("button, a, span");
    if (!clickable) clickable = createdDateTh;

    // Tıklama öncesi durumu kaydet
    const beforeState = getCurrentSortState(createdDateTh);
    logMessage(
      `🔽 Tıklama öncesi: class="${beforeState.className}", sortof="${beforeState.sortof}"`
    );

    // Tek tıklama (ASC → DESC için)
    clickable.click();
    logMessage("🔽 Sıralama: Tıklama yapıldı, sıralama işlemi bekleniyor...");

    // Kısa bekle ve hemen HTML değişimini kontrol et
    await waitFor(2000);

    // Fresh element bul - HTML değişmiş olabilir
    let currentElement = findCreatedDateElement();
    if (currentElement) {
      debugElementStructure(
        currentElement,
        `Tıklama sonrası (2sn) - Deneme ${attempt + 1}`
      );
    }

    // Orta bekle ve tekrar kontrol et
    await waitFor(10000);
    currentElement = findCreatedDateElement();
    if (currentElement) {
      debugElementStructure(
        currentElement,
        `Tıklama sonrası (12sn) - Deneme ${attempt + 1}`
      );
    }

    // Tam bekleme süresi
    await waitFor(18000); // Toplam 30 saniye

    // Final element ve durumu kontrol et
    currentElement = findCreatedDateElement();
    if (!currentElement) {
      logMessage("❌ Final element bulunamadı");
      break;
    }

    const afterState = getCurrentSortState(currentElement);
    logMessage(
      `🔽 Sıralama sonrası: class="${afterState.className}", sortof="${afterState.sortof}"`
    );
    logMessage(
      `🔽 Durum: ${
        afterState.isAsc
          ? "ASC (artan)"
          : afterState.isDesc
          ? "DESC (azalan)"
          : "belirsiz"
      }`
    );
    debugElementStructure(
      currentElement,
      `Final durum - Deneme ${attempt + 1}`
    );

    let rowsOrderAfter = getFirstRowsIds();
    logMessage(`🔽 Sıralama sonrası ilk 3 satır: ${rowsOrderAfter}`);

    // DESC sıralamaya geçtiyse başarılı
    if (afterState.isDesc) {
      sorted = true;
      logMessage(
        "✅ Sıralama işlemi başarılı, en yeni kayıtlar yukarıda (DESC sıralama)"
      );
      break;
    }

    // Eğer ASC sıralamaya geçtiyse, bir kez daha tıkla (ASC → DESC)
    if (
      afterState.isAsc &&
      (beforeState.className !== afterState.className ||
        beforeState.sortof !== afterState.sortof)
    ) {
      logMessage("🔄 ASC sıralamaya geçti, DESC için bir kez daha tıklanacak");
      await waitFor(2000);

      // Fresh element bul
      const refreshedTh = findCreatedDateElement();
      if (refreshedTh) {
        let refreshedClickable = refreshedTh.querySelector("button, a, span");
        if (!refreshedClickable) refreshedClickable = refreshedTh;

        logMessage("🔽 İkinci tıklama: ASC → DESC dönüşümü için");
        refreshedClickable.click();

        // İkinci tıklama sonrası bekle
        await waitFor(15000);

        const finalElement = findCreatedDateElement();
        if (finalElement) {
          const finalState = getCurrentSortState(finalElement);

          if (finalState.isDesc) {
            sorted = true;
            logMessage("✅ İkinci tıklama başarılı, DESC sıralamaya geçildi");
            break;
          }
        }
      }
    }

    // Satır sırası değiştiyse de kontrol et
    if (rowsOrderBefore !== rowsOrderAfter) {
      // İlk satırdaki tarihi kontrol et - daha yeni bir tarih mi?
      const firstRowAfter = document.querySelector(
        "tbody tr:first-child td:nth-child(3)"
      );
      if (firstRowAfter) {
        const dateText = firstRowAfter.textContent.trim();
        logMessage(`🔽 İlk satırdaki tarih: ${dateText}`);
        // Eğer 2025 yılından bir tarih varsa büyük ihtimalle yeni kayıtlar üstte
        if (dateText.includes("2025")) {
          sorted = true;
          logMessage(
            "✅ Sıralama işlemi başarılı, yeni tarihli kayıtlar yukarıda"
          );
          break;
        }
      }
    }

    rowsOrderBefore = rowsOrderAfter;
    attempt++;

    if (attempt < maxAttempts) {
      logMessage(
        `⏳ Sıralama henüz DESC olmadı, ${
          attempt + 1
        }. deneme için 5 saniye bekleniyor...`
      );
      await waitFor(5000);

      // Element referansını yenile - HTML değişmiş olabilir
      const newCreatedDateTh = findCreatedDateElement();
      if (newCreatedDateTh) {
        logMessage("🔄 Element referansı yenilendi");
        debugElementStructure(newCreatedDateTh, "Yenilenen element");
      } else {
        logMessage("❌ Element artık bulunamıyor, döngü sonlandırılıyor");
        break;
      }
    }
  }

  if (!sorted) {
    logMessage("❌ Sıralama işlemi başarısız, satır sırası değişmedi");
    logMessage(
      "🔍 Debug: Tablo interaktif olmayabilir, sıralama fonksiyonu çalışmıyor olabilir"
    );
  }

  return sorted;
}

// =====================
// Initialization & Event Listeners
// =====================
LOG("✅ TK SmartFlow Working Version hazır");

// Storage'dan auto-run durumunu al
chrome.storage?.local?.get(["autoRunEnabled"], (result) => {
  if (result.autoRunEnabled) {
    autoRunEnabled = true;
    startAutoRun();
  }
});

// THY sayfasında başlangıç mesajı
if (location.href.includes("turuncuhat.thy.com")) {
  setTimeout(() => {
    logMessage("✅ Sistem hazır - optimizasyon ile");
  }, 1500);
}

// Global hata yakalama
window.addEventListener("error", (e) => {
  logMessage(`Global hata: ${e.error?.message}`);
});
