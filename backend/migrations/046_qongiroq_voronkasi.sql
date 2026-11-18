-- 046: qo'ng'iroq voronkasi → call kampaniya
--
-- MUAMMO: call maqsadidagi kampaniya eng ko'p pul sarflaydi, lekin uning
-- lidlari hech qayerga bog'lanmagan. Qo'ng'iroqda UTM ham, fbclid ham,
-- Meta Lead ID ham yo'q.
--
-- YECHIM: telefoniya reklama raqamiga kelgan qo'ng'iroqqa amoCRM'da
-- kartochkani ALOHIDA voronkada ochadi. Lid shu voronkada YARATILGAN
-- bo'lsa — u shu voronkaga biriktirilgan kampaniyadan kelgan.
--
-- ⚠ "YARATILGAN" muhim: boshqa voronkadagi lid keyinchalik shu voronkaga
-- ko'chirilishi mumkin (masalan sotuv bosqichi). Shuning uchun kanal
-- faqat add_lead webhook'ida, bir marta yoziladi va o'zgarmaydi.
--
-- §3.1: voronka ID ham, kampaniya ID ham kodda yo'q — shu xaritada.
-- Kod bu ustunlarni o'zi ham yaratadi (services/qongiroq.ts), migratsiya
-- qo'lda yurgizilmagan bo'lsa ham ishlaydi.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS qongiroq_voronkalari JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS capi_event_call TEXT;

COMMENT ON COLUMN workspaces.qongiroq_voronkalari IS
  'amoCRM voronka ID -> FB kampaniya ID. Shu voronkada YARATILGAN lid = shu kampaniyadan kelgan qo''ng''iroq.';
COMMENT ON COLUMN workspaces.capi_event_call IS
  'Qo''ng''iroq lidi Meta''ga qaysi nom bilan ketadi. NULL — oddiy Lead nomi.';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS kanal TEXT,
  ADD COLUMN IF NOT EXISTS qongiroq_kampaniya TEXT,
  ADD COLUMN IF NOT EXISTS yaratilgan_voronka TEXT;

COMMENT ON COLUMN leads.kanal IS
  'Lid yaratilgan paytda aniqlangan kanal (hozircha faqat ''qongiroq''). Keyin o''zgarmaydi.';
COMMENT ON COLUMN leads.qongiroq_kampaniya IS
  'Qo''ng''iroq lidi qaysi FB kampaniyaga tegishli (fb_campaign_id).';

CREATE INDEX IF NOT EXISTS idx_leads_kanal
  ON leads (workspace_id, kanal)
  WHERE kanal IS NOT NULL;
