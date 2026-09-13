#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# Attribution Platform — deploy'dan keyingi tekshiruv
#
# Ishlatish:
#   chmod +x smoke-test.sh
#   API=https://sales-hacking-api.vercel.app \
#   WEB=https://sales-hacking.vercel.app \
#   CRON_SECRET=... \
#   ./smoke-test.sh
# ════════════════════════════════════════════════════════════════
set -uo pipefail

API="${API:?API kerak: backend URL bering}"
WEB="${WEB:-}"
CRON_SECRET="${CRON_SECRET:-}"

pass=0; fail=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; pass=$((pass+1)); }
bad()  { printf "  \033[31m✗\033[0m %s\n     %s\n" "$1" "$2"; fail=$((fail+1)); }
head_() { printf "\n\033[1m%s\033[0m\n" "$1"; }

req() { # req METHOD URL [extra curl args...]
  local m=$1 u=$2; shift 2
  curl -sS -m 30 -o /tmp/st.body -w "%{http_code}|%{time_total}" -X "$m" "$u" "$@" 2>/tmp/st.err || echo "000|0"
}

head_ "1. Backend tirikmi"
r=$(req GET "$API/health"); code=${r%%|*}; t=${r##*|}
if [ "$code" = "200" ]; then
  runtime=$(python3 -c "import json;print(json.load(open('/tmp/st.body')).get('runtime','?'))" 2>/dev/null)
  ok "/health → 200 (${t}s), runtime=$runtime"
  [ "$runtime" = "vercel-serverless" ] \
    && ok "serverless kirish nuqtasi ishlayapti (api/index.ts)" \
    || bad "runtime='$runtime'" "kutilgan 'vercel-serverless'. vercel.json yoki Root Directory noto'g'ri."
else
  bad "/health → $code" "$(head -c 200 /tmp/st.body)"
fi

head_ "2. Autentifikatsiya himoyasi"
r=$(req GET "$API/api/dashboard/overview"); code=${r%%|*}
[ "$code" = "401" ] && ok "JWT siz /api/dashboard → 401" \
  || bad "JWT siz /api/dashboard → $code" "401 bo'lishi kerak edi"

head_ "3. Cron endpoint"
r=$(req GET "$API/api/sync/cron?secret=notreal"); code=${r%%|*}
case "$code" in
  401) ok "noto'g'ri sir → 401" ;;
  503) bad "→ 503" "CRON_SECRET env o'zgaruvchisi Vercel'da qo'yilmagan" ;;
  *)   bad "noto'g'ri sir → $code" "401 kutilgan edi" ;;
esac

if [ -n "$CRON_SECRET" ]; then
  r=$(req GET "$API/api/sync/cron" -H "X-Cron-Secret: $CRON_SECRET"); code=${r%%|*}; t=${r##*|}
  if [ "$code" = "200" ]; then
    python3 - <<'PY'
import json
try:
    d = json.load(open('/tmp/st.body'))
except Exception:
    print("     javob JSON emas"); raise SystemExit
print(f"     workspace: {d.get('workspaces')}  xato: {d.get('failed')}  davomiylik: {d.get('durationMs')}ms")
print(f"     pool: {d.get('pool')}")
if d.get('workspaces') == 0:
    print("     ⚠ 0 workspace — FB ulanmagan yoki ad account tanlanmagan")
for r_ in d.get('results', []):
    if not r_.get('ok'):
        print(f"     ⚠ {r_['workspaceId']}: {r_.get('error')}")
PY
    ok "to'g'ri sir → 200 (${t}s)"
  else
    bad "to'g'ri sir → $code" "$(head -c 250 /tmp/st.body)"
  fi
else
  printf "  \033[33m·\033[0m CRON_SECRET berilmadi — to'g'ri sir sinovi o'tkazib yuborildi\n"
fi

head_ "4. Webhook (imzosiz rad etilishi kerak)"
r=$(req POST "$API/api/webhooks/amocrm" -H 'Content-Type: application/json' -d '{"account":{"subdomain":"test"}}')
code=${r%%|*}
[ "$code" = "401" ] && ok "sirsiz webhook → 401" \
  || bad "sirsiz webhook → $code" "AMOCRM_WEBHOOK_SECRET qo'yilmagan bo'lishi mumkin (u holda 200 keladi)"

head_ "5. Pixel (hech qachon xato qaytarmasligi kerak)"
r=$(req POST "$API/api/pixel/event" -H 'Content-Type: application/json' -d 'BUZUQ-JSON{{{')
code=${r%%|*}
[ "$code" = "200" ] && ok "buzuq JSON → 200 (mijoz sayti buzilmaydi)" \
  || bad "buzuq JSON → $code" "pixel har doim 200 qaytarishi kerak"

head_ "6. CORS"
if [ -n "$WEB" ]; then
  hdr=$(curl -sS -m 20 -D - -o /dev/null -X OPTIONS "$API/api/dashboard/overview" \
        -H "Origin: $WEB" -H "Access-Control-Request-Method: GET" 2>/dev/null \
        | grep -i 'access-control-allow-origin' | tr -d '\r')
  [ -n "$hdr" ] && ok "$hdr" \
    || bad "Allow-Origin sarlavhasi yo'q" "backend'da FRONTEND_URL=$WEB qo'ying va redeploy qiling"
else
  printf "  \033[33m·\033[0m WEB berilmadi — CORS sinovi o'tkazib yuborildi\n"
fi

head_ "7. Frontend"
if [ -n "$WEB" ]; then
  r=$(req GET "$WEB/"); code=${r%%|*}
  [ "$code" = "200" ] && ok "/ → 200" || bad "/ → $code" ""
  r=$(req GET "$WEB/dashboard"); code=${r%%|*}
  [ "$code" = "200" ] && ok "/dashboard → 200 (SPA rewrite ishlayapti)" \
    || bad "/dashboard → $code" "frontend/vercel.json rewrites ishlamayapti"
fi

printf "\n\033[1m═══ %d o'tdi, %d yiqildi ═══\033[0m\n" "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
