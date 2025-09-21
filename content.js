// =====================
// TK SmartFlow - Content Script
// =====================

// =====================
// Constants & Configuration
// =====================
const CONFIG = {
  MAX_RECORDS: 50000,
  WAIT_TIMEOUT: 150000, // 2.5 minutes
  RATE_LIMIT_DELAY: 15000, // 15 seconds
  AUTO_RUN_INTERVAL: 45000, // 45 seconds
  INITIAL_DELAY: 3000,
  PROCESSING_DELAY: 2000,
  INTERVENTION_DELAY: 1500,
  PAGE_CHANGE_TIMEOUT: 30000,
  TABLE_LOAD_TIMEOUT: 20000
};

const PAGE_TYPES = {
  LOGIN: 'login',
  HOME: 'home', 
  TASKS: 'tasks',
  DETAIL: 'detail',
  UNKNOWN: 'unknown'
};

const PR_PROCESSED_KEYWORDS = [
  'müdahale edildi', 'tamamlandı', 'kapandı', 'işlemde',
  'başlatıldı', 'atandı', 'çözüldü', 'completed', 'processed'
];

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
const waitFor = (ms) => new Promise(r => setTimeout(r, ms));

function logMessage(msg) {
  LOG(msg);
  try { 
    chrome.runtime.sendMessage({ action: 'log', message: msg });
  } catch(e) {
    // Popup kapalıysa hata verebilir, sessizce geç
  }
}

// =====================
// Initialization
// =====================
if (location.href.includes('turuncuhat.thy.com')) {
  LOG('TK SmartFlow Working Version yüklendi');
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
  analyze: handleAnalyzeRequest
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
    status: 'ready', 
    url: location.href, 
    isRunning: isRunning,
    autoRunEnabled: autoRunEnabled 
  });
  return true;
}

function handleAutoRunRequest(request, sendResponse) {
  if (!autoRunEnabled && !isRunning) {
    autoRunEnabled = true;
    chrome.storage?.local?.set({ autoRunEnabled: true });
    startAutoRun();
    sendResponse({ success: true, message: 'Auto-run modu başlatıldı' });
  } else if (autoRunEnabled && !isRunning) {
    // Zaten aktif ama çalışmıyorsa tek seferlik çalıştır
    runHyperFlow();
    sendResponse({ success: true, message: 'Auto-run zaten aktif, tek seferlik çalıştırma' });
  } else {
    sendResponse({ success: false, message: 'Auto-run zaten aktif ve çalışıyor' });
  }
  return true;
}

function handleStopAutoRunRequest(request, sendResponse) {
  stopAutoRun();
  chrome.storage?.local?.set({ autoRunEnabled: false });
  sendResponse({ success: true, message: 'Auto-run modu durduruldu' });
  return true;
}

function handleRunOnceRequest(request, sendResponse) {
  console.log('📨 Content: runOnce message received');
  
  if (!isRunning) {
    logMessage('🚀 Tek seferlik çalıştırma başlatılıyor');
    
    // Tek seferlik çalıştırma için autoRunEnabled kontrolünü bypass et
    runHyperFlowOnce()
      .then(() => {
        logMessage('✅ Tek seferlik çalıştırma tamamlandı');
        sendResponse({ success: true, message: 'Tek seferlik çalıştırma başarılı' });
      })
      .catch(e => {
        logMessage(`❌ Tek seferlik çalıştırma hatası: ${e.message}`);
        sendResponse({ success: false, message: e.message });
      });
  } else {
    logMessage('⚠️ Zaten çalışıyor, tek seferlik çalıştırma atlandı');
    sendResponse({ success: false, message: 'Sistem zaten çalışıyor' });
  }
  return true;
}

function handleSkipWaitRequest(request, sendResponse) {
  console.log('📨 Content: skipWait message received');
  logMessage('⚡ Rate limit atlanarak PR taraması başlatılıyor');
  
  if (!isRunning) {
    processPRTasks()
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, message: e.message }));
  } else {
    sendResponse({ success: false, message: 'Zaten çalışıyor' });
  }
  return true;
}

