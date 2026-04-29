/* eslint-disable no-console */
/**
 * 法定相続分 計算ロジック 検証スクリプト
 *  実行：node test.cjs
 *  R1スコープ：基本3ケース＋代襲＋相続放棄
 */
const { calculate, calculateExtended, formatFrac } = require('./calc.js');

let pass = 0, fail = 0;
const failures = [];

function person(name, opts = {}) {
  return Object.assign({ name, alive: true, renounced: false, descendants: [] }, opts);
}

function check(caseName, result, expected) {
  // expected: [{label?, name?, share:'a/b'}]  — 順序は不問。同分母で同人数のときは name で同定
  const got = result.rows.map(r => ({ name: r.person?.name, label: r.label, share: formatFrac(r.share) }));
  // 各 expected を got から1件ずつ消費
  const remain = [...got];
  const errs = [];
  for (const ex of expected) {
    const i = remain.findIndex(g =>
      (ex.name == null || g.name === ex.name) &&
      (ex.label == null || g.label === ex.label) &&
      g.share === ex.share
    );
    if (i < 0) errs.push(`期待値が見つからない: ${JSON.stringify(ex)}`);
    else remain.splice(i, 1);
  }
  if (remain.length > 0) errs.push(`想定外の結果が混入: ${JSON.stringify(remain)}`);

  if (errs.length === 0) {
    pass++;
    console.log(`  ✅ ${caseName}`);
    console.log(`     → ${got.map(g => `${g.name || g.label}=${g.share}`).join(', ')}`);
  } else {
    fail++;
    failures.push({ caseName, errs, got, expected });
    console.log(`  ❌ ${caseName}`);
    console.log(`     got     : ${JSON.stringify(got)}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    errs.forEach(e => console.log(`     ! ${e}`));
  }
}

console.log('================================================');
console.log('  法定相続分 計算ロジック 検証（R1）');
console.log('================================================\n');

// ─────────────────────────────────────────────────────────
// 1. 基本：配偶者と子2人
// ─────────────────────────────────────────────────────────
check('1. 配偶者＋子2人 → 配偶者1/2、子1/4ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [person('子A'), person('子B')],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '子A', share: '1/4' },
    { name: '子B', share: '1/4' }
  ]
);

// ─────────────────────────────────────────────────────────
// 2. 代襲：子1人が他界、その孫2人が代襲
// ─────────────────────────────────────────────────────────
check('2. 配偶者＋子(亡)→孫2人代襲、生存子なし → 配偶者1/2、孫1/4ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('亡子', { alive: false, descendants: [person('孫A'), person('孫B')] })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '孫A', share: '1/4' },
    { name: '孫B', share: '1/4' }
  ]
);

// ─────────────────────────────────────────────────────────
// 3. 配偶者＋直系尊属（父母2人）
// ─────────────────────────────────────────────────────────
check('3. 配偶者＋父母 → 配偶者2/3、親1/6ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [person('父'), person('母')],
    siblings: []
  }),
  [
    { label: '配偶者', share: '2/3' },
    { name: '父', share: '1/6' },
    { name: '母', share: '1/6' }
  ]
);

// ─────────────────────────────────────────────────────────
// 4. 配偶者＋兄弟姉妹3人
// ─────────────────────────────────────────────────────────
check('4. 配偶者＋兄弟3人 → 配偶者3/4、兄弟1/12ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [],
    siblings: [person('兄'), person('姉'), person('弟')]
  }),
  [
    { label: '配偶者', share: '3/4' },
    { name: '兄', share: '1/12' },
    { name: '姉', share: '1/12' },
    { name: '弟', share: '1/12' }
  ]
);

// ─────────────────────────────────────────────────────────
// 5. 配偶者なし、子3人 → 子で均等 1/3
// ─────────────────────────────────────────────────────────
check('5. 配偶者なし＋子3人 → 子1/3ずつ',
  calculate({
    spouse: null,
    children: [person('子A'), person('子B'), person('子C')],
    parents: [],
    siblings: []
  }),
  [
    { name: '子A', share: '1/3' },
    { name: '子B', share: '1/3' },
    { name: '子C', share: '1/3' }
  ]
);

// ─────────────────────────────────────────────────────────
// 6. 配偶者＋子2人、子の1人が放棄 → 残った子は1/2全部
// ─────────────────────────────────────────────────────────
check('6. 配偶者＋子2人(1人放棄) → 配偶者1/2、生存子1/2',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('子A'),
      person('子B', { renounced: true })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '子A', share: '1/2' }
  ]
);

// ─────────────────────────────────────────────────────────
// 7. 配偶者のみ
// ─────────────────────────────────────────────────────────
check('7. 配偶者のみ（血族なし） → 配偶者が全部',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1' }
  ]
);

// ─────────────────────────────────────────────────────────
// 8. 子全員放棄 → 第2順位（親）に移る
// ─────────────────────────────────────────────────────────
check('8. 配偶者＋子2人とも放棄＋父母 → 配偶者2/3、父母1/6ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('子A', { renounced: true }),
      person('子B', { renounced: true })
    ],
    parents: [person('父'), person('母')],
    siblings: []
  }),
  [
    { label: '配偶者', share: '2/3' },
    { name: '父', share: '1/6' },
    { name: '母', share: '1/6' }
  ]
);

// ─────────────────────────────────────────────────────────
// 9. 子も親もなし → 兄弟姉妹で均等
// ─────────────────────────────────────────────────────────
check('9. 配偶者なし＋兄弟2人 → 兄弟1/2ずつ',
  calculate({
    spouse: null,
    children: [],
    parents: [],
    siblings: [person('兄'), person('妹')]
  }),
  [
    { name: '兄', share: '1/2' },
    { name: '妹', share: '1/2' }
  ]
);

// ─────────────────────────────────────────────────────────
// 10. 子のうち1人が他界(孫1人代襲)、もう1人は生存、配偶者あり
//     配偶者1/2、生存子1/4、孫1/4
// ─────────────────────────────────────────────────────────
check('10. 配偶者＋生存子1人＋亡子(孫1人代襲) → 配偶者1/2、子1/4、孫1/4',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('生存子'),
      person('亡子', { alive: false, descendants: [person('孫')] })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '生存子', share: '1/4' },
    { name: '孫', share: '1/4' }
  ]
);

// ─────────────────────────────────────────────────────────
// 11. 兄弟3人で1人他界、甥姪2人代襲、配偶者あり
//     配偶者3/4、生存兄弟2人 各1/12、甥姪2人 各1/24
// ─────────────────────────────────────────────────────────
check('11. 配偶者＋兄弟2人＋亡兄弟(甥姪2人代襲) → 配偶者3/4、兄1/12、姉1/12、甥1/24、姪1/24',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [],
    siblings: [
      person('兄'),
      person('姉'),
      person('亡弟', { alive: false, descendants: [person('甥'), person('姪')] })
    ]
  }),
  [
    { label: '配偶者', share: '3/4' },
    { name: '兄', share: '1/12' },
    { name: '姉', share: '1/12' },
    { name: '甥', share: '1/24' },
    { name: '姪', share: '1/24' }
  ]
);

// ─────────────────────────────────────────────────────────
// 12. 配偶者放棄＋子2人 → 子で均等
// ─────────────────────────────────────────────────────────
check('12. 配偶者放棄＋子2人 → 配偶者ゼロ、子1/2ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: true, name: '配偶者' },
    children: [person('子A'), person('子B')],
    parents: [],
    siblings: []
  }),
  [
    { name: '子A', share: '1/2' },
    { name: '子B', share: '1/2' }
  ]
);

// ─────────────────────────────────────────────────────────
// 13. 子が他界、孫も全員他界 → 子の系統消滅、親へ
// ─────────────────────────────────────────────────────────
check('13. 配偶者＋亡子(孫もなし)＋父 → 配偶者2/3、父1/3',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('亡子', { alive: false, descendants: [] })
    ],
    parents: [person('父')],
    siblings: []
  }),
  [
    { label: '配偶者', share: '2/3' },
    { name: '父', share: '1/3' }
  ]
);

// ─────────────────────────────────────────────────────────
// 14. 全員放棄／不存在 → 相続人なし
// ─────────────────────────────────────────────────────────
const r14 = calculate({
  spouse: null,
  children: [person('子A', { renounced: true })],
  parents: [],
  siblings: []
});
if (r14.rows.length === 0 && r14.order === 'none') {
  pass++; console.log('  ✅ 14. 全員放棄/不存在 → 相続人なしと判定');
} else {
  fail++; console.log('  ❌ 14. 全員放棄/不存在'); console.log('     got:', JSON.stringify(r14.rows));
}

// =========================================================
//   R2 拡張ケース：半血兄弟・養子・欠格・廃除
// =========================================================

// 15. 配偶者＋全血兄1人＋半血弟1人
//     兄弟姉妹分1/4を、全血:半血 = 2:1 で分配 → 兄=2/3×1/4=1/6、半弟=1/3×1/4=1/12
//     検算: 3/4 + 1/6 + 1/12 = 9/12+2/12+1/12 = 12/12 ✅
check('15. 配偶者＋全血兄＋半血弟 → 配偶者3/4、兄1/6、半血弟1/12',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [],
    siblings: [
      person('兄'),
      person('半弟', { halfBlood: true })
    ]
  }),
  [
    { label: '配偶者', share: '3/4' },
    { name: '兄', share: '1/6' },
    { name: '半弟', share: '1/12' }
  ]
);

// 16. 配偶者なし＋全血2人＋半血1人
//     全血:全血:半血 = 2:2:1 で分配 → 各 2/5、2/5、1/5
check('16. 配偶者なし＋全血2人＋半血1人 → 全血2/5×2、半血1/5',
  calculate({
    spouse: null,
    children: [],
    parents: [],
    siblings: [
      person('兄'),
      person('姉'),
      person('半弟', { halfBlood: true })
    ]
  }),
  [
    { name: '兄', share: '2/5' },
    { name: '姉', share: '2/5' },
    { name: '半弟', share: '1/5' }
  ]
);

// 17. 子が「相続欠格」→ 代襲発生（放棄と違う）
//     配偶者＋欠格子1人(孫1人代襲) → 配偶者1/2、孫1/2
check('17. 配偶者＋欠格子(孫1人代襲) → 配偶者1/2、孫1/2',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('欠格子', { disqualified: true, descendants: [person('孫')] })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '孫', share: '1/2' }
  ]
);

// 18. 子が「相続廃除」→ 代襲発生
check('18. 配偶者＋廃除子(孫2人代襲) → 配偶者1/2、孫1/4ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('廃除子', { excluded: true, descendants: [person('孫A'), person('孫B')] })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '孫A', share: '1/4' },
    { name: '孫B', share: '1/4' }
  ]
);

// 19. 「放棄」と「欠格」の違い：欠格→孫代襲、放棄→系統消滅
//     配偶者＋放棄子1人(孫はいるが代襲しない)＋親 → 配偶者2/3、親1/3（親に順位移動）
check('19. 配偶者＋放棄子(孫いるが代襲なし)＋父 → 配偶者2/3、父1/3',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('放棄子', { renounced: true, descendants: [person('孫')] })
    ],
    parents: [person('父')],
    siblings: []
  }),
  [
    { label: '配偶者', share: '2/3' },
    { name: '父', share: '1/3' }
  ]
);

// 20. 普通養子は実子と同じ取り分
check('20. 配偶者＋実子＋普通養子 → 配偶者1/2、実子1/4、養子1/4',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('実子'),
      person('養子', { adopted: 'normal' })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '実子', share: '1/4' },
    { name: '養子', share: '1/4' }
  ]
);

// 21. 兄弟姉妹相続で被代襲者が半血 → 甥姪も半血扱い
//     配偶者なし、全血兄、半血弟（亡）→甥1人代襲
//     全血:半血 = 2:1 → 兄2/3、甥1/3
check('21. 配偶者なし＋全血兄＋亡半血弟(甥代襲) → 兄2/3、甥1/3',
  calculate({
    spouse: null,
    children: [],
    parents: [],
    siblings: [
      person('兄'),
      person('半弟', { halfBlood: true, alive: false, descendants: [person('甥')] })
    ]
  }),
  [
    { name: '兄', share: '2/3' },
    { name: '甥', share: '1/3' }
  ]
);

// 22. 半血兄弟だけのケース（全血なし）→ 半血同士で均等
check('22. 配偶者なし＋半血兄弟2人（全血なし） → 半血2人で1/2ずつ',
  calculate({
    spouse: null,
    children: [],
    parents: [],
    siblings: [
      person('半兄', { halfBlood: true }),
      person('半妹', { halfBlood: true })
    ]
  }),
  [
    { name: '半兄', share: '1/2' },
    { name: '半妹', share: '1/2' }
  ]
);

// 23. 配偶者＋実子＋特別養子（特別養子も計算上は子と同じ）
check('23. 配偶者＋実子＋特別養子 → 配偶者1/2、子1/4ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('実子'),
      person('特別養子', { adopted: 'special' })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '実子', share: '1/4' },
    { name: '特別養子', share: '1/4' }
  ]
);

// 24. 兄弟姉妹で「欠格」→ 甥姪代襲
check('24. 配偶者＋欠格兄(甥1人代襲)＋姉 → 配偶者3/4、姉1/8、甥1/8',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [],
    siblings: [
      person('欠格兄', { disqualified: true, descendants: [person('甥')] }),
      person('姉')
    ]
  }),
  [
    { label: '配偶者', share: '3/4' },
    { name: '甥', share: '1/8' },
    { name: '姉', share: '1/8' }
  ]
);

// =========================================================
//   R2.5 拡張：直系卑属の再代襲（無限）／直系尊属の祖父母世代
// =========================================================

// 25. 再代襲：子(亡)→ 孫(亡)→ ひ孫2人(生存)、配偶者あり
//     配偶者1/2、ひ孫1/4ずつ（ひ孫が孫の系統を等分）
check('25. 配偶者＋亡子→亡孫→ひ孫2人 → 配偶者1/2、ひ孫1/4ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('亡子', {
        alive: false,
        descendants: [
          person('亡孫', {
            alive: false,
            descendants: [person('ひ孫A'), person('ひ孫B')]
          })
        ]
      })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: 'ひ孫A', share: '1/4' },
    { name: 'ひ孫B', share: '1/4' }
  ]
);

// 26. 配偶者＋父母不在＋祖父母3人 → 配偶者2/3、祖父母1/9ずつ
check('26. 配偶者＋父母全員他界＋祖父母3人 → 配偶者2/3、祖父母1/9ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [person('父', { alive: false }), person('母', { alive: false })],
    grandparents: [person('父方祖父'), person('父方祖母'), person('母方祖母')],
    siblings: []
  }),
  [
    { label: '配偶者', share: '2/3' },
    { name: '父方祖父', share: '1/9' },
    { name: '父方祖母', share: '1/9' },
    { name: '母方祖母', share: '1/9' }
  ]
);

// 27. 配偶者＋父1人生存＋祖父母もいる → 父優先、祖父母は相続せず
check('27. 配偶者＋父生存＋祖父母も存命 → 父優先、配偶者2/3、父1/3',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [person('父'), person('母', { alive: false })],
    grandparents: [person('父方祖父'), person('父方祖母')],
    siblings: []
  }),
  [
    { label: '配偶者', share: '2/3' },
    { name: '父', share: '1/3' }
  ]
);

// 28. 配偶者＋父母不在＋祖父母も全員不在＋兄弟2人 → 第3順位へ
check('28. 配偶者＋父母祖父母全員他界＋兄弟2人 → 配偶者3/4、兄弟1/8ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [],
    parents: [person('父', { alive: false }), person('母', { alive: false })],
    grandparents: [
      person('父方祖父', { alive: false }),
      person('父方祖母', { alive: false }),
      person('母方祖父', { alive: false }),
      person('母方祖母', { alive: false })
    ],
    siblings: [person('兄'), person('妹')]
  }),
  [
    { label: '配偶者', share: '3/4' },
    { name: '兄', share: '1/8' },
    { name: '妹', share: '1/8' }
  ]
);

// 29. 子A欠格→孫A1も他界→ひ孫1人 → 連続代襲で配偶者1/2、ひ孫1/2
check('29. 配偶者＋欠格子→亡孫→ひ孫1人 → 配偶者1/2、ひ孫1/2',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('欠格子', {
        disqualified: true,
        descendants: [
          person('亡孫', { alive: false, descendants: [person('ひ孫')] })
        ]
      })
    ],
    parents: [],
    siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: 'ひ孫', share: '1/2' }
  ]
);

// 30. 子A放棄、孫はいるが代襲なし、父母不在、祖父母1人生存 → 祖父母へ
check('30. 配偶者＋放棄子(孫いるが代襲なし)＋父母不在＋祖父母1人 → 配偶者2/3、祖父1/3',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [
      person('放棄子', { renounced: true, descendants: [person('孫')] })
    ],
    parents: [person('父', { alive: false }), person('母', { alive: false })],
    grandparents: [person('祖父')],
    siblings: []
  }),
  [
    { label: '配偶者', share: '2/3' },
    { name: '祖父', share: '1/3' }
  ]
);

// 31. 孫の代で生存と死亡が混在＋ひ孫
//     子(亡)→ 孫A(生存)、孫B(亡)→ひ孫B1, ひ孫B2
//     子の取り分1（配偶者なし、子1系統のみ）→ 孫の代で2分割→ A=1/2, B系統=1/2 → ひ孫1/4ずつ
check('31. 配偶者なし＋亡子→{生孫A、亡孫B→ひ孫2人} → 孫A=1/2、ひ孫=1/4ずつ',
  calculate({
    spouse: null,
    children: [
      person('亡子', {
        alive: false,
        descendants: [
          person('孫A'),
          person('亡孫B', { alive: false, descendants: [person('ひ孫B1'), person('ひ孫B2')] })
        ]
      })
    ],
    parents: [],
    siblings: []
  }),
  [
    { name: '孫A', share: '1/2' },
    { name: 'ひ孫B1', share: '1/4' },
    { name: 'ひ孫B2', share: '1/4' }
  ]
);

// =========================================================
//   R4 数次相続（兄弟姉妹・1段階）
// =========================================================

// 32. 数次相続の基本：C(独身/子なし/親なし)＋兄B(被相続人より後に死亡)＋Bの配偶者D・子E・子F
//     C死亡時点でBが単独相続人（取り分1） → Bの死亡でDとEFに承継：D 1/2, E 1/4, F 1/4
check('32. 数次相続：C→兄B(後死)→Bの配偶者D・子E・子F → D=1/2, E=1/4, F=1/4',
  calculateExtended({
    spouse: null,
    children: [],
    parents: [],
    siblings: [
      person('兄B', {
        alive: false,
        diedAfter: true,
        successors: {
          spouse: { present: true, alive: true, name: 'D' },
          children: [person('E'), person('F')]
        }
      })
    ]
  }),
  [
    { name: 'D', share: '1/2' },
    { name: 'E', share: '1/4' },
    { name: 'F', share: '1/4' }
  ]
);

// 33. 配偶者あり・兄(後死)＋姉(生存)
//     C: 配偶者X 3/4、兄弟分 1/4 を 2系統 = B 1/8, Z 1/8
//     Bの数次相続：B 1/8 を Bの配偶者D・子E に分配 → D 1/16, E 1/16
//     合計：X=3/4, Z=1/8, D=1/16, E=1/16   検算=12+2+1+1=16/16
check('33. 配偶者X＋兄B(後死,Bに配D・子E)＋姉Z → X=3/4, Z=1/8, D=1/16, E=1/16',
  calculateExtended({
    spouse: { present: true, alive: true, renounced: false, name: 'X' },
    children: [],
    parents: [],
    siblings: [
      person('B', {
        alive: false,
        diedAfter: true,
        successors: {
          spouse: { present: true, alive: true, name: 'D' },
          children: [person('E')]
        }
      }),
      person('Z')
    ]
  }),
  [
    { name: 'X', share: '3/4' },
    { name: 'Z', share: '1/8' },
    { name: 'D', share: '1/16' },
    { name: 'E', share: '1/16' }
  ]
);

// 34. 後死の方に相続人がいない（successors空） → ⚠ 警告行を出す
{
  const r = calculateExtended({
    spouse: null,
    children: [],
    parents: [],
    siblings: [
      person('独身兄', { alive: false, diedAfter: true, successors: { spouse: null, children: [] } })
    ]
  });
  if (r.rows.length === 1 && /承継先/.test(r.rows[0].label)) {
    pass++; console.log('  ✅ 34. 後死の方に相続人なし → 警告行が出る');
  } else {
    fail++; console.log('  ❌ 34. 後死の方に相続人なし', JSON.stringify(r.rows));
  }
}

// 35. 数次相続なしの入力でも calculateExtended が calculate と同じ結果を返す（後方互換）
{
  const inp = {
    spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
    children: [person('子A'), person('子B')],
    parents: [], siblings: []
  };
  const r1 = calculate(inp).rows.map(r => formatFrac(r.share));
  const r2 = calculateExtended(inp).rows.map(r => formatFrac(r.share));
  if (JSON.stringify(r1) === JSON.stringify(r2)) {
    pass++; console.log('  ✅ 35. 数次なし入力では calculate と calculateExtended が同結果');
  } else {
    fail++; console.log('  ❌ 35. 後方互換', r1, r2);
  }
}

// 36. 子側の数次相続：配偶者X＋子A(後死、Aに配偶者P・子Q)
//     C: X 1/2, A 1/2  →  Aの数次：A 1/2 を P 1/2, Q 1/2 で分配 → P 1/4, Q 1/4
check('36. 配偶者X＋子A(後死,Aに配P・子Q) → X=1/2, P=1/4, Q=1/4',
  calculateExtended({
    spouse: { present: true, alive: true, renounced: false, name: 'X' },
    children: [
      person('A', {
        alive: false,
        diedAfter: true,
        successors: {
          spouse: { present: true, alive: true, name: 'P' },
          children: [person('Q')]
        }
      })
    ],
    parents: [], siblings: []
  }),
  [
    { name: 'X', share: '1/2' },
    { name: 'P', share: '1/4' },
    { name: 'Q', share: '1/4' }
  ]
);

// 37. 2段階の数次相続：兄B(後死)→Bの子E(後死)→Eの子G
//     C: B 単独 → B 1 → Bの数次でEに → Eの数次でGに → G 1
check('37. 2段階の数次相続：兄B(後死)→E(後死)→Eの子G → G=1',
  calculateExtended({
    spouse: null,
    children: [],
    parents: [],
    siblings: [
      person('兄B', {
        alive: false,
        diedAfter: true,
        successors: {
          spouse: null,
          children: [
            person('E', {
              alive: false,
              diedAfter: true,
              successors: {
                spouse: null,
                children: [person('G')]
              }
            })
          ]
        }
      })
    ]
  }),
  [
    { name: 'G', share: '1' }
  ]
);

// 38. PDF1のCケース：C(独身,子なし,親なし)＋兄B(後死,Bに配D・子E後死/Eに子G・子F生存)
//     C: B 単独 → B 1
//     Bの数次：B 1 → D 1/2, EF系統 1/2 を E,F 2分割 → E 1/4, F 1/4
//     Eの数次：E 1/4 → G 1
//     最終: D 1/2, F 1/4, G 1/4
check('38. PDFのC例：兄B(後死)＋[D, F, E(後死→G)] → D=1/2, F=1/4, G=1/4',
  calculateExtended({
    spouse: null,
    children: [],
    parents: [],
    siblings: [
      person('兄B', {
        alive: false,
        diedAfter: true,
        successors: {
          spouse: { present: true, alive: true, name: 'D' },
          children: [
            person('E', {
              alive: false,
              diedAfter: true,
              successors: {
                spouse: null,
                children: [person('G')]
              }
            }),
            person('F')
          ]
        }
      })
    ]
  }),
  [
    { name: 'D', share: '1/2' },
    { name: 'G', share: '1/4' },
    { name: 'F', share: '1/4' }
  ]
);

// ─────────────────────────────────────────────────────────
// 同時死亡の推定（民法32条の2）
// ─────────────────────────────────────────────────────────

// 39. 配偶者と本人が同時死亡 → 配偶者は相続せず、子のみ
check('39. 同時死亡：配偶者(同時死亡)＋子2人 → 子1/2ずつ',
  calculate({
    spouse: { present: true, alive: true, simultaneousDeath: true, renounced: false, name: '配' },
    children: [person('子A'), person('子B')],
    parents: [], siblings: []
  }),
  [
    { name: '子A', share: '1/2' },
    { name: '子B', share: '1/2' }
  ]
);

// 40. 子と本人が同時死亡 → 子は相続せず、孫が代襲
check('40. 同時死亡：配偶者＋子A(同時死亡,孫2人)＋子B → 配偶者1/2、子B1/4、孫1/8ずつ',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配' },
    children: [
      person('子A', { alive: true, simultaneousDeath: true,
        descendants: [person('孫A1'), person('孫A2')] }),
      person('子B')
    ],
    parents: [], siblings: []
  }),
  [
    { label: '配偶者', share: '1/2' },
    { name: '子B', share: '1/4' },
    { name: '孫A1', share: '1/8' },
    { name: '孫A2', share: '1/8' }
  ]
);

// 41. 兄弟と本人が同時死亡 → 兄は相続せず、甥が代襲
check('41. 同時死亡：配偶者＋兄(同時死亡,甥1人) → 配偶者3/4、甥1/4',
  calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配' },
    children: [], parents: [],
    siblings: [
      person('兄', { alive: true, simultaneousDeath: true,
        descendants: [person('甥')] })
    ]
  }),
  [
    { label: '配偶者', share: '3/4' },
    { name: '甥', share: '1/4' }
  ]
);

// 42. 同時死亡だが下に誰もいない → 系統消滅で次順位へ
check('42. 同時死亡：子A(同時死亡,子なし)＋父母 → 父母のみ1/2ずつ',
  calculate({
    spouse: null,
    children: [
      person('子A', { alive: true, simultaneousDeath: true, descendants: [] })
    ],
    parents: [person('父'), person('母')],
    siblings: []
  }),
  [
    { name: '父', share: '1/2' },
    { name: '母', share: '1/2' }
  ]
);

// 43. 引用条文に「民法32条の2」が含まれる
{
  const r = calculate({
    spouse: { present: true, alive: true, renounced: false, name: '配' },
    children: [person('子A', { alive: true, simultaneousDeath: true,
      descendants: [person('孫A')] })],
    parents: [], siblings: []
  });
  if (r.citations.includes('民法32条の2')) {
    pass++; console.log('  ✅ 43. 同時死亡で 民法32条の2 が引用される');
  } else {
    fail++; console.log('  ❌ 43. 同時死亡の引用', r.citations);
  }
}

// ─────────────────────────────────────────────────────────
// 集計
// ─────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────`);
console.log(`  合計: ${pass + fail} 件　 ✅ Pass: ${pass}　❌ Fail: ${fail}`);
console.log(`────────────────────────────────────────────────`);

if (fail > 0) {
  process.exitCode = 1;
}
