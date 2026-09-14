-- 013_add_result_metrics.sql
--
-- "Cost per lead" bitta maqsadga bog'langan ustun edi. Amalda bitta ad
-- account'da turli maqsaddagi kampaniyalar yonma-yon turadi: lid, sotuv,
-- trafik, xabar, ko'rish. Ularni bitta ustunda solishtirish uchun Facebook
-- "Result" tushunchasini ishlatadi — natija nima ekani kampaniya maqsadidan
-- kelib chiqadi.
--
-- objective       — kampaniya maqsadi (FB'dan keladi, adset/ad uni meros oladi)
-- result_type     — shu qatorda "natija" nima deb hisoblangani ('lead',
--                   'purchase', 'link click', ...). UI shuni yorliq qilib
--                   ko'rsatadi, aks holda raqam nimani anglatishi noma'lum.
-- results         — natijalar soni
-- cost_per_result — spend / results

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS objective       TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS result_type     TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS results         BIGINT NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cost_per_result NUMERIC(14, 4);

ALTER TABLE adsets    ADD COLUMN IF NOT EXISTS objective       TEXT;
ALTER TABLE adsets    ADD COLUMN IF NOT EXISTS result_type     TEXT;
ALTER TABLE adsets    ADD COLUMN IF NOT EXISTS results         BIGINT NOT NULL DEFAULT 0;
ALTER TABLE adsets    ADD COLUMN IF NOT EXISTS cost_per_result NUMERIC(14, 4);

ALTER TABLE ads       ADD COLUMN IF NOT EXISTS objective       TEXT;
ALTER TABLE ads       ADD COLUMN IF NOT EXISTS result_type     TEXT;
ALTER TABLE ads       ADD COLUMN IF NOT EXISTS results         BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ads       ADD COLUMN IF NOT EXISTS cost_per_result NUMERIC(14, 4);