function handleAnalyzeRequest(request, sendResponse) {
  console.log('📨 Content: analyze message received');
  
  try {
    // DOM analizi
    const tableRows = document.querySelectorAll('tr').length;
    const dashboardCards = document.querySelectorAll('.dashboard-stat').length;
    const prRows = document.querySelectorAll('tr').length > 0 ? 
      [...document.querySelectorAll('tr')].filter(row => /PR-\d{6,}/gi.test(row.textContent)).length : 0;
    
    const analysisData = {
      url: location.href,
      pageType: detectPageType(),
      dashboardCards: dashboardCards,
      tableRows: tableRows,
      prRows: prRows,
      isRunning: isRunning,
      autoRunEnabled: autoRunEnabled,
      autoRunInterval: !!autoRunInterval,
      timestamp: new Date().toLocaleTimeString('tr-TR'),
      processingLock: !!window.processingPRTasks
    };
    
    console.table(analysisData);
    logMessage(`📊 Sistem analizi: ${analysisData.pageType} sayfası, ${analysisData.tableRows} satır, ${analysisData.prRows} PR`);
    
    sendResponse({ success: true, data: analysisData });
  } catch (error) {
    console.error('📨 Content: analyze error:', error);
    logMessage(`❌ Analiz hatası: ${error.message}`);
    sendResponse({ success: false, message: error.message });
  }
  
  return true;
}

// =====================
// Main Flow Controller
// =====================
async function runHyperFlow() {
  if (isRunning) {
    logMessage('⚠️ Zaten çalışıyor, yeni çalıştırma atlanıyor');
    return;
  }
  
  if (!autoRunEnabled) {
    logMessage('⏹️ Auto-run devre dışı, işlem iptal edildi');
    return;
  }
  
  return await executeHyperFlow();
}

// Tek seferlik çalıştırma için autoRunEnabled kontrolü olmayan versiyon
async function runHyperFlowOnce() {
  if (isRunning) {
    logMessage('⚠️ Zaten çalışıyor, tek seferlik çalıştırma atlanıyor');
    throw new Error('Sistem zaten çalışıyor');
  }
  
  return await executeHyperFlow();
}

