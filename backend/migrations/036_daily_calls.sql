-- 036: kunlik jadvalga QO'NG'IROQ ustuni
--
-- NEGA: `results` ("natija") kampaniya maqsadiga qarab o'zgaradi — lid,
-- qo'ng'iroq yoki sotuv. Kunlik jadvalda faqat lid va sotuv bor edi,
-- shuning uchun qo'ng'iroq kampaniyalarida sana tanlansa "natija"
-- ustuni bo'sh qolardi.
--
-- Bu FurniGlass uchun muhim: eng ko'p pul sarflanayotgan kampaniya —
-- "Tof - Sales call" — aynan qo'ng'iroqqa optimizatsiya qilingan.
-- Ya'ni eng qimmat kampaniyaning natijasi ko'rinmasdi.

ALTER TABLE ad_insights_daily
  ADD COLUMN IF NOT EXISTS calls_count BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN ad_insights_daily.calls_count IS
  'Qo''ng''iroq hodisalari (click_to_call_native_call_placed / flow_complete). Qo''ng''iroq maqsadidagi kampaniyalarda "natija" shu.';
