-- 032: Meta Lead ID qayerdan o'qiladi — maydon, lid nomi yoki teg
--
-- Furninglass tahlili: Lead ID hech bir maxsus maydonda yo'q. U LID
-- NOMIDA turibdi ("Заявка #1504085748405578"). Teglarda ham 15-17
-- xonali son bor, lekin u 205 lidda atigi 14 xil — ya'ni takrorlanadi,
-- demak lead ID emas, forma yoki reklama ID si.
--
-- Bu bitta mijozning xususiyati emas: amoCRM-Facebook integratsiyalari
-- Lead ID ni turli joyga yozadi. Shuning uchun MANBA ham konfiguratsiya
-- (§3.1), xuddi maydon ID si kabi.
--
--   'field' — maxsus maydon (amocrm_lead_id_field bilan birga)
--   'name'  — lid nomi ichidan
--   'tag'   — teglar ichidan
--
-- Sukut 'field': eski xulq o'zgarmaydi.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS amocrm_lead_id_source TEXT NOT NULL DEFAULT 'field';

COMMENT ON COLUMN workspaces.amocrm_lead_id_source IS
  'Meta Lead ID qayerdan o''qiladi: field | name | tag. Sukut field.';
