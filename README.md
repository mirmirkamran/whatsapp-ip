# Ziyarətçi razılığı və admin paneli

Bu layihə demo başlanğıc sistemidir. Ziyarətçiyə məlumatlandırma pəncərəsi göstərir. Ziyarətçi “Razıyam” seçdikdə brauzer ayrıca konum icazəsi istəyir. Konum yalnız brauzer icazə verərsə saxlanılır. “İmtina edirəm” seçimi konum toplamır. QR şəkli yalnız istifadəçi özü fayl seçdikdə yüklənir.

WhatsApp oxunmamış mesajları, onlayn statusu və zəng tarixçəsi real məlumat deyil; ana səhifədə təsadüfi demo nəticələri göstərilir.

## Başlatmaq

1. Node.js 18 və ya daha yenisini quraşdırın.
2. Layihə qovluğunda terminal açın və `npm install` yazın.
3. `.env.example` faylını `.env` adı ilə kopyalayın.
4. `.env` daxilində `ADMIN_PASSWORD` üçün ən azı 14 simvolluq unikal şifrə, `SESSION_SECRET` üçün ən azı 32 simvolluq təsadüfi mətn yazın.
5. `npm start` yazın.
6. Sayt: `http://localhost:3000`
7. Admin: `http://localhost:3000/admin`

## Vacib yerləşdirmə qeydləri

- Brauzerin Geolocation API funksiyası real saytda HTTPS tələb edir (localhost istisnadır).
- İstehsal serverində HTTPS aktiv edin və `NODE_ENV=production` təyin edin.
- Bu demo Express-in standart yaddaş sessiya deposundan istifadə edir. İstehsal üçün Redis və ya başqa davamlı session store qurun.
- `uploads/` və `data.sqlite` fayllarını ictimai veb qovluğundan kənarda saxlayın; bu layihədə QR faylları yalnız admin sessiyası ilə açılan marşrutdan təqdim olunur.
- Məlumatların saxlanma müddətini, silinmə qaydasını və məxfilik bildirişini real istifadə öncəsi müəyyən edin. Yerli qanunvericiliyə uyğunluq üçün hüquqi məsləhət alın.
- Bu layihə ziyarətçinin IP ünvanını saxlamır. Adminə göstərilən “ünvan” daxil olunan səhifənin URL-idir; konum isə razılıqla alınmış koordinatlardır.
