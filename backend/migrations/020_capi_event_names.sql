-- 020: CAPI hodisa nomlari konfiguratsiyaga
--
-- MUAMMO
-- metaCapi.ts da nomlar kodga qotirilgan edi: 'Lead', 'QualifiedLead',
-- 'Purchase'. Bu §3.1 ni buzadi — har mijozning voronkasi boshqa va
-- Meta'da hodisa turi natijaga jiddiy ta'sir qiladi:
--
--   • Standart hodisa (Lead, Purchase, Schedule, Contact,
--     SubmitApplication, CompleteRegistration) — Ads Manager'da
--     darhol ko'rinadi va optimizatsiya maqsadi qilib tanlanadi.
--   • Custom hodisa ('QualifiedLead') — Meta'ga yetib boradi, lekin
--     ishlatish uchun avval Custom Conversion yasash kerak. Aks holda
--     hodisa kelib turadi-yu, hech qanday foyda bermaydi.
--
-- Shuning uchun standart nom uchta bosqichga sozlanadi. Sifatli lid
-- uchun standart qiymat 'Schedule': "uchrashuv belgilandi / uchrashuvga
-- keldi" ma'nosiga eng yaqin standart hodisa. Mijozga mos kelmasa —
-- Settings'dan o'zgartiriladi, kodga tegilmaydi.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS capi_event_lead TEXT NOT NULL DEFAULT 'Lead';

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS capi_event_qualified TEXT NOT NULL DEFAULT 'Schedule';

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS capi_event_purchase TEXT NOT NULL DEFAULT 'Purchase';

-- capi_events.event_name allaqachon TEXT — sxema o'zgarishi kerak emas.
-- Dedup kaliti (workspace_id, event_id, event_name) bo'yicha: nom
-- o'zgarsa yangi juftlik paydo bo'ladi, ya'ni eski hodisa qayta
-- yuborilmaydi va yangi nom bilan bir marta ketadi. Bu ataylab shunday:
-- nom o'zgartirish — yangi signal, uni Meta'ga bir marta bildirish kerak.

COMMENT ON COLUMN workspaces.capi_event_qualified IS
  'Sifatli lid uchun Meta hodisa nomi. Standart: Schedule. Custom nom ishlatilsa Events Manager''da Custom Conversion yasash kerak.';
