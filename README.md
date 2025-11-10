# 🚀 TK SmartFlow - THY PR Otomasyon Sistemi

**v2.4** - Profesyonel PR kayıt işleme otomasyonu. Hibrit açılma desteği (sekme/pencere) ile evrensel uyumluluk sağlar. Özelleştirilebilir ayarlar ve gelişmiş loglama destekli.

---

## ✨ Özellikler

### 🎯 Temel Özellikler

- ✅ **Otomatik PR Tarama**: En yeni 15 PR'ı sıralı şekilde işler
- ✅ **Yeni Pencere Desteği**: Popup'larda açılan PR detaylarını otomatik yakalar
- ✅ **Akıllı Sıralama**: PR'ları oluşturma tarihine göre DESC sıralar
- ✅ **Zaten İşlenmiş Kontrolü**: Duplicate işlemleri önler
- ✅ **10 Dakika Güvenlik Döngüsü**: Background'da sürekli çalışır
- ✅ **Rate Limit Koruması**: 15 saniye bekleme ile güvenli işlem

### 🔥 v2.4 Yeni Özellikler - Hibrit Açılma Desteği

- 🆕 **Yeni Sekme Desteği**: PR'lar yeni sekmede açıldığında da otomatik işler
- 🆕 **Yeni Pencere Desteği**: PR'lar yeni pencerede açıldığında da otomatik işler
- 🆕 **Otomatik Tespit**: Hangi senaryonun kullanıldığını sistem otomatik belirler
- 🆕 **Akıllı Kapama**: Sekmede açıldıysa sekmeyi, pencerede açıldıysa pencereyi kapatır
- 🆕 **Tekrar Kontrol Önleme**: `checkedTabIds` ile performans optimizasyonu
- 🆕 **Evrensel Uyumluluk**: Tüm kullanıcı konfigürasyonlarında çalışır

### 🪟 v2.3 ve Önceki Özellikler

- ✅ **Popup Pencere Yakalama**: `IS_POPUP=1` parametreli pencereler otomatik tespit edilir
- ✅ **Müdahaleye Başla Butonu Otomasyonu**: Popup'ta "Müdahaleye Başla" butonuna otomatik tıklar
- ✅ **Fallback Tab ID Sistemi**: `sender.tab` undefined olsa bile çalışır
- ✅ **10 Deneme Mekanizması**: Yavaş açılan popup'lar için retry sistemi
- ✅ **Özelleştirilebilir Yenileme Aralığı**: Kullanıcı 1-30 dakika arası bekleme süresi ayarlayabilir
- ✅ **Gerçek Zamanlı Dakika Gösterimi**: Girilen saniye değeri anlık olarak dakika formatında gösterilir
- ✅ **PR Kodu Loglama**: Her PR işleminde kod bilgisi loglara eklenir

---

## 🛠️ Kurulum

### 1. Extension Yükleme

```bash
1. Chrome'da: chrome://extensions/
2. "Geliştirici modu" açın (sağ üst toggle)
3. "Paketlenmemiş öğe yükle" → Proje klasörünü seçin
4. Extension yüklendi! ✅
```

### 2. THY'ye İlk Giriş

```bash
1. https://turuncuhat.thy.com/ adresine gidin
2. Kurumsal hesabınızla giriş yapın (tek seferlik)
3. Extension artık hazır!
```

### 3. Otomasyonu Başlatma

```bash
Yöntem 1: Extension popup'ından "Otomasyonu Başlat"
Yöntem 2: Console'da TK_SmartFlow.startAutoRun()
```

---

## 🎮 Kullanım Kılavuzu

### Ana Kontrol Paneli

#### **Otomasyonu Başlat/Durdur**

- **Başlat**: 10 dakikalık döngü başlar, sürekli PR tarar
- **Durdur**: Güvenli şekilde tüm işlemleri durdurur

#### **Hızlı İşlemler**

| Buton                 | Açıklama                             |
| --------------------- | ------------------------------------ |
| 🚀 **Tek Çalıştır**   | Auto-run olmadan tek seferlik tarama |
| ⚡ **Hızlı Tarama**   | Rate limit'siz acil tarama           |
| 📊 **Sistem Analizi** | DOM ve sistem durumu raporu          |

#### **⚙️ Ayarlar**

**Sayfa Yenileme Aralığı**
- Tüm PR'ler işlendikten sonra yeni PR kontrolü için bekleme süresi
- **Minimum**: 60 saniye (1 dakika)
- **Maksimum**: 1800 saniye (30 dakika)
- **Varsayılan**: 300 saniye (5 dakika)
- **Artış**: 15 saniye adımlarla
- Girilen değer otomatik olarak dakika formatında gösterilir (örn: "5 dk 15 sn")

