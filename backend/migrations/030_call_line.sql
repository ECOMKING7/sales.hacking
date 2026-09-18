-- 030: qo'ng'iroq liniyasi — reklamadan kelgan call'ni organikdan ajratish
--
-- MUAMMO: call maqsadidagi reklama uchun alohida raqam qo'yilgan, lekin
-- o'sha voronkaga reklamadan KELMAGAN qo'ng'iroqlar ham tushadi: eski
-- mijoz, tanish, vizitkadan ko'rgan odam, asosiy ofis raqami. Hozir
-- ularning hammasi reklama hisobiga yoziladi va call kanalining CAC i
-- aslidan YAXSHIROQ ko'rinadi. Bu jimgina xato — hech kim ogohlantirmaydi,
-- shunchaki noto'g'ri qarorga olib keladi (byudjet call'ga ko'chiriladi).
--
-- YECHIM: telefoniya amoCRM'ga "qayerga qo'ng'iroq qilindi" (liniya)
-- raqamini yozadi. Reklama liniyasidan kelgan lid — reklama lidi,
-- qolgani — organik.
--
-- UMUMIY YECHIM (§3.1): maydon nomi ham, raqamning o'zi ham kodda
-- QOTIRILMAYDI. Har mijozda boshqa provayder, boshqa maydon nomi,
-- boshqa raqam. Ikkalasi ham konfiguratsiyada.
--
-- Maydonni topish ham taxminga tayanmaydi (§3.5): liniya raqami
-- telefon shaklida bo'ladi va KAM XIL bo'ladi (100 lidda 1–5 ta noyob
-- qiymat), mijoz raqami esa har lidda boshqa. Shu farq bo'yicha
-- nomzodlar topiladi va odam tanlaydi.

-- Qaysi amoCRM maydoni liniya (qayerga qo'ng'iroq qilindi) raqamini saqlaydi.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_line_field TEXT;

COMMENT ON COLUMN workspaces.amocrm_line_field IS
  'amoCRM custom field ID — qo''ng''iroq liniyasi shu maydonda. discover topadi, odam tanlaydi.';

-- Shu liniyalar REKLAMA liniyalari. Faqat raqamlar (normalizatsiya qilingan).
-- Bo'sh — filtr ishlamaydi, hamma qo'ng'iroq reklama deb hisoblanadi
-- (ya'ni bugungi holat). Bu ataylab: sozlanmagan mijozda xulq o'zgarmaydi.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_ad_lines TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN workspaces.amocrm_ad_lines IS
  'Reklama liniyalari (faqat raqam). Bo''sh bo''lsa filtr qo''llanmaydi.';

-- Lidning liniyasi — normalizatsiya qilingan (faqat raqam).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source_line TEXT;

COMMENT ON COLUMN leads.source_line IS
  'Qo''ng''iroq liniyasi (faqat raqam). NULL — liniya yo''q yoki maydon sozlanmagan.';

CREATE INDEX IF NOT EXISTS idx_leads_source_line
  ON leads (workspace_id, source_line)
  WHERE source_line IS NOT NULL;
