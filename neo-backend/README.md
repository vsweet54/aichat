# NEO Floating AI - Backend Proxy (Vercel)

Proxy tipis antara APK dan Zapi AI. API key Zapi hanya ada di Environment Variables Vercel, tidak pernah masuk APK.

## Struktur

```
neo-backend/
├── api/chat.js      # serverless function: POST /api/chat
├── vercel.json      # maxDuration 60 detik
├── package.json
├── .env.example
└── .gitignore
```

## Deploy

1. Commit folder ini ke GitHub (repo sendiri, atau subfolder di repo besar).
2. Di Vercel: Add New > Project > import repo. Jika subfolder, set **Root Directory** ke `neo-backend`.
3. Settings > Environment Variables, tambahkan:
   - `ZAPI_API_KEYS` (satu atau banyak key dipisah koma, mis. `key1,key2,key3`)
   - `APP_TOKEN` (string acak panjang)
4. Deploy. Setiap push ke GitHub akan auto-deploy.
5. URL endpoint: `https://NAMA-PROJECT.vercel.app/api/chat`

## Cara pakai

```
POST /api/chat
Header: x-app-token: <APP_TOKEN>
Content-Type: application/json

{
  "model": "chatex",     // opsional, default mulai dari chatex
  "fallback": true,      // opsional, default true
  ...payload Zapi lainnya (mis. messages / prompt)
}
```

Respons sukses:

```
{ "model": "copilot", "data": { ...respons Zapi... }, "tried": ["chatex"] }
```

Respons gagal semua model: HTTP 502 dengan `details` per model.

Urutan fallback: Chatex -> Copilot -> Dolphin -> Felo -> Google AI Mode.

## Konfigurasi di APK

Di `app/build.gradle.kts`:

```kotlin
buildConfigField("String", "BACKEND_URL", "\"https://NAMA-PROJECT.vercel.app/api/chat\"")
buildConfigField("String", "APP_TOKEN", "\"token_yang_sama_dengan_di_vercel\"")
```

Catatan: `APP_TOKEN` di APK bisa diekstrak orang yang membongkar APK. Ini hanya penghalang ringan, bukan keamanan penuh. Pantau pemakaian di dashboard Zapi, dan ganti token jika bocor.

## Batasan Vercel

- Durasi fungsi: diatur 60 detik di `vercel.json`. Batas maksimum tergantung plan Vercel kamu.
- Timeout per model default 9 detik, total budget 55 detik. Ubah lewat env jika perlu.
- Ukuran body request maksimal sekitar 4,5 MB. Kompres/resize gambar di APK sebelum dikirim ke Dolphin.
- Payload yang diteruskan ke Zapi mengikuti dokumentasi Zapi per model. Pastikan nama field (mis. gambar untuk Dolphin) sudah dicek, karena proxy meneruskan body apa adanya.

## Tes lokal (opsional)

```
npm i -g vercel
cp .env.example .env   # isi nilainya
vercel dev
```
