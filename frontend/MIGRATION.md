# HALO dizayn tizimiga ko'chirish — qoidalar

Bu fayl migratsiya davomidagi yagona manba. Har bir fayl ko'chirilganda shu qoidalarga amal qiling.

## 0. Eng muhim qoida

**JSX ichida bironta ham Tailwind palitra rangi qolmasligi kerak.**
`gray-*`, `indigo-*`, `blue-*`, `green-*`, `red-*`, `slate-*`, `zinc-*`, `amber-*`, `pink-*`,
va `bg-[#1877F2]` kabi qotgan hex — hammasi olib tashlanadi.
Faqat quyidagi token nomlari ishlatiladi.

## 1. Rang tokenlari (tailwind.config.js)

| Eski | Yangi | Izoh |
|---|---|---|
| `bg-white` | `bg-surface` | |
| `bg-gray-50` | `bg-surface-2` | jadval sarlavhasi, ikkilamchi fon |
| `bg-gray-100` | `bg-surface-2` | |
| `bg-gray-200` | `bg-surface-3` | |
| `bg-gray-800`, `bg-gray-900` | `bg-surface-2` | eski qora sidebar — endi yorug' |
| `border-gray-100`, `border-gray-200` | `border-line` | |
| `border-gray-300` | `border-line-2` | |
| `text-gray-900`, `text-gray-800` | `text-ink` | asosiy matn |
| `text-gray-700`, `text-gray-600`, `text-gray-500` | `text-ink-2` | ikkilamchi matn |
| `text-gray-400`, `text-gray-300` | `text-ink-3` | uchinchi daraja, placeholder |
| `text-gray-100`, `text-white` (qora fonda) | `text-ink` | |
| `bg-indigo-600`, `bg-indigo-700` | `bg-accent` | |
| `text-indigo-600`, `text-indigo-400` | `text-accent` | |
| `border-indigo-500` | `border-edge` | |
| `bg-[#1877F2]` (Facebook) | yo'q — `<Button variant="secondary">` | brend rangi tugmada emas |
| `text-green-600`, `text-green-700` | `text-ok` | |
| `bg-green-100` | `bg-ok/12` | |
| `text-red-600`, `text-red-700` | `text-bad` | |
| `bg-red-50` | `bg-bad/10` | |
| `text-amber-*`, `bg-amber-*` | `text-warn`, `bg-warn/12` | |

Qo'shimcha tokenlar: `bg-ground` (sahifa foni), `bg-tint` (ikonka qutisi),
`border-edge`, `border-edge-soft`, `text-accent-ink` (accent ustidagi matn).

Shaffoflik: `bg-edge/9`, `bg-ok/12` kabi yozuv ishlaydi.

## 2. Ma'no qoidasi — buzilmasin

- **Havorang (`accent`, `edge`, `tint`) = harakat yoki faol holat.** "Bosing", "bu jonli", "bu tanlangan".
- **Yashil (`ok`) / qizil (`bad`) / sariq (`warn`) = natija.** O'sish, tushish, ogohlantirish.
- Raqam hech qachon havorang bo'lmaydi. Yagona istisno — `<KpiCard hero>` (ROAS).

## 3. Radius va soya

| Eski | Yangi |
|---|---|
| `rounded`, `rounded-md`, `rounded-lg` | `rounded-sm` (9px) |
| `rounded-xl` | `rounded-md` (14px) |
| `rounded-2xl` | `rounded-lg` (18px) |
| `rounded-full` | `rounded-full` (o'zgarmaydi) |
| `shadow-sm`, `shadow-lg`, `shadow-xl` | olib tashlanadi — o'rniga `border-[1.5px] border-line` yoki `shadow-glow-*` |

Glow darajalari: `shadow-glow-xs` (hover), `shadow-glow-sm` (asosiy tugma),
`shadow-glow-md` (focus), `shadow-glow-lg` (modal).
**Bir ekranda bitta `shadow-glow-md` dan ortiq bo'lmasin.**

## 4. Shrift o'lchamlari

Shkala `tailwind.config.js` da qayta belgilangan. Faqat shular:
`text-label` (10px, mono yorliq), `text-xs` (12), `text-sm` (13, jadval),
`text-base` (14, matn), `text-lg` (18), `text-xl` (24), `text-2xl` (28, metrika), `text-3xl` (32).

Og'irlik: `font-normal` matn, `font-medium` raqam, `font-semibold` tugma/yorliq, `font-bold` sarlavha.
Ustun yorliqlari va mono qiymatlar: `font-mono text-label uppercase tracking-[0.1em] text-ink-3`.

Raqamli ustun va metrikaga **har doim** `tabular-nums` qo'ying.

## 5. Primitivlar — qo'lda tugma/karta yozilmaydi

`import { Button, Card, CardHeader, Input, Badge, TableWrap, Table, Th, Td, Tr, TableEmpty, EmptyState, Skeleton, SkeletonText, cn } from '../components/ui';`
(dashboard ichidan: `'../ui'`)

```tsx
<Button variant="primary|secondary|ghost|danger" size="sm|md|lg"
        loading icon={<X/>} iconRight={<Y/>} fullWidth onClick={...}>Matn</Button>

<Card highlight interactive padding="none|sm|md|lg">...</Card>
<CardHeader title="..." description="..." icon={<Icon/>} action={<Button .../>} />

<Input label="Email" hint="..." error="..." icon={<Mail/>} {...props} />

<Badge tone="neutral|accent|ok|warn|bad" dot={true|'live'}>Matn</Badge>

<TableWrap><Table>
  <thead><tr><Th>Nomi</Th><Th numeric>Spent</Th></tr></thead>
  <tbody>
    <Tr selected={...}><Td>x</Td><Td numeric>$1,840</Td></Tr>
    <TableEmpty colSpan={8}>Ma'lumot yo'q</TableEmpty>
  </tbody>
</Table></TableWrap>

<EmptyState icon={<Plug/>} title="Facebook Ads ulanmagan"
            hint="xarajat yo'q · ROAS hisoblanmaydi"
            action={<Button>Ulash</Button>} dashed />

<Skeleton className="h-7 w-24" />
<SkeletonText lines={3} />
```

`cn()` — klasslarni birlashtiradi va ziddiyatni hal qiladi (clsx + tailwind-merge).

## 6. Fokus

`:focus-visible` uslubi `index.css` da **global** qilib berilgan.
Shuning uchun `focus:ring-*`, `focus:border-*`, `focus:outline-none` klasslarini **olib tashlang**.
Primitivlar ham buni o'zi hal qiladi.

## 7. Bo'sh va yuklanish holatlari

Har bir ma'lumot ko'rsatadigan blok uchta holatni qoplashi shart:
- **loading** → `Skeleton` / `SkeletonText`
- **empty** → `EmptyState` yoki `TableEmpty`
- **error** → `text-bad` matn + qayta urinish tugmasi (`<Button variant="secondary" size="sm">`)

Agar fayl bu holatlarni qoplamagan bo'lsa — qo'shing.

## 8. Tegilmaydigan narsalar

- Biznes mantiq, API chaqiruvlari, hook'lar, state — **o'zgarmaydi**
- Props interfeyslari — o'zgarmaydi (yangi ixtiyoriy prop qo'shish mumkin)
- Matnlar — o'zgarmaydi (mavjud tilda qoladi)
- `lucide-react` **v1** — brend ikonkalari (Facebook, Instagram) yo'q. `Megaphone` kabi umumiy ikonka ishlating, aks holda build buziladi.

## 9. Tugatgach

`npm run typecheck` xatosiz o'tishi shart.