// Ana işlem mantığı - hem normal hem tek seferlik için kullanılır
async function executeHyperFlow() {
  
  isRunning = true;
  
  try {
    logMessage('🚀 SmartFlow başlatıldı');
    logMessage(`📍 Mevcut URL: ${location.href}`);
    
    const pageType = detectPageType();
    logMessage(`📍 Sayfa türü: ${pageType}`);
    logMessage(`📊 DOM durumu: ${document.querySelectorAll('tr').length} satır, ${document.querySelectorAll('.dashboard-stat').length} kart`);
    
    await handlePageFlow(pageType);
    logMessage('✅ SmartFlow döngüsü tamamlandı');
    
  } catch (error) {
    logMessage(`❌ Kritik hata: ${error.message}`);
    logMessage(`📍 Hata konumu: ${error.stack?.split('\n')[1] || 'Bilinmiyor'}`);
  } finally {
    isRunning = false;
    logMessage('🔓 İşlem kilidi açıldı');
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
  logMessage('🔐 Login sayfası tespit edildi');
  await handleLogin();
  await waitFor(CONFIG.INITIAL_DELAY);
  logMessage('✅ Login işlemi tamamlandı');
}

async function handleTasksFlow() {
  logMessage('✅ Görev listesi sayfasında, PR taraması başlıyor');
  logMessage(`🔍 Tablo kontrol: ${document.querySelectorAll('tr').length} satır mevcut`);
  await processPRTasks();
  
  if (autoRunEnabled) {
    await waitForNextCycle();
    logMessage('🔄 Sayfa yenileniyor ve yeni döngü başlıyor');
    location.reload();
  } else {
    logMessage('✅ PR tarama tamamlandı (tek seferlik çalıştırma)');
  }
}

async function handleHomeFlow() {
  logMessage('🏠 Ana sayfa tespit edildi, görev kartı navigasyonu başlatılıyor');
  await navigateToTasks();
}

async function handleUnknownPageFlow() {
  logMessage('🔄 Bilinmeyen sayfa tespit edildi, görev kartı navigasyonu başlatılıyor');
  await navigateToTasks();
}

async function waitForNextCycle() {
  logMessage('⏰ PR tarama tamamlandı, 2,5 dakika bekleyip sayfa yenilenecek');
  
  const totalSeconds = CONFIG.WAIT_TIMEOUT / 1000;
  for (let i = totalSeconds; i > 0; i--) {
    // Otomasyon durduruldu mu kontrol et
    if (!autoRunEnabled) {
      logMessage('⏹️ Otomasyon durduruldu, sayfa yenileme iptal edildi');
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
  const content = document.body?.textContent || '';

  // Login sayfası kontrolü
  if (url.includes('auth.thy.com')) {
    return PAGE_TYPES.LOGIN;
  }

  // Detay sayfası kontrolü
  if (content.includes('Müdahaleye Başla')) {
    return PAGE_TYPES.DETAIL;
  }

  // Görev listesi sayfası kontrolü - URL'de search/cmn_work_actvty varsa
  if (url.includes('search/cmn_work_actvty') || url.includes('MyAndGroupActivities')) {
    return PAGE_TYPES.TASKS;
  }

  // Ana sayfa kontrolü
  if (isHomePage(url)) {
    return PAGE_TYPES.HOME;
  }

  // Varsayılan olarak ana sayfa (THY alan adında)
  if (url.includes('turuncuhat.thy.com')) {
    return PAGE_TYPES.HOME;
  }

  return PAGE_TYPES.UNKNOWN;
}

function isHomePage(url) {
  return document.querySelector('.dashboard-stat') ||
         url === 'https://turuncuhat.thy.com/' ||
         url.endsWith('/Default.aspx');
}

// =====================
// Authentication
// =====================
async function handleLogin() {
  logMessage('🔐 Login işlemi');
  
  const loginBtn = findLoginButton();
  if (!loginBtn) {
    logMessage('❌ Login butonu bulunamadı');
    return;
  }

  loginBtn.click();
  
  // Yönlendirme bekle
  const success = await waitForRedirect('turuncuhat.thy.com', 30);
  if (success) {
    logMessage('✅ Login başarılı');
  } else {
    logMessage('❌ Login timeout - yönlendirme beklenen sürede gerçekleşmedi');
  }
}

function findLoginButton() {
  // Önce ID ile ara
  let loginBtn = document.querySelector('#btn_login, button[type="submit"]');
  
  // Bulunamazsa metin ile ara
  if (!loginBtn) {
    loginBtn = [...document.querySelectorAll('button')].find(b => 
      b.textContent.toLowerCase().includes('bağlan')
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
  if (location.href === 'https://turuncuhat.thy.com/') {
    logMessage('🔄 Ana sayfa kök URL tespit edildi, Default.aspx\'e yönlendiriliyor...');
    location.href = 'https://turuncuhat.thy.com/Default.aspx';
    return;
  }
  const isHome = location.href === 'https://turuncuhat.thy.com/' || location.href === 'https://turuncuhat.thy.com/Default.aspx';
  if (!isHome) {
    logMessage('🛑 Şu an ana sayfada değiliz, kart arama yapılmayacak.');
    return;
  }
  logMessage('🎯 Ana sayfadayız, üçüncü col-md-3 kartından link alınıyor...');
  // Tüm col-md-3 kartlarını bul
  const cards = document.querySelectorAll('.col-md-3');
  logMessage(`📊 Bulunan col-md-3 kartları: ${cards.length} adet`);
  // Üçüncü kartı al (index 2)
  if (cards.length >= 3) {
    const thirdCard = cards[2];
    logMessage('✅ Üçüncü kart bulundu');
    // Kart içindeki linki bul
    const link = thirdCard.querySelector('a');
    if (link) {
      logMessage(`🔗 Link bulundu: ${link.href}`);
      logMessage(`📝 Link metni: "${link.textContent?.trim()}"`);
      link.click();
      logMessage('👆 Kart linkine tıklandı');
    } else {
      logMessage('❌ Üçüncü kartta link bulunamadı');
    }
  } else {
    logMessage(`❌ Yeterli kart yok: ${cards.length} adet (en az 3 gerekli)`);
  }
}

async function shouldRedirectToDefault() {
  const isMainUrl = location.href === 'https://turuncuhat.thy.com/' || 
                   location.href.endsWith('turuncuhat.thy.com/');
                   
  if (isMainUrl && !location.href.includes('Default.aspx')) {
    logMessage('🔄 Ana URL tespit edildi, Default.aspx\'e yönlendiriliyor...');
    location.href = 'https://turuncuhat.thy.com/Default.aspx';
    await waitFor(5000);
    return true;
  }
  return false;
}

async function waitForDashboardCards() {
  logMessage('🎯 Dashboard kartları aranıyor...');
  const maxWait = 100;
  
  for (let i = 0; i < maxWait; i++) {
    await waitFor(200);
    const cards = document.querySelectorAll('.dashboard-stat');
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
  logMessage('🎯 Üçüncü col-md-3 kartından link alınıyor...');
  // Tüm col-md-3 kartlarını bul
  const cards = document.querySelectorAll('.col-md-3');
  logMessage(`📊 Bulunan col-md-3 kartları: ${cards.length} adet`);
  // Üçüncü kartı al (index 2)
  if (cards.length >= 3) {
    const thirdCard = cards[2];
    logMessage('✅ Üçüncü kart bulundu');
    // Kart içindeki linki bul
    const link = thirdCard.querySelector('a');
    if (link) {
      logMessage(`🔗 Link bulundu: ${link.href}`);
      logMessage(`📝 Link metni: "${link.textContent?.trim()}"`);
      return link;
    } else {
      logMessage('❌ Üçüncü kartta link bulunamadı');
    }
  } else {
    logMessage(`❌ Yeterli kart yok: ${cards.length} adet (en az 3 gerekli)`);
  }
  return null;
}

async function handleDirectNavigation() {
  logMessage('❌ Görev kartı bulunamadı');
  logMessage('⚠️ Lütfen "Benim ve Grubumun Görevleri" kartını manuel olarak açın');
  
  // Kullanıcıya uyarı göster
  alert('Görev kartı bulunamadı. Lütfen "Benim ve Grubumun Görevleri" kartını manuel olarak açın.');
}

async function navigateToTaskLink(taskLink) {
  logMessage(`🔗 Görev kartına tıklanıyor: ${taskLink.href}`);
  const beforeUrl = location.href;
  taskLink.click();
  logMessage('👆 Kart linkine tıklandı');
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
  logMessage('⏰ Rate limit koruması: 15 saniye bekleniyor...');
  await waitFor(CONFIG.RATE_LIMIT_DELAY);
  logMessage('✅ Bekleme tamamlandı, PR taraması başlıyor');
}

// =====================
// PR Processing
// =====================
async function processPRTasks() {
  // Çift çalışmayı engelle
  if (window.processingPRTasks) {
    logMessage('⚠️ PR tarama zaten devam ediyor, atlanıyor');
    return;
  }
  window.processingPRTasks = true;
  
  try {
    logMessage('🔍 PR görevleri taranıyor...');
    logMessage(`📍 Başlangıç URL: ${location.href}`);
    
    // Tablo yüklenmesini bekle
    await waitForTableLoad();
    
    // PR'ları tara ve analiz et
    const foundPRs = await scanForPRs();
    
    if (foundPRs.length === 0) {
      await handleNoPRsFound();
      return;
    }
    
    // PR'ları işle
    await processFoundPRs(foundPRs);
    
    logMessage('🏁 PR işleme tamamlandı');
    
  } finally {
    window.processingPRTasks = false;
  }
}

async function waitForTableLoad() {
  logMessage('⏳ Tablo yüklenmesi bekleniyor...');
  
  for (let i = 0; i < 40; i++) {
    await waitFor(500);
    const rowCount = document.querySelectorAll('tr').length;
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
  const allRows = document.querySelectorAll('tr');
  logMessage(`📊 Toplam satır sayısı: ${allRows.length}`);
  
  const foundPRs = [];
  const prPattern = /PR-\d{6,}/gi;
  let totalMatches = 0;
  let processedSkipped = 0;
  let hiddenSkipped = 0;
  
  logMessage('🔎 PR satırları taranıyor...');
  
  for (const row of allRows) {
    const text = row.textContent || '';
    const match = text.match(prPattern);
    
    if (match) {
      totalMatches++;
      const prCode = match[0];
      
      if (isPRProcessed(text)) {
        processedSkipped++;
        LOG(`⏭️ ${prCode} zaten işlenmiş, atlanıyor`);
        continue;
      }
      
      const cell = row.querySelector('td') || row;
      if (!isElementVisible(cell)) {
        hiddenSkipped++;
        LOG(`👁️ ${prCode} gizli/görünmez, atlanıyor`);
        continue;
      }
      
      foundPRs.push({
        code: prCode,
        cell: cell,
        text: text.substring(0, 80)
      });
      LOG(`✅ ${prCode} işlenmeye uygun`);
    }
  }
  
  logMessage(`📈 PR Analizi: ${totalMatches} toplam, ${processedSkipped} işlenmiş, ${hiddenSkipped} gizli`);
  logMessage(`✅ İşlenebilir PR: ${foundPRs.length}`);
  
  return foundPRs;
}

function isElementVisible(element) {
  return element && element.offsetParent !== null;
}

async function handleNoPRsFound() {
  logMessage('ℹ️ Hiç işlenebilir PR bulunamadı');
  
  // Debug için ilk 3 satırı göster
  logMessage('🔍 Debug - İlk 3 satır örneği:');
  const allRows = document.querySelectorAll('tr');
  [...allRows].slice(0, 3).forEach((row, i) => {
    const sample = row.textContent?.substring(0, 100) || 'Boş';
    LOG(`Örnek ${i+1}: ${sample}`);
  });
}

async function processFoundPRs(foundPRs) {
  const queue = foundPRs.slice(0, CONFIG.MAX_RECORDS);
  logMessage(`⚡ ${queue.length} PR işlenecek (max: ${CONFIG.MAX_RECORDS})`);

  for (let i = 0; i < queue.length; i++) {
    // Otomasyon durduruldu mu kontrol et
    if (!autoRunEnabled) {
      logMessage('⏹️ Otomasyon durduruldu, PR işleme iptal edildi');
      return;
    }
    const pr = queue[i];
    logMessage(`🎯 İşleniyor: ${i+1}/${queue.length} - ${pr.code}`);

    try {
      await processSinglePR(pr, i, queue.length);
    } catch (error) {
      logMessage(`❌ ${pr.code} işleme hatası: ${error.message}`);
      logMessage(`📍 Hata stack: ${error.stack?.split('\n')[1] || 'Bilinmiyor'}`);
    } finally {
      pr.cell.style.outline = '';
      logMessage(`🧹 ${pr.code} vurgu temizlendi`);
    }

    logMessage(`⏳ ${pr.code} işlemi tamamlandı, 2 saniye bekle`);
    await waitFor(CONFIG.PROCESSING_DELAY);
  }
  // Son bekleme öncesi dur sinyali kontrol et
  if (!autoRunEnabled) {
    logMessage('⏹️ Otomasyon durduruldu, sayfa yenileme atlandı');
    return;
  }
  // Tüm PR'lar tamamlandıktan sonra 2,5 dakika bekle ve sayfayı yenile
  logMessage('✅ Tüm PR\'ler tamamlandı, 2,5 dakika bekleniyor...');
  // Beklemeyi küçük parçalara böl ki dur sinyali kontrol edilebilsin
  const totalWaitTime = CONFIG.WAIT_TIMEOUT;
  const checkInterval = 5000; // Her 5 saniyede kontrol et
  const iterations = Math.ceil(totalWaitTime / checkInterval);
  for (let i = 0; i < iterations; i++) {
    if (!autoRunEnabled) {
      logMessage('⏹️ Otomasyon durduruldu, sayfa yenileme iptal edildi');
      return;
    }
    const waitTime = Math.min(checkInterval, totalWaitTime - (i * checkInterval));
    await waitFor(waitTime);
    // Her 30 saniyede kalan süreyi logla
    const remainingTime = totalWaitTime - ((i + 1) * checkInterval);
    if (remainingTime > 0 && remainingTime % 30000 === 0) {
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      logMessage(`⏳ Sayfa yenileme: ${minutes}dk ${seconds}sn kaldı`);
    }
  }
  // Sayfa yenileme öncesi son kontrol
  if (!autoRunEnabled) {
    logMessage('⏹️ Otomasyon durduruldu, sayfa yenileme iptal edildi');
    return;
  }
  logMessage('🔄 Sayfa yenileniyor...');
  location.reload();
}

async function processSinglePR(pr, index, total) {
  logMessage(`📝 PR metni: ${pr.text}`);
  
  // PR'ı vurgula ve görünüme getir
  await highlightAndScrollToPR(pr);
  
  // PR satırına tıkla
  const beforeUrl = location.href;
  logMessage(`👆 ${pr.code} satırına tıklanıyor`);
  pr.cell.click();
  await waitFor(3000);
  
  // Detay sayfası kontrolü
  const pageChanged = await checkDetailPageNavigation(beforeUrl, pr.code);
  
  if (pageChanged) {
    const success = await handlePRIntervention(pr.code);
  } else {
    logMessage(`❌ ${pr.code} detay sayfası açılamadı - URL değişmedi`);
  }
}

async function highlightAndScrollToPR(pr) {
  logMessage(`🖍️ ${pr.code} vurgulanıyor ve görünüme kaydırılıyor`);
  pr.cell.style.outline = '3px solid #e30613';
  pr.cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await waitFor(2000);
}

async function checkDetailPageNavigation(beforeUrl, prCode) {
  const afterUrl = location.href;
  const pageChanged = afterUrl !== beforeUrl;
  const isDetailPage = detectPageType() === PAGE_TYPES.DETAIL;
  
  logMessage(`📍 URL değişimi: ${pageChanged ? 'Evet' : 'Hayır'}`);
  logMessage(`📍 Detay sayfası: ${isDetailPage ? 'Evet' : 'Hayır'}`);
  logMessage(`📍 Önceki URL: ${beforeUrl}`);
  logMessage(`📍 Sonraki URL: ${afterUrl}`);
  
  return pageChanged || isDetailPage;
}

async function handlePRIntervention(prCode) {
  logMessage(`✅ ${prCode} detay sayfası açıldı, müdahale butonu aranıyor`);
  const success = await clickInterventionButton(prCode);
  
  if (success) {
    logMessage(`✅ ${prCode} müdahale başlatıldı`);
    try {
      chrome.runtime.sendMessage({ action: 'log', message: `✅ PR işlendi: ${prCode}` });
      chrome.runtime.sendMessage({ action: 'incrementProcessed' });
    } catch(e) {
      // Popup kapalıysa hata verebilir
    }
  } else {
    logMessage(`⚠️ ${prCode} müdahale butonu bulunamadı`);
  }
  
  return success;
}

// returnToTaskList ve returnToHome fonksiyonlarını tamamen kaldır

// =====================
// PR Status Checking
// =====================
function isPRProcessed(text) {
  const content = text.toLowerCase();
  return PR_PROCESSED_KEYWORDS.some(keyword => content.includes(keyword));
}

// =====================
// Intervention Button Handling
// =====================
async function clickInterventionButton(prCode) {
  await waitFor(2000);
  logMessage(`🔎 ${prCode} müdahale butonu aranıyor...`);
  
  const interventionButton = findInterventionButton();
  
  if (interventionButton) {
    await clickButton(interventionButton, prCode);
    return true;
  }
  
  logMessage(`❌ ${prCode} müdahale butonu bulunamadı`);
  return false;
}

function findInterventionButton() {
  const buttons = document.querySelectorAll('button');
  
  for (const button of buttons) {
    const text = button.textContent?.toLowerCase() || '';
    const isVisible = button.offsetParent !== null && !button.disabled;
    
    if (isVisible && text.includes('müdahaleye başla')) {
      return button;
    }
  }
  
  return null;
}

async function clickButton(button, prCode) {
  logMessage(`🎯 Müdahale butonu bulundu: ${button.textContent.trim()}`);
  
  button.style.outline = '2px solid #e30613';
  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await waitFor(CONFIG.INTERVENTION_DELAY);
  
  button.click();
  await waitFor(3000);
  
  logMessage(`✅ ${prCode} müdahale başlatıldı`);
}

// =====================
// Navigation Utilities
// =====================
async function returnToHome() {
  logMessage('↩️ Ana sayfaya dönülüyor...');
  
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
      logMessage('✅ Ana sayfaya dönüldü');
      return true;
    }
  } catch {}
  
  return false;
}

async function directNavigateToHome() {
  location.href = 'https://turuncuhat.thy.com/';
  await waitFor(5000);
  logMessage('✅ Ana sayfaya direkt yönlendirme tamamlandı');
}

// =====================
// Console API
// =====================
window.TK_SmartFlow = {
  analyze: () => {
    const info = {
      url: location.href,
      pageType: detectPageType(),
      dashboardCards: document.querySelectorAll('.dashboard-stat').length,
      tableRows: document.querySelectorAll('tr').length,
      isRunning: isRunning,
      autoRunEnabled: autoRunEnabled,
      autoRunInterval: !!autoRunInterval
    };
    console.table(info);
    return info;
  },
  
  run: () => runHyperFlow(),
  
  startAutoRun: () => {
    autoRunEnabled = true;
    chrome.storage?.local?.set({ autoRunEnabled: true });
    startAutoRun();
    logMessage('🔄 Auto-run modu manuel olarak başlatıldı');
  },
  
  stopAutoRun: () => {
    stopAutoRun();
    chrome.storage?.local?.set({ autoRunEnabled: false });
    logMessage('⏹️ Auto-run modu manuel olarak durduruldu');
  },
  
  skipWait: async () => {
    logMessage('⚡ Rate limit atlanarak PR taraması başlatılıyor');
    await processPRTasks();
  }
};

// =====================
// Auto-Run Management
// =====================
function startAutoRun() {
  if (autoRunInterval) {
    clearInterval(autoRunInterval);
  }
  
  logMessage('🔄 Auto-run modu aktif - sürekli döngü başlıyor');
  
  // İlk çalıştırma
  setTimeout(() => {
    if (autoRunEnabled && !isRunning) {
      runHyperFlow();
    }
  }, CONFIG.INITIAL_DELAY);
  
  // Düzenli kontrol
  autoRunInterval = setInterval(() => {
    if (autoRunEnabled && !isRunning && location.href.includes('turuncuhat.thy.com')) {
      logMessage('🔄 Auto-run: Yeni döngü başlatılıyor');
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
    logMessage('⏹️ Çalışan işlem zorla durduruldu');
  }
  // İşleme kilidini temizle
  if (window.processingPRTasks) {
    window.processingPRTasks = false;
    logMessage('⏹️ PR işleme kilidi temizlendi');
  }
  logMessage('⏹️ Auto-run modu tamamen durduruldu');
}

// =====================
// Utility Functions
// =====================
function waitUntilVisible(timeoutMs = 5000) {
  return new Promise(async (resolve) => {
    const started = Date.now();
    while (document.visibilityState !== 'visible' && Date.now() - started < timeoutMs) {
      await waitFor(200);
    }
    resolve();
  });
}

// =====================
// Initialization & Event Listeners
// =====================
LOG('✅ TK SmartFlow Working Version hazır');

// Storage'dan auto-run durumunu al
chrome.storage?.local?.get(['autoRunEnabled'], (result) => {
  if (result.autoRunEnabled) {
    autoRunEnabled = true;
    startAutoRun();
  }
});

// THY sayfasında başlangıç mesajı
if (location.href.includes('turuncuhat.thy.com')) {
  setTimeout(() => {
    logMessage('✅ Sistem hazır - optimizasyon ile');
  }, 1500);
}

// Global hata yakalama
window.addEventListener('error', (e) => {
  logMessage(`Global hata: ${e.error?.message}`);
});