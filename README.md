# KobiPerTa

KOBİ personel giriş-çıkış takip sistemi.

- **Android uygulama:** GPS + QR ile günlük giriş/çıkış
- **Yönetici web paneli:** kullanıcı tanımları, mesai ayarları, QR, aylık saat raporu, Excel aktarım
- **Backend API:** ortak kurallar ve hesaplamalar

## İş kuralları

1. Gün içinde **birden fazla giriş/çıkış** yapılabilir; **giriş olmadan çıkış** yapılamaz
2. QR ile peş peşe işlemler arasında **en az 5 dakika** olmalıdır
3. Mesai bitişinden sonra **giriş** yapılamaz; **çıkış** yapılabilir (fazla mesai)
4. Giriş/çıkış için GPS (mesai butonları) veya QR+GPS (QR okut)
5. Tüm şirket personeli birbirinin giriş/çıkışını görebilir
6. Yönetici: kullanıcı ekler, mesai aralığı/mola düşümü belirler, eksik çıkış ve saat düzeltir
7. Aylık çalışma saati + fazla mesai hesaplanır; mola düşümü yönetici tercihine bağlıdır
8. Resmi tatil ve izinler eklenebilir; Türkiye resmi tatilleri `date-holidays` ile yıla göre otomatik yüklenebilir
9. **Çıkış unutulursa** ertesi gün sabah **giriş yapılabilir**. Unutulan oturumun çıkışı rapor/Excel'de **boş** kalır; yönetici manuel düzeltir
10. Excel aktarımında her giriş–çıkış çifti ayrı satırda **Excel formülü** ile hesaplanır

## Klasörler

| Klasör | Açıklama |
|--------|----------|
| `backend/` | Express + Prisma + SQLite API |
| `web/` | Next.js yönetici paneli |
| `android/` | Kotlin Jetpack Compose personel uygulaması |

## Hızlı başlangıç

### 1) API

```bash
cd backend
npm install
npx prisma db push
npm run dev
```

API: http://localhost:4000

Varsayılan hesaplar:

- Yönetici: `admin@kobiperta.local` / `admin123`
- Personel: `personel@kobiperta.local` / `personel123`

### 2) Web yönetim

```bash
cd web
npm install
npm run dev
```

Panel: http://localhost:3000

### 3) Android

1. [Android Studio](https://developer.android.com/studio) ile `android/` klasörünü açın
2. SDK kurulumu tamamlanınca uygulamayı çalıştırın
3. Emülatörde API adresi `http://10.0.2.2:4000` (BuildConfig)
4. Gerçek telefonda bilgisayarın LAN IP’sini `android/app/build.gradle.kts` içindeki `API_BASE_URL` alanına yazın

Akış: personel giriş yapar → **Giriş/Çıkış** → ofisteki QR’ı okutur → GPS doğrulanır → kayıt oluşur.

## Notlar

- QR token yaklaşık 60 saniyede bir yenilenir; yönetici panelindeki QR ekranını ofiste gösterin
- GPS koordinatlarını `Mesai & GPS` sayfasından kendi işyerinize göre ayarlayın
- SQLite dosyası: `backend/prisma/dev.db`
