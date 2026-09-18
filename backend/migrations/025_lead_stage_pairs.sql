-- 025: "lid" etaplari — voronkaning birinchi bosqichi
--
-- Yo'riqnoma §3.3 da etaplar uchta emas, TO'RTTA guruh:
--   yangi (lid) · sifatli · yutildi · yutqazildi
-- Kodda esa faqat sifatli va yutildi bor edi. "Yangi" etap
-- belgilanmagani uchun import qilingan lid darhol 'in_progress'
-- bo'lib tushardi — ya'ni voronkaning birinchi bosqichi bo'sh
-- ko'rinardi va "qotgan lid" hisobi ham ishlamasdi.
--
-- Shakl boshqalari bilan bir xil: '<voronka>:<etap>'. Sabab o'sha:
-- amoCRM'da etap ID lari voronkalar bo'ylab takrorlanadi, shuning
-- uchun voronkasiz etap ID si hech narsani anglatmaydi.
--
-- Bo'sh qoldirilsa xatti-harakat o'zgarmaydi: sotuv/yutqazish
-- ro'yxatiga tushmagan lid 'in_progress' bo'lib qolaveradi.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_lead_pairs TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN workspaces.amocrm_lead_pairs IS
  'Voronkaning birinchi (lid) etaplari, ''<voronka>:<etap>'' juftliklari. Bo''sh — belgilanmagan.';
