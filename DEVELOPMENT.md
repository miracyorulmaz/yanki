# Yankı — Development Guide

Projeyi yerel ortamda çalıştırmak için talimatlar.

## Ön Koşullar

- Node.js 20+
- npm 10+

## Kurulum

```bash
npm install
```

## Ortam Değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyalayıp gerekli değerleri doldurun:

```bash
cp .env.example .env.local
```

## Geliştirme

```bash
# Dev server (http://localhost:3000)
npm run dev

# Lint
npm run lint

# Format kontrolü
npm run format:check

# Format uygula
npm run format
```

## Build

```bash
npm run build
npm start
```

## Proje Yapısı

```
app/         Next.js App Router sayfaları ve layout
lib/         Paylaşılan kütüphaneler (Supabase client, AI, jobs, utils)
db/          Veritabanı şeması ve seed verisi
types/       Paylaşılan TypeScript tipleri
public/      Statik dosyalar
```
