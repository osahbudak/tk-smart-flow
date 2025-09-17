# 🚀 TK SmartFlow - THY PR Otomasyon

THY sistemindeki PR görevlerini otomatik işleyen Chrome extension'ı.

## 🛠️ Kurulum

1. **Chrome Extensions**: `chrome://extensions/` → **Geliştirici modu** açın
2. **Load unpacked**: Proje klasörünü seçin
3. **THY'ye giriş**: `https://turuncuhat.thy.com/` → **Sadece Bir Defa**
4. **Extension'ı başlat**: Toolbar'dan TK SmartFlow → **Otomasyonu Başlat**

## 🎮 Kullanım

### Ana Kontroller
- **Başlat/Durdur**: Otomatik mod (2.5dk döngü)
- **Manuel Kontroller**: Toggle ile açılır

### Hızlı İşlemler
- **▶️ Tek Çalıştır**: Otomasyonsuz tek seferlik
- **⚡ Hızlı Tarama**: Rate limit olmadan
- **📊 Sistem Durumu**: Sayfa ve sistem analizi

### Console (Geliştirici)
```javascript
// Sistem durumunu analiz et
TK_SmartFlow.analyze()

// Tek seferlik çalıştır
TK_SmartFlow.run()

// Auto-run modunu başlat
TK_SmartFlow.startAutoRun()

// Auto-run modunu durdur
TK_SmartFlow.stopAutoRun()

// Rate limit'i atlayarak PR taraması yap
TK_SmartFlow.skipWait()
```

## 🔧 Sorun Giderme

- **Extension çalışmıyor**: `chrome://extensions/` kontrol → Yeniden yükle
- **PR işlenmiyor**: THY login kontrolü → Görev listesi sayfası
- **Debug**: F12 → Console → `[TK SmartFlow]` logları

## ⚙️ Konfigürasyon

```javascript
// background.js
INTERVAL_TIMEOUT: 600000  // 10 dakika

// content.js  
WAIT_TIMEOUT: 150000      // 2.5 dakika
RATE_LIMIT_DELAY: 15000   // 15 saniye
```

---
**TK SmartFlow v2.1** • Turkish Technology
