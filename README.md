# DM Asistan CRM

Küçük işletmeler için çok kiracılı (multi-tenant) bir WhatsApp yapay zeka asistanı. İşletmenin WhatsApp numarasına gelen mesajları yanıtlar, sipariş alır, adres ve ödeme (IBAN/dekont) adımlarını yürütür, işletme sahibine bildirim gönderir ve tüm konuşmaları bir yönetim panelinde toplar.

> Durum: Faz 1 geliştirme aşamasında. Veritabanı, n8n akışları ve panel hazır; Meta WhatsApp Cloud API bağlantısı test aşamasındaydı. Ayrıntılı durum: [doc/PROJECT_STATUS.md](doc/PROJECT_STATUS.md).

## Çözdüğü problem

Mesajla sipariş alan işletmeler (manav, toptancı, butik vb.) aynı soruları günde onlarca kez yanıtlıyor, siparişi ve ödeme dekontunu elle takip ediyor. Bu proje ilk karşılamayı, sipariş toplamayı ve ödeme takibini otomatikleştirip işletme sahibine yalnızca onay gereken işleri bırakır.

## Örnek akış

```
Müşteri: "5 kilo domates istiyorum"
  -> yapay zeka niyeti sınıflandırır (sipariş)
  -> sipariş oluşturulur, adres istenir
  -> IBAN gönderilir, dekont beklenir
  -> dekont görseli analiz edilir
  -> işletme sahibine bildirim gider
```

Konuşma durumları: `active` -> `awaiting_address` -> `awaiting_payment` -> `summarized`.

## Özellikler

- Firma bazlı izolasyon: gelen mesajdaki `phone_number_id` ile hangi işletmeye ait olduğu bulunur; tüm tablolarda `firm_id` ve Row Level Security (RLS) vardır.
- n8n iş akışları (`n8n/workflows/`):
  - WF-001 ana mesaj işleyici: webhook doğrulama, firma ve müşteri bulma, konuşma yönetimi, niyet sınıflandırma, yanıt üretme.
  - WF-002 sipariş ve IBAN akışı.
  - WF-003 dekont analizi (görsel).
  - WF-004 hareketsiz konuşmaların özetlenmesi (5 dakikada bir tarar).
  - WF-005 firma sahibine bildirim.
  - WF-006 ödeme hatırlatma (15 dakikada bir gecikmiş siparişleri tarar).
- Yönetim paneli (Next.js): konuşmalar ve konuşma detayı, siparişler, bildirimler, ürün ve SSS yönetimi, ayarlar. Giriş Supabase Auth ile yapılır.
- Ürün kataloğu ve SSS içeriği yapay zekanın sistem istemine eklenir.

## Teknoloji yığını

| Katman | Teknoloji |
| --- | --- |
| Otomasyon | n8n |
| Veritabanı ve kimlik doğrulama | Supabase (PostgreSQL, RLS, Auth) |
| Yapay zeka | OpenAI (sınıflandırma ve yanıt üretimi) |
| Yönetim paneli | Next.js, TypeScript, Tailwind CSS, shadcn/ui |
| Mesajlaşma | Meta WhatsApp Cloud API |

## Proje yapısı

```
dashboard/            Yönetim paneli (Next.js)
n8n/workflows/        n8n iş akışları (JSON) ve ortam kurulum notu
supabase/migrations/  Tablolar, RLS politikaları ve indeksler
doc/                  Proje durumu, ürün gereksinimleri, yol haritası
docs/                 Uygulama planları
```

## Kurulum (özet)

1. Supabase projesi oluşturun ve `supabase/migrations/` altındaki dosyaları numara sırasıyla çalıştırın.
2. n8n'e `n8n/workflows/` altındaki akışları aktarın; gerekli değişkenler için [n8n/workflows/WF-001-env-setup.md](n8n/workflows/WF-001-env-setup.md) dosyasına bakın (Supabase adresi ve servis anahtarı, OpenAI anahtarı vb.). Anahtarları depoya yazmayın.
3. Paneli çalıştırın:

```bash
cd dashboard
npm install
npm run dev
```

Panel için `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` ortam değişkenleri gerekir.

## Notlar

- WF-001 için iki dosya vardır: `WF-001-main-message-handler-fixed.json` n8n sürümüyle uyumlu düzeltilmiş olandır.
- Proje, geliştirme sürecindeki planlar ve notlarla birlikte yayımlanmıştır.
