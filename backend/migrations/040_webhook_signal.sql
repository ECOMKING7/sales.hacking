-- ═══════════════════════════════════════════════════════════════════════
-- WEBHOOK SIGNALI — "CRM bizga oxirgi marta qachon xabar berdi?"
--
-- NEGA KERAK. amoCRM'da webhook ro'yxatda turgani — u ISHLAYAPTI degani
-- emas. Ro'yxatni ko'rish uchun amoCRM'ga so'rov kerak, va u faqat
-- "obuna bor" deb aytadi; haqiqatan signal kelayotganini aytmaydi.
--
-- Vercel bepul tarifda log 1 SOAT saqlanadi. Ya'ni kechqurun kelgan
-- (yoki kelmagan) webhook ertalab hech qayerda ko'rinmaydi. Bu esa
-- 2026-09-19 dagi xatoning aynan takrorlanishi: webhook amoCRM'da
-- umuman ro'yxatdan o'tmagan edi va OYLAB hech kim sezmadi.
--
-- Shuning uchun har kelgan signal bazaga yoziladi: vaqti, turi va
-- umumiy soni. Buni ekranda ko'rsatish jim xatoni ko'rinadigan
-- qiladi — "6 kundan beri signal yo'q" degan qizil yozuv.
--
-- ⚠ Bu ustunlar ATRIBUSIYAGA TEGMAYDI. Ular faqat tashxis uchun.
-- Hech bir hisob-kitob ularga tayanmaydi.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS oxirgi_webhook       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS oxirgi_webhook_turi  TEXT,
  ADD COLUMN IF NOT EXISTS webhook_soni         BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN workspaces.oxirgi_webhook IS
  'CRM dan oxirgi webhook kelgan vaqt (UTC). NULL = hech qachon kelmagan.';
COMMENT ON COLUMN workspaces.oxirgi_webhook_turi IS
  'Oxirgi webhook ichidagi hodisa turlari, masalan "leads.status, contacts.add".';
COMMENT ON COLUMN workspaces.webhook_soni IS
  'Jami qabul qilingan webhook soni. Faqat tashxis uchun.';
