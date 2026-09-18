-- 029: Meta Lead ID — CAPI uchun eng kuchli moslik kaliti
--
-- MUAMMO: Meta'ga CRM hodisasi yuborilganda "bu qaysi odam?" savoliga
-- javob kerak. Bizda hozir uch kalit bor: fbc (fbclid dan), ph, em.
-- Birinchisi piksel/UTM talab qiladi — real akkauntda u 0/100.
-- Qolgan ikkitasi zaifroq (Meta o'z bazasida topa olmasligi mumkin).
--
-- Meta hujjati (Conversions API for CRM) aniq aytadi: lid reklamasi
-- (Instant Form) orqali kelgan lid uchun 15–17 xonali Meta Lead ID
-- saqlanishi va har hodisada yuborilishi kerak. U bilan moslik piksel
-- ham, UTM ham, fbclid ham bo'lmasa ishlaydi.
--
-- UMUMIY YECHIM (§3.1): maydon nomi kodda QOTIRILMAYDI. Har amoCRM
-- akkauntida u boshqacha atalgan bo'lishi mumkin ("Facebook Lead ID",
-- "lead_id", "Идентификатор лида", o'zbekcha nom). Shuning uchun
-- konfiguratsiyada maydon ID si turadi, kod esa uni o'qiydi xolos.
-- Maydon ID si taxmin qilinmaydi — `discoverLeadFields` API dan
-- o'qib nomzodlarni ko'rsatadi, tanlovni odam qiladi (§3.5).

-- Qaysi amoCRM maydoni Meta Lead ID ni saqlaydi (amoCRM field_id, matn).
-- NULL — sozlanmagan: CAPI eski kalitlar bilan ishlayveradi.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_lead_id_field TEXT;

COMMENT ON COLUMN workspaces.amocrm_lead_id_field IS
  'amoCRM custom field ID — Meta Lead ID shu maydonda. discover orqali topiladi, taxmin qilinmaydi.';

-- Lidning Meta Lead ID si. Matn: 15–17 xonali son bigint'ga sig'adi,
-- lekin raqam sifatida ishlatmaymiz — faqat uzatamiz, shuning uchun
-- matn xavfsizroq (boshidagi nol, kelajakdagi format o'zgarishi).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS fb_lead_id TEXT;

COMMENT ON COLUMN leads.fb_lead_id IS
  'Meta Lead ID (15–17 xonali). CAPI da user_data.lead_id sifatida ketadi.';

-- Diagnostika uchun: "nechta lidda Meta Lead ID bor" so'rovi tez bo'lsin.
CREATE INDEX IF NOT EXISTS idx_leads_fb_lead_id
  ON leads (workspace_id)
  WHERE fb_lead_id IS NOT NULL;
