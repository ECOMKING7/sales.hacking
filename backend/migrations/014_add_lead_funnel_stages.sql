-- 014_add_lead_funnel_stages.sql
--
-- Voronka to'liq zanjiri uchun: lid → SIFATLI LID → sotuv.
--
-- Ilgari `leads.status` faqat new/in_progress/won/lost edi. "Sifatli lid"
-- tushunchasi yo'q edi, holbuki u asosiy operativ metrika — sifatli lid narxi
-- (CQL) reklamani baholashda CPL'dan ancha ishonchliroq.
--
-- qualified_at  — lid config.crm.etaplar.sifatli guruhidagi etapga YETGAN payt.
--                 Vaqt saqlanadi, bayroq emas: "necha kunda sifatli bo'ldi"
--                 degan savol keyinchalik kerak bo'ladi.
-- lost_at       — yo'qotilgan payt. Deal time va etaplar konversiyasi uchun.
-- crm_stage     — CRM'dagi etapning xom nomi. Diagnostika uchun: raqam
--                 noto'g'ri chiqsa, qaysi etap qanday tasniflanganini ko'rish.
-- is_demo       — DEMO ma'lumot belgisi. Seed skript yaratgan qatorlar shu
--                 bayroq bilan yuriladi va faqat shu bayroq bo'yicha
--                 o'chiriladi — real lid hech qachon tasodifan o'chmasin.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_at      TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_stage    TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_demo      BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Demo tozalash va voronka so'rovlari shu indekslarga tayanadi.
CREATE INDEX IF NOT EXISTS idx_leads_demo        ON leads (workspace_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_touchpoints_demo  ON touchpoints (workspace_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_leads_qualified   ON leads (workspace_id, qualified_at);
CREATE INDEX IF NOT EXISTS idx_leads_last_ad     ON leads (workspace_id, last_click_ad_id);
