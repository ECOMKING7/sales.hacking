-- 024: reklama ma'lumoti qaysi davrni qamrayotgani
--
-- Ilgari sync `last_30d` bilan ishlardi: `campaigns.spend` oxirgi 30 kun
-- edi, `leads` jadvali esa butun tarix. Ya'ni ROAS, CPL va CAC ikki xil
-- oynani bo'lardi va buni ekranda hech narsa aytmasdi.
--
-- Endi sync `date_preset=maximum` bilan ishlaydi — akkaunt ochilganidan
-- buyon (Facebook 37 oygacha beradi, undan eskisini API qaytarmaydi).
-- Xarajat ham, natija ham, lid ham, daromad ham bitta oynada.
--
-- Bu ustunlar shu oynaning haqiqiy chegarasi: Facebook'ning o'zi
-- insights javobida `date_start` / `date_stop` bilan aytadi. Taxmin
-- qilinmaydi — akkaunt 2019 da ochilgan bo'lsa ham API 37 oydan
-- narisini bermaydi, va foydalanuvchi buni ko'rib turishi kerak.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS fb_window_start DATE,
  ADD COLUMN IF NOT EXISTS fb_window_end   DATE;

COMMENT ON COLUMN workspaces.fb_window_start IS
  'Reklama ma''lumoti qamragan birinchi kun (FB insights date_start). Taxmin emas — API aytgan sana.';
COMMENT ON COLUMN workspaces.fb_window_end IS
  'Reklama ma''lumoti qamragan oxirgi kun (FB insights date_stop).';
