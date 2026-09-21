/* ═══════════════════════════════════════════════════════════════════════
   ETAP TAQSIMOTI — "pul qaysi voronkaning qaysi etapida turibdi?"

   NEGA KERAK. `workspaces.amocrm_won_pairs` — bu butun mahsulotdagi eng
   xavfli sozlama. Noto'g'ri bo'lsa hech narsa yiqilmaydi: dashboard
   raqam ko'rsatadi, hisobot chiqadi, ROAS hisoblanadi — hammasi
   noto'g'ri. Loyiha tarixida bu bir marta sodir bo'lgan: "sotuvga
   o'tkazildi" etapi "yutildi" deb belgilangan va 1 542 lidga 1 ta
   sotuv chiqqan.

   Ikkita tuzoq bor va ikkalasi ham shu yerda ko'rinadi:

     1. amoCRM'da `142` (yutildi) va `143` (yutqazildi) HAR voronkada
        bor. Ya'ni "142" o'zi hech narsa demaydi — bir voronkada u
        "sotib oldi", boshqasida "otzif olindi" bo'lishi mumkin.

     2. Sotuvdan KEYINGI voronka (otziv yig'ish, qayta sotuv) ham
        "yutildi" bilan tugaydi. Uni sotuv deb sanash — ikki marta
        sanash, ya'ni daromadni ikki barobar ko'rsatish.

   Shuning uchun bu funksiya har juftlikni ALOHIDA sanaydi va NOMI
   bilan ko'rsatadi. Odam qaraydi va tanlaydi (§3.5 — ID taxmin
   qilinmaydi).

   FAQAT O'QIYDI (§4.3).

   ⚠ CHEKLOV: `leads` jadvalida voronka ID saqlanmaydi — faqat
   `crm_stage` (status id). `142` esa har voronkada bor, ya'ni bazadan
   juftlikni tiklab bo'lmaydi. Shu sabab raqamlar amoCRM'dan to'g'ridan
   o'qiladi. Buni tuzatish alohida ish (`leads.crm_pipeline_id`).
   ═══════════════════════════════════════════════════════════════════════ */

export interface EtapQatori {
  juftlik: string;          // "<pipelineId>:<statusId>"
  voronka_id: string;
  voronka: string;
  etap_id: string;
  etap: string;
  soni: number;
  summa: number;
  /** Shu juftlik config'da qaysi guruhga kiritilgan (yoki null) */
  belgilangan: 'yangi' | 'sifatli' | 'yutildi' | null;
  /** amoCRM'ning o'z "yutildi/yutqazildi" bayrog'i (142/143) */
  tizim: 'yutildi' | 'yutqazildi' | null;
}

export interface AmoLidXom {
  id?: number;
  price?: number | null;
  status_id?: number | null;
  pipeline_id?: number | null;
}

export interface AmoEtap {
  id?: number;
  name?: string;
}
export interface AmoVoronka {
  id?: number;
  name?: string;
  _embedded?: { statuses?: AmoEtap[] };
}

export interface TaqsimotNatija {
  jami_lid: number;
  jami_summa: number;
  sahifa_soni: number;
  toliq: boolean;          // hamma lid o'qildimi yoki chegaraga urildimi
  qatorlar: EtapQatori[];
  ogohlantirishlar: string[];
}