### Console API (Gelişmiş Kullanım)

```javascript
// Sistem durumu analizi
TK_SmartFlow.analyze();
// Çıktı: Sayfa türü, PR sayısı, işlem durumu, auto-run durumu

// Tek seferlik çalıştırma
TK_SmartFlow.run();

// Auto-run modunu başlat
TK_SmartFlow.startAutoRun();

// Auto-run modunu durdur
TK_SmartFlow.stopAutoRun();

// Rate limit'siz hızlı tarama
TK_SmartFlow.skipWait();

// Sıralama testi
TK_SmartFlow.testSort();

// Sıralama debug
TK_SmartFlow.debugSort();
```

---

## 🔄 İş Akışı

```
1. Background (10dk döngü)
   ↓
2. THY sekmesi bulunur/açılır
   ↓
3. Ana sayfa → Görev listesi
   ↓
4. Tablo DESC sıralama (en yeni üstte)
   ↓
5. İlk 15 PR taranır
   ↓
6. Her PR için:
   - PR satırına tıkla
   - Yeni pencere/sekme açılır (IS_POPUP=1)
   - Background otomatik yakalar (sekme veya pencere)
   - "Müdahaleye Başla" butonuna bas
   - Popup açık kalır:
     • Yeni Pencere: Sistem kendisi kapatır
     • Yeni Sekme: Hangi PR'larda müdahaleye başlandığını görmek için açık kalır
   - Sonraki PR'a geç
   ↓
7. 2.5 dakika bekle
   ↓
8. Sayfa yenile ve tekrarla
```

---

## 🔧 Sorun Giderme

### Extension Çalışmıyor

```bash
1. chrome://extensions/ → TK SmartFlow → Yeniden Yükle
2. THY sayfasını yenile (F5)
3. Extension popup'ını aç ve "Otomasyonu Başlat"
```

### PR İşlenmiyor

```bash
1. THY'ye giriş yaptığınızdan emin olun
2. Görev listesi sayfasında olduğunuzdan emin olun
3. F12 → Console → [TK SmartFlow] loglarını kontrol edin
4. Background console'u kontrol edin:
   chrome://extensions/ → "Inspect views: service worker"
```

### Popup Yakalanmıyor

```bash
1. Background console'da şu logları arayın:
   - "🪟 Yeni pencere tespit edildi" (yeni pencere senaryosu)
   - "📑 Yeni sekme tespit edildi" (yeni sekme senaryosu)
   - "✅ THY PR detay popup sekmesi bulundu"

2. Hangi senaryonun kullanıldığını kontrol et:
   - Yeni pencere: "🪟 Popup pencerede 'Müdahaleye Başla' butonu aranıyor..."
   - Yeni sekme: "📑 Popup sekmede 'Müdahaleye Başla' butonu aranıyor..."

3. Eğer "⚠️ 10 denemede THY PR popup bulunamadı" görüyorsan:
   - Popup açılma süresi çok uzun olabilir
   - content.js'te waitFor(25000) değerini artır
```

### Tab ID null Hatası

```bash
1. Background console'da şunu ara:
   "📍 getCurrentTabId request - sender:"

2. Eğer sender.tab undefined ise:
   - Fallback sistemi devreye girer
   - THY sekmelerinden ilki kullanılır

3. Hala null ise:
   - Extension'ı yeniden yükle
   - Chrome'u yeniden başlat
```

---

## ⚙️ Konfigürasyon

### Timing Ayarları

```javascript
// background.js
CONFIG = {
  INTERVAL_TIMEOUT: 600000, // 10 dakika (background döngü)
  RETRY_DELAY: 2000, // 2 saniye (retry bekleme)
  TAB_LOAD_TIMEOUT: 20000, // 20 saniye (sekme yükleme)
};

// content.js
CONFIG = {
  MAX_RECORDS: 15, // Tek seferde işlenecek PR sayısı
  WAIT_TIMEOUT: 150000, // 2.5 dakika (PR işleme sonrası)
  RATE_LIMIT_DELAY: 15000, // 15 saniye (güvenlik bekleme)
  AUTO_RUN_INTERVAL: 45000, // 45 saniye (content kontrol)
  PROCESSING_DELAY: 2000, // 2 saniye (PR arası bekleme)
};
```

### Popup Yakalama Ayarları

```javascript
// background.js - chrome.windows.onCreated
for (let attempt = 0; attempt < 10; attempt++) {
  await waitFor(500); // 500ms x 10 = 5 saniye max
  // IS_POPUP=1 parametresi kontrol edilir
}

// content.js - processSinglePR
await waitFor(25000); // Popup açılma + işlem + kapanma süresi
```

---

## 📊 İstatistikler

