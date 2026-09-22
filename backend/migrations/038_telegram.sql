-- ═══════════════════════════════════════════════════════════════════════
-- TELEGRAM — hisobot va sotuv xabari
--
-- IKKI ISH:
--   1. Tanlangan vaqtda reklama hisoboti. Qaysi metrikalar — HAR CHAT
--      O'ZI TANLAYDI. Direktorga ROAS kerak, targetologga CPM.
--   2. Lid "sotuv" etapiga o'tgan zahoti darhol xabar: qaysi kampaniya,
--      qaysi reklama guruhi, qaysi reklama, qancha summa.
--
-- ─── NEGA BITTA BOT, HAR MIJOZGA ALOHIDA EMAS ───────────────────────
-- Muqobil: har mijoz BotFather'da o'z botini yasab, tokenini bizga
-- beradi. Bu §4.1 ga ziddi (token bizdan o'tadi) va mijozga 6 qadamlik
-- ish qo'shadi. Buning o'rniga bitta platforma boti:
--
--   TELEGRAM_BOT_TOKEN — .env da, bitta, hech qachon bazaga tushmaydi.
--
-- Mijoz ulanish kodini oladi va botga `/start <kod>` yozadi. Guruhga
-- ham shunday: botni guruhga qo'shib `/ulash <kod>` yoziladi.
--
-- ─── NEGA CHAT DARAJASIDA SOZLAMA, WORKSPACE EMAS ───────────────────
-- Bitta akkauntda bir nechta oluvchi bo'ladi: direktor (shaxsiy),
-- marketing guruhi (group), balki mijozning o'zi. Har birining ehtiyoji
-- boshqa. Sozlamani workspace'ga qo'ysak — hammaga bitta xabar ketadi
-- va u hech kimga to'g'ri kelmaydi.
--
-- ⚠ chat_id MAXFIY EMAS lekin shaxsiy: u orqali kimga xabar ketayotgani
-- bilinadi. Boshqa workspace'ga ko'rinmaydi (hamma so'rov workspace_id
-- bo'yicha filtrlanadi).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telegram_chats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Telegram'ning chat identifikatori. Guruhda manfiy son bo'ladi,
  -- shuning uchun TEXT: BIGINT ham yetadi, lekin kanal id'lari
  -- -100... bilan boshlanadi va kelajakda uzayishi mumkin.
  chat_id       TEXT NOT NULL,
  nom           TEXT,
  -- private | group | supergroup | channel
  tur           TEXT,

  -- ─── 1-ish: rejali hisobot ─────────────────────────────────────────
  -- NULL = hisobot o'chirilgan. Vaqt MAHALLIY (vaqt_zonasi bo'yicha).
  hisobot_vaqti TIME,
  vaqt_zonasi   TEXT NOT NULL DEFAULT 'Asia/Tashkent',
  -- kecha | bugun | 7kun
  hisobot_davri TEXT NOT NULL DEFAULT 'kecha',

  -- Qaysi metrikalar yuboriladi. Ro'yxat kodda: services/telegramMatn.ts
  -- METRIKALAR. Bazada nomlar bilan saqlanadi — yangi metrika qo'shilsa
  -- migratsiya kerak emas.
  metrikalar    TEXT[] NOT NULL
                  DEFAULT '{sarf,lidlar,cpl,sotuvlar,daromad,roas}'::TEXT[],

  -- Umumiy raqamlardan keyin nima ko'rsatilsin:
  --   'yoq'        — faqat jami
  --   'kampaniya'  — eng ko'p sarflagan N kampaniya
  --   'reklama'    — eng ko'p sarflagan N reklama
  -- 283 ta kampaniyani telegramga sig'dirib bo'lmaydi, shuning uchun N.
  tafsilot      TEXT    NOT NULL DEFAULT 'kampaniya',
  tafsilot_soni INTEGER NOT NULL DEFAULT 5,

  -- Kuniga bir marta kafolati. Cron har 30 daqiqada ishlaydi, ya'ni
  -- bu ustunsiz bitta kun 48 marta yuborilardi.
  oxirgi_hisobot DATE,

  -- ─── 2-ish: sotuv xabari ───────────────────────────────────────────
  sotuv_xabari  BOOLEAN NOT NULL DEFAULT TRUE,

  -- Bot bloklansa yoki guruhdan chiqarilsa FALSE bo'ladi (Telegram 403).
  -- O'chirmaymiz: sabab ko'rinib tursin, mijoz "nega kelmayapti" desa
  -- javob bor.
  faol          BOOLEAN NOT NULL DEFAULT TRUE,
  oxirgi_xato   TEXT,
  oxirgi_yuborildi TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, chat_id)
);

CREATE INDEX IF NOT EXISTS telegram_chats_ws
  ON telegram_chats (workspace_id);

-- Webhook chat_id bo'yicha qidiradi — workspace'ni hali bilmaydi.
CREATE INDEX IF NOT EXISTS telegram_chats_chat
  ON telegram_chats (chat_id);

COMMENT ON COLUMN telegram_chats.hisobot_vaqti IS
  'Mahalliy vaqt (vaqt_zonasi bo''yicha). NULL — hisobot yuborilmaydi.';
COMMENT ON COLUMN telegram_chats.oxirgi_hisobot IS
  'Oxirgi hisobot qaysi MAHALLIY kunga yuborilgan. Kuniga bir marta kafolati.';

-- ═══════════════════════════════════════════════════════════════════════
-- ULANISH KODLARI
--
-- Bot xabar kelganda "bu odam qaysi workspace'dan?" ni bilishi kerak.
-- Telegram foydalanuvchi id'si bizning bazamizda yo'q, ya'ni bog'lash
-- uchun bir martalik kod kerak.
--
-- ⚠ KOD = VAQTINCHALIK PAROL. Kimdir kodni bilsa, o'sha workspace'ning
-- sotuv summalarini o'z telegramiga ulaydi. Shuning uchun:
--   · 15 daqiqa amal qiladi
--   · bir marta ishlatiladi
--   · 32 belgilik alifbodan 10 belgi ≈ 10^15 variant
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telegram_kodlar (
  kod           TEXT PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  amal_qiladi   TIMESTAMPTZ NOT NULL,
  ishlatilgan   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_kodlar_ws
  ON telegram_kodlar (workspace_id);

-- ═══════════════════════════════════════════════════════════════════════
-- YUBORILGAN SOTUV XABARLARI — takrorni to'xtatish
--
-- amoCRM `status_lead` hodisasini QAYTA yuboradi: javob 2xx bo'lmasa
-- qayta urinadi, va lid "sotuv" etapidan chiqib qayta kirsa ham yangi
-- hodisa keladi. Bu ustunsiz direktor bitta sotuv uchun uch marta
-- "💰 Sotuv" xabarini oladi va xabarlarga ishonmay qo'yadi.
--
-- Naqsh `capi_events` dagi bilan bir xil: yozuv AVVAL band qilinadi,
-- keyin yuboriladi.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telegram_sotuvlar (
  chat_row_id  UUID NOT NULL REFERENCES telegram_chats(id) ON DELETE CASCADE,
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_row_id, lead_id)
);
