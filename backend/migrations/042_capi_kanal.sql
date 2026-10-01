-- ═══════════════════════════════════════════════════════════════════════
-- CAPI: har hodisaning KANALI va action_source'i
--
-- Ilgari action_source butun workspace uchun bitta edi (031). Endi har
-- lid o'z kanali bo'yicha ketadi (metaCapi.ts → kanalAniqla):
--   forma → system_generated · qongiroq → phone_call · sayt/boshqa →
--   system_generated. Ustunlar diagnostika uchun: "qo'ng'iroqdan nechta
--   sotuv Meta'ga ketdi, nechtasi xato".
--
-- workspaces.capi_action_source endi NULL = AVTOMATIK. Qiymat qo'yilsa
-- hamma lid uchun o'sha qotiriladi (eski xatti-harakat).
--
-- Kod bu ustunlarni o'zi ham yaratadi (production'da migratsiya qo'lda
-- ishga tushmasligi mumkin) — bu fayl toza o'rnatish uchun.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE capi_events
  ADD COLUMN IF NOT EXISTS kanal TEXT,
  ADD COLUMN IF NOT EXISTS action_source TEXT;
