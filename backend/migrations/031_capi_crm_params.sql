-- 031: CAPI hodisalarini Meta'ning CRM talabiga moslashtirish
--
-- Meta hujjati (Conversions API for CRM) uch narsani talab qiladi va
-- bizda ularning ikkitasi yo'q edi:
--
--   1. custom_data.event_source = "crm"
--      "at least one valid custom parameter is mandatory" — bizning
--      `qualified` hodisalarimizda custom_data umuman bo'sh ketardi.
--      Ya'ni Meta ularni to'liq hisobga olmagan bo'lishi mumkin.
--
--   2. custom_data.lead_event_source = manba tizim nomi ("amoCRM").
--
--   3. action_source = "system_generated" — CRM hodisasi uchun majburiy.
--      Bizda bu QOTIRILGAN edi. Qo'ng'iroq voronkasida boshqa qiymat
--      (`phone_call`) kerak bo'lishi mumkin, shuning uchun sozlamaga
--      chiqaramiz. ⚠ Qo'ng'iroq uchun to'g'ri qiymat TEKSHIRILISHI
--      KERAK — Meta hujjatida call uchun alohida sahifa topilmadi.
--
-- §3.1: hech biri kodda qotib qolmaydi.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS capi_action_source TEXT;

COMMENT ON COLUMN workspaces.capi_action_source IS
  'CAPI action_source. NULL — system_generated (Meta CRM talabi). Qo''ng''iroq uchun phone_call bo''lishi mumkin — tekshirilishi kerak.';

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS capi_lead_event_source TEXT;

COMMENT ON COLUMN workspaces.capi_lead_event_source IS
  'CAPI custom_data.lead_event_source — manba tizim nomi. NULL bo''lsa CRM turidan olinadi (amoCRM).';