/** amoCRM narxi matn ham bo'lishi mumkin — ishonchli son. */
function son(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Voronka va etap nomlarini `<pipelineId>:<statusId>` kalitiga bog'lab
 * beradigan xarita quradi.
 */
export function nomXaritasi(voronkalar: AmoVoronka[]): {
  voronkaNomi: Map<string, string>;
  etapNomi: Map<string, string>;
} {
  const voronkaNomi = new Map<string, string>();
  const etapNomi = new Map<string, string>();
  for (const v of voronkalar) {
    if (v.id == null) continue;
    const vid = String(v.id);
    voronkaNomi.set(vid, v.name ?? `Voronka ${vid}`);
    for (const e of v._embedded?.statuses ?? []) {
      if (e.id == null) continue;
      etapNomi.set(`${vid}:${e.id}`, e.name ?? `Etap ${e.id}`);
    }
  }
  return { voronkaNomi, etapNomi };
}

/**
 * Xom lidlar ro'yxatini juftlik kesimida yig'adi.
 *
 * Toza funksiya: tarmoq ham, baza ham yo'q — shuning uchun testlanadi.
 */
export function taqsimotYig(
  lidlar: AmoLidXom[],
  voronkalar: AmoVoronka[],
  config: { yutildi: string[]; sifatli: string[]; yangi: string[] }
): Omit<TaqsimotNatija, 'sahifa_soni' | 'toliq'> {
  const { voronkaNomi, etapNomi } = nomXaritasi(voronkalar);

  const yigindi = new Map<string, { soni: number; summa: number }>();
  let jamiSumma = 0;

  for (const lid of lidlar) {
    const vid = lid.pipeline_id != null ? String(lid.pipeline_id) : '?';
    const eid = lid.status_id != null ? String(lid.status_id) : '?';
    const kalit = `${vid}:${eid}`;
    const narx = son(lid.price);
    jamiSumma += narx;
    const oldingi = yigindi.get(kalit) ?? { soni: 0, summa: 0 };
    oldingi.soni += 1;
    oldingi.summa += narx;
    yigindi.set(kalit, oldingi);
  }

  const yutildiTo = new Set(config.yutildi);
  const sifatliTo = new Set(config.sifatli);
  const yangiTo = new Set(config.yangi);

  const qatorlar: EtapQatori[] = [...yigindi.entries()]
    .map(([juftlik, v]) => {
      const [vid, eid] = juftlik.split(':');
      return {
        juftlik,
        voronka_id: vid,
        voronka: voronkaNomi.get(vid) ?? `(noma'lum voronka ${vid})`,
        etap_id: eid,
        etap: etapNomi.get(juftlik) ?? `(noma'lum etap ${eid})`,
        soni: v.soni,
        summa: v.summa,
        belgilangan: yutildiTo.has(juftlik)
          ? ('yutildi' as const)
          : sifatliTo.has(juftlik)
            ? ('sifatli' as const)
            : yangiTo.has(juftlik)
              ? ('yangi' as const)
              : null,
        tizim: eid === '142' ? ('yutildi' as const) : eid === '143' ? ('yutqazildi' as const) : null,
      };
    })
    // Eng ko'p pul turgan etap tepada — savol odatda shu yerda.
    .sort((a, b) => b.summa - a.summa || b.soni - a.soni);

  /* ── Ogohlantirishlar: odam o'qiydigan, raqamga asoslangan ──────── */
  const ogohlantirishlar: string[] = [];

  // 1. Belgilangan "yutildi" juftligida pul yo'q, boshqa joyda bor.
  const belgilanganSumma = qatorlar
    .filter((q) => q.belgilangan === 'yutildi')
    .reduce((s, q) => s + q.summa, 0);

  if (config.yutildi.length === 0) {
    ogohlantirishlar.push(
      "⚠ Birorta 'yutildi' juftligi belgilanmagan — hech narsa sotuv deb sanalmaydi."
    );
  } else if (belgilanganSumma === 0 && jamiSumma > 0) {
    ogohlantirishlar.push(
      `⚠ Belgilangan 'yutildi' etaplarida 0 pul turibdi, lekin CRM'da jami ${jamiSumma.toLocaleString()} bor. Juftliklar deyarli aniq noto'g'ri.`
    );
  } else if (jamiSumma > 0 && belgilanganSumma / jamiSumma < 0.3) {
    ogohlantirishlar.push(
      `⚠ Belgilangan 'yutildi' etaplari CRM'dagi pulning atigi ${Math.round((belgilanganSumma / jamiSumma) * 100)}% ini qamrab olgan. Qolgan pul boshqa etaplarda.`
    );
  }

  // 2. amoCRM 142 deb bilgan, lekin biz sotuv demagan etaplar.
  const sanalmagan142 = qatorlar.filter(
    (q) => q.tizim === 'yutildi' && q.belgilangan !== 'yutildi' && q.summa > 0
  );
  for (const q of sanalmagan142) {
    ogohlantirishlar.push(
      `amoCRM "${q.voronka} → ${q.etap}" ni YUTILDI deb biladi (${q.soni} lid, ${q.summa.toLocaleString()}), biz esa sotuv deb sanamayapmiz. Ataylabmi?`
    );
  }

  // 3. Biz sotuv degan, lekin amoCRM 142 emas — bu ham bo'lishi mumkin
  //    (mijoz o'z etapini ishlatadi), lekin ko'rinib tursin.
  const sotuvEmas142 = qatorlar.filter((q) => q.belgilangan === 'yutildi' && q.tizim !== 'yutildi');
  for (const q of sotuvEmas142) {
    ogohlantirishlar.push(
      `Biz "${q.voronka} → ${q.etap}" ni SOTUV deb sanayapmiz, lekin amoCRM uni yakuniy etap deb bilmaydi. Bu haqiqatan sotuvmi?`
    );
  }

  return { jami_lid: lidlar.length, jami_summa: jamiSumma, qatorlar, ogohlantirishlar };
}
