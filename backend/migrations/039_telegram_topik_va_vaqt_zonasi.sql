-- ═══════════════════════════════════════════════════════════════════════
-- TELEGRAM: TOPIK + IKKI VAQT ZONASI
--
-- ─── 1. TOPIK (forum guruhlari) ─────────────────────────────────────
-- Telegram guruhida "Topics" yoqilgan bo'lsa, guruh bir nechta alohida
-- muhokamaga bo'linadi. Bot guruhga qo'shilganda UMUMIY topikka tushadi.
-- Mijoz esa hisobotni "Reklama" topigida ko'rishni xohlaydi.
--
-- Telegram buni `message_thread_id` orqali hal qiladi: kelgan xabarda
-- qaysi topikdan kelgani yoziladi, `sendMessage` da esa qaysi topikka
-- yuborish kerakligi. Ya'ni ulash buyrug'i QAYSI TOPIKDA yozilsa,
-- hisobot ham o'sha topikka tushadi.
--
-- ⚠ UNIQUE O'ZGARADI. Ilgari (workspace, chat) edi — bitta guruh bitta
-- marta. Endi bitta guruhning IKKI TOPIGI ikki alohida yo'nalish
-- bo'lishi mumkin: "Reklama" topigida kunlik hisobot, "Sotuvlar"
-- topigida sotuv xabari. COALESCE kerak, chunki NULL har doim o'zidan
-- farqli sanaladi va oddiy UNIQUE dublikatlarni to'xtata olmaydi.
--
-- ─── 2. REKLAMA AKKAUNTINING VAQT ZONASI ────────────────────────────
-- `ad_insights_daily.kun` — Facebook'ning O'Z sanasi, ya'ni reklama
-- akkauntining vaqt zonasida. `leads.won_at` esa UTC. Hisobotning
-- "kecha" si esa shu paytgacha chatning vaqt zonasida hisoblanardi.
--
-- Uch xil kun chegarasi. Akkaunt Toshkentda bo'lsa farq nol, boshqa
-- zonada bo'lsa kun chegarasidagi xarajat bir kunga siljiydi va
-- Ads Manager bilan solishtirganda raqam to'g'ri kelmaydi.
--
-- Yechim: ikkisini ajratamiz va ikkalasini ham ekranda ko'rsatamiz.
--   fb_timezone            → RAQAM qaysi kunga tegishli (ma'lumot)
--   telegram_chats.vaqt_zonasi → xabar QACHON yuboriladi (yetkazish)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS fb_timezone TEXT;

COMMENT ON COLUMN workspaces.fb_timezone IS
  'Reklama akkauntining vaqt zonasi (timezone_name). Kunlik raqamlar shu zonada bo''linadi.';

ALTER TABLE telegram_chats
  ADD COLUMN IF NOT EXISTS message_thread_id TEXT;

COMMENT ON COLUMN telegram_chats.message_thread_id IS
  'Forum guruhidagi topik. NULL — oddiy guruh yoki umumiy topik.';

-- Eski cheklov olib tashlanadi (nomi PostgreSQL tomonidan berilgan).
ALTER TABLE telegram_chats
  DROP CONSTRAINT IF EXISTS telegram_chats_workspace_id_chat_id_key;

-- ⚠ COALESCE MAJBURIY: NULL = NULL solishtiruvi PostgreSQL'da NULL
-- beradi, ya'ni topiksiz ikki qator dublikat bo'lib o'tib ketardi.
CREATE UNIQUE INDEX IF NOT EXISTS telegram_chats_uniq
  ON telegram_chats (workspace_id, chat_id, COALESCE(message_thread_id, ''));