- **İşlenen PR Sayısı**: Extension popup'ında görüntülenir
- **Çift tıklama ile sıfırlama**: Sayaç üzerine çift tıkla
- **Storage**: `chrome.storage.local` ile kalıcı

---

## 🐛 Debug Modu

### Content Script Logları (F12 → Console)

```
[TK SmartFlow][11:23:51] 🚀 SmartFlow başlatıldı
[TK SmartFlow][11:23:51] 📍 Sayfa türü: tasks
[TK SmartFlow][11:23:51] ✅ Sıralama işlemi başarılı
[TK SmartFlow][11:23:51] ⚡ 15 PR işlenecek
[TK SmartFlow][11:23:53] 🪟 Popup bekleme modu aktif ediliyor (Tab ID: 123)
[TK SmartFlow][11:23:53] 👆 PR-000762492025 satırına tıklanıyor
```

### Background Script Logları (chrome://extensions/)

```
🪟 Yeni pencere tespit edildi: 1980400997
🔍 Deneme 1: 1 sekme bulundu
📍 Sekme URL'leri: ["https://turuncuhat.thy.com/Edit/SMSS_Problem/77928?IS_POPUP=1..."]
✅ THY PR detay popup sekmesi bulundu (deneme 1): 789
⏳ Sekme 789 yüklenmesi bekleniyor...
✅ Sekme 789 yüklendi
✅ Popup sekmesine mesaj gönderildi
```

---

## 📦 Dosya Yapısı

```
tk-smart-flow/
├── manifest.json              # Extension konfigürasyonu
├── background.js              # Service worker (hibrit pencere/sekme yönetimi)
├── content.js                 # Ana otomasyon mantığı
├── popup.html                 # UI arayüzü
├── popup.js                   # Popup kontrolcüsü
├── icons/
│   └── icon.svg              # Extension ikonu
├── README.md                  # Bu dosya
├── POPUP_FIX_CHANGELOG.md    # v2.3-2.4 teknik detaylar
└── v2.4_UPGRADE_SUMMARY.md   # v2.4 yükseltme özeti
```

---

## 🔐 Güvenlik

- ✅ Sadece `turuncuhat.thy.com` ve `auth.thy.com` erişimi
- ✅ Çift çalışma kilitleri (`isRunning`, `processingPRTasks`)
- ✅ Timeout korumaları (30 saniye max)
- ✅ Rate limit koruması (15 saniye)
- ✅ Hata yakalama ve temizleme

---

## 📝 Versiyon Geçmişi

### v2.4 (Mevcut) - Hibrit Açılma Desteği

- 🔥 **YENİ:** Yeni sekme açılma desteği (`chrome.tabs.onCreated` + `chrome.tabs.onUpdated`)
- 🔥 **YENİ:** Yeni pencere açılma desteği (mevcut `chrome.windows.onCreated`)
- 🔥 **YENİ:** Otomatik senaryo tespiti (`isNewWindow` flag)
- 🔥 **YENİ:** Akıllı kapama sistemi (sekme vs pencere)
- 🔥 **YENİ:** `checkedTabIds` Set ile performans optimizasyonu
- 🔥 **YENİ:** `closeTab` background handler'ı
- ✅ Evrensel uyumluluk - tüm kullanıcılarda çalışır

### v2.3 (Geçmiş) - Özelleştirilebilir Ayarlar ve Popup Desteği

- 🆕 Yeni pencerede açılan PR'ları otomatik yakalama
- 🆕 Popup'ta "Müdahaleye Başla" butonuna otomatik tıklama
- 🆕 Fallback tab ID sistemi
- 🆕 10 deneme mekanizması
- 🐛 sender.tab undefined sorunu çözüldü

### v2.1 - Optimizasyon

- ⚡ Sıralama sistemi iyileştirildi
- ⚡ Rate limit koruması eklendi
- 🐛 Çoklu tetikleme önlendi

### v2.0 - İlk Sürüm

- 🎉 Temel otomasyon sistemi
- 🎉 Auto-run modu
- 🎉 Console API

---

## 🤝 Katkıda Bulunma

Bu proje THY iç kullanımı için geliştirilmiştir. Öneriler için lütfen iletişime geçin.

---

## 📞 Destek

**Sorun mu yaşıyorsun?**

1. Console loglarını kontrol et (F12)
2. Background console'u kontrol et (chrome://extensions/)
3. Extension'ı yeniden yükle
4. Chrome'u yeniden başlat

**Hala çalışmıyor mu?**

- `TK_SmartFlow.analyze()` çıktısını paylaş
- Console loglarını paylaş
- Background console loglarını paylaş

---

**TK SmartFlow v2.4** - Turkish Technology © 2025
_Professional PR Intervention System for THY Operations_
_Hybrid Tab/Window Support - Universal Compatibility_
