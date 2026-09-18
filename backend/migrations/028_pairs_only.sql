-- 028: bitta tushuncha — bitta ustun
--
-- MUAMMO: "sotuv qaysi etap" savoliga bazada IKKI xil javob bor edi:
--   eski:  amocrm_pipeline_id + amocrm_won_stage_id  (bitta voronka)
--   yangi: amocrm_won_pairs                          ('voronka:etap' ro'yxati)
-- Xuddi shunday sifatli lid uchun: amocrm_qualified_stage_ids (etap
-- ID lari, voronkasiz) va amocrm_qualified_pairs.
--
-- Kod yangi shaklni ishlatardi, eskisi esa "juftlik bo'sh bo'lsa"
-- zaxira sifatida qolgandi. Zaxira aynan shu sababdan xavfli: u
-- xato bermaydi, JIMGINA BOSHQA JAVOB beradi. Furninglass'da
-- pul `guli` voronkasida yopilardi, eski maydon esa `Kvalifikatsiya`
-- ni ko'rsatardi — daromadning 2.4% i ko'rinardi va hech narsa
-- "bu noto'g'ri" demasdi.
--
-- Shuning uchun: eski qiymatlar juftliklarga KO'CHIRILADI, keyin kod
-- zaxira yo'lini butunlay tashlaydi. Ustunlar o'chirilmaydi (eski
-- deploy hali ularni o'qiyotgan bo'lishi mumkin), lekin ular endi
-- hech qanday qarorga ta'sir qilmaydi.

-- 1) Sotuv: juftlik bo'sh, lekin eski maydonlar to'la bo'lsa — ko'chiramiz.
UPDATE workspaces
   SET amocrm_won_pairs = ARRAY[amocrm_pipeline_id || ':' || amocrm_won_stage_id]
 WHERE COALESCE(array_length(amocrm_won_pairs, 1), 0) = 0
   AND amocrm_pipeline_id IS NOT NULL
   AND amocrm_won_stage_id IS NOT NULL;

-- 2) Sifatli lid: eski ro'yxatdagi har etap ID si tanlangan voronka
--    bilan juftlanadi. Voronka noma'lum bo'lsa ko'chirib bo'lmaydi —
--    taxmin qilinmaydi (§3.5), qator o'zgarishsiz qoladi.
UPDATE workspaces w
   SET amocrm_qualified_pairs = sub.juftliklar
  FROM (
    SELECT id,
           array_agg(amocrm_pipeline_id || ':' || etap) AS juftliklar
      FROM workspaces, unnest(amocrm_qualified_stage_ids) AS etap
     WHERE COALESCE(array_length(amocrm_qualified_pairs, 1), 0) = 0
       AND COALESCE(array_length(amocrm_qualified_stage_ids, 1), 0) > 0
       AND amocrm_pipeline_id IS NOT NULL
     GROUP BY id
  ) sub
 WHERE w.id = sub.id;

COMMENT ON COLUMN workspaces.amocrm_won_stage_id IS
  'ESKI. Qarorga ta''sir qilmaydi — sotuv ta''rifi amocrm_won_pairs da. 028 dan keyin faqat tarix uchun.';
COMMENT ON COLUMN workspaces.amocrm_qualified_stage_ids IS
  'ESKI. Qarorga ta''sir qilmaydi — sifatli lid ta''rifi amocrm_qualified_pairs da.';
COMMENT ON COLUMN workspaces.amocrm_pipeline_id IS
  'Hisobotning standart voronkasi. Sotuv/sifatli ta''rifiga ALOQASI YO''Q.';
