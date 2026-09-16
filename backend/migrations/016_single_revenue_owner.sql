-- 016_single_revenue_owner.sql
--
-- `ads.revenue` ustuniga IKKI EGASI bor edi:
--   • atribusiya dvigateli — o'sish yozardi:  revenue = revenue + delta
--   • Facebook sync        — qayta yozardi:   revenue = EXCLUDED.revenue
--
-- Qanday buzilardi:
--   10:00  Lid A yutildi $300  → revenue = 300
--   10:20  Lid B yutildi $200  → revenue = 500        ✅
--   10:30  Sync, FB "$0" dedi  → revenue = 0          ← ikkalasi ham o'chdi
--   11:00  Lid A qayta hisob   → reverse 0−300 → GREATEST(...,0) → 0
--                              → apply  0+300        → 300
--   Haqiqat $500, ekranda $300. Lid B izsiz yo'qoldi, log toza.
--
-- GREATEST(..., 0) aynan shu yerda zarar keltirardi: manfiy natijani nolga
-- qisib, muammoni YASHIRARDI. Usiz raqam −300 bo'lardi — xunuk, lekin darhol
-- ko'rinardi.
--
-- YECHIM: har ustunning bitta egasi bo'ladi.
--   revenue, purchases_count, roas  → FAQAT atribusiya dvigateli (CRM haqiqati)
--   fb_revenue, fb_purchases        → FAQAT Facebook sync (piksel nima ko'rgan)
--
-- Yon foyda: ikkita raqam yonma-yon turgani uchun yangi tafovut metrikasi
-- chiqadi — "FB $1 240 dedi, CRM $980 ko'rdi". Bu lid tafovutining daromad
-- versiyasi (§7).

-- ---------- Facebook'ning O'Z raqamlari uchun alohida ustunlar ----------
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS fb_revenue   NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS fb_purchases BIGINT         NOT NULL DEFAULT 0;

ALTER TABLE adsets    ADD COLUMN IF NOT EXISTS fb_revenue   NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE adsets    ADD COLUMN IF NOT EXISTS fb_purchases BIGINT         NOT NULL DEFAULT 0;

ALTER TABLE ads       ADD COLUMN IF NOT EXISTS fb_revenue   NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE ads       ADD COLUMN IF NOT EXISTS fb_purchases BIGINT         NOT NULL DEFAULT 0;

-- Sync ilgari yozgan FB daromadi `revenue` da turibdi. Uni o'z joyiga
-- ko'chiramiz, keyin `revenue` ni nolga qaytaramiz — undan keyin uni faqat
-- dvigatel to'ldiradi (lidlardan qayta hisoblab).
UPDATE campaigns SET fb_revenue = revenue, fb_purchases = purchases_count WHERE revenue <> 0;
UPDATE adsets    SET fb_revenue = revenue, fb_purchases = purchases_count WHERE revenue <> 0;
UPDATE ads       SET fb_revenue = revenue, fb_purchases = purchases_count WHERE revenue <> 0;

-- ---------- ulushli sotuv uchun kasr ----------
-- Multi-touch modelda bitta sotuv reklamalar orasida bo'linadi (0.57 ta sotuv).
-- INTEGER bo'lsa u jimgina yaxlitlanadi va jami noto'g'ri chiqadi.
-- Hozirgi standart model last-click, ya'ni qiymat baribir butun bo'ladi —
-- lekin ustun turi keyin modelni almashtirishga to'sqinlik qilmasin.
ALTER TABLE campaigns ALTER COLUMN purchases_count TYPE NUMERIC(14, 4);
ALTER TABLE adsets    ALTER COLUMN purchases_count TYPE NUMERIC(14, 4);
ALTER TABLE ads       ALTER COLUMN purchases_count TYPE NUMERIC(14, 4);

-- Qayta hisoblash lidlarni reklama bo'yicha yig'adi — indeks shart.
CREATE INDEX IF NOT EXISTS idx_touchpoints_ad_weight
  ON touchpoints (workspace_id, ad_id)
  WHERE attribution_weight IS NOT NULL;
