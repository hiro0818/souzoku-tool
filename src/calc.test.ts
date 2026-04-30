/* 法定相続分 計算ロジック 検証スクリプト（vitest版）
   元 test.cjs を vitest に移植 */
import { describe, it, expect } from 'vitest';
import { calculate, calculateExtended, formatFrac } from './calc';
import type { Person, ResultRow } from './types';

function person(name: string, opts: Partial<Person> = {}): Person {
  return { name, alive: true, renounced: false, descendants: [], ...opts };
}

interface Expected {
  label?: string;
  name?: string;
  share: string;
}

function checkRows(rows: ResultRow[], expected: Expected[]) {
  const got = rows.map(r => ({
    name: (r.person as { name?: string } | null)?.name,
    label: r.label,
    share: formatFrac(r.share)
  }));
  const remain = [...got];
  for (const ex of expected) {
    const i = remain.findIndex(g =>
      (ex.name == null || g.name === ex.name) &&
      (ex.label == null || g.label === ex.label) &&
      g.share === ex.share
    );
    expect(i, `期待値が見つからない: ${JSON.stringify(ex)} / got: ${JSON.stringify(got)}`).toBeGreaterThanOrEqual(0);
    remain.splice(i, 1);
  }
  expect(remain.length, `想定外の結果が混入: ${JSON.stringify(remain)}`).toBe(0);
}

describe('法定相続分 計算ロジック', () => {
  describe('基本3ケース', () => {
    it('1. 配偶者＋子2人 → 配偶者1/2、子1/4ずつ', () => {
      checkRows(calculate({
        spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
        children: [person('子A'), person('子B')],
        parents: [], siblings: []
      }).rows, [
        { label: '配偶者', share: '1/2' },
        { name: '子A', share: '1/4' },
        { name: '子B', share: '1/4' }
      ]);
    });

    it('3. 配偶者＋父母 → 配偶者2/3、親1/6ずつ', () => {
      checkRows(calculate({
        spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
        children: [],
        parents: [person('父'), person('母')],
        siblings: []
      }).rows, [
        { label: '配偶者', share: '2/3' },
        { name: '父', share: '1/6' },
        { name: '母', share: '1/6' }
      ]);
    });
  });

  describe('代襲相続', () => {
    it('配偶者＋子(亡)→孫2人代襲 → 配偶者1/2、孫1/4ずつ', () => {
      checkRows(calculate({
        spouse: { present: true, alive: true, renounced: false, name: '配偶者' },
        children: [
          person('亡子', { alive: false, descendants: [person('孫A'), person('孫B')] })
        ],
        parents: [], siblings: []
      }).rows, [
        { label: '配偶者', share: '1/2' },
        { name: '孫A', share: '1/4' },
        { name: '孫B', share: '1/4' }
      ]);
    });

    it('再代襲(2段)：亡子→亡孫→ひ孫2人 → ひ孫1/2ずつ', () => {
      checkRows(calculate({
        spouse: null,
        children: [
          person('亡子', { alive: false, descendants: [
            person('亡孫', { alive: false, descendants: [person('ひ孫1'), person('ひ孫2')] })
          ]})
        ],
        parents: [], siblings: []
      }).rows, [
        { name: 'ひ孫1', share: '1/2' },
        { name: 'ひ孫2', share: '1/2' }
      ]);
    });
  });

  describe('半血兄弟', () => {
    it('全血兄+半血弟 → 兄2/3、弟1/3', () => {
      checkRows(calculate({
        spouse: null, children: [], parents: [],
        siblings: [
          person('兄', { halfBlood: false }),
          person('弟', { halfBlood: true })
        ]
      }).rows, [
        { name: '兄', share: '2/3' },
        { name: '弟', share: '1/3' }
      ]);
    });
  });

  describe('数次相続', () => {
    it('配偶者X＋子A(後死,Aに配P・子Q) → X=1/2, P=1/4, Q=1/4', () => {
      checkRows(calculateExtended({
        spouse: { present: true, alive: true, renounced: false, name: 'X' },
        children: [
          person('A', {
            alive: false, diedAfter: true,
            successors: {
              spouse: { present: true, alive: true, name: 'P' },
              children: [person('Q')]
            }
          })
        ],
        parents: [], siblings: []
      }).rows, [
        { name: 'X', share: '1/2' },
        { name: 'P', share: '1/4' },
        { name: 'Q', share: '1/4' }
      ]);
    });

    it('PDFのC例：兄B(後死)+[D, F, E(後死→G)] → D=1/2, F=1/4, G=1/4', () => {
      checkRows(calculateExtended({
        spouse: null, children: [], parents: [],
        siblings: [
          person('兄B', {
            alive: false, diedAfter: true,
            successors: {
              spouse: { present: true, alive: true, name: 'D' },
              children: [
                person('E', {
                  alive: false, diedAfter: true,
                  successors: { spouse: null, children: [person('G')] }
                }),
                person('F')
              ]
            }
          })
        ]
      }).rows, [
        { name: 'D', share: '1/2' },
        { name: 'G', share: '1/4' },
        { name: 'F', share: '1/4' }
      ]);
    });
  });

  describe('同時死亡の推定（民法32条の2）', () => {
    it('配偶者(同時死亡)＋子2人 → 子1/2ずつ', () => {
      checkRows(calculate({
        spouse: { present: true, alive: true, simultaneousDeath: true, renounced: false, name: '配' },
        children: [person('子A'), person('子B')],
        parents: [], siblings: []
      }).rows, [
        { name: '子A', share: '1/2' },
        { name: '子B', share: '1/2' }
      ]);
    });

    it('子A(同時死亡,孫2人)＋子B → 配偶者1/2、子B1/4、孫1/8ずつ', () => {
      checkRows(calculate({
        spouse: { present: true, alive: true, renounced: false, name: '配' },
        children: [
          person('子A', { alive: true, simultaneousDeath: true,
            descendants: [person('孫A1'), person('孫A2')] }),
          person('子B')
        ],
        parents: [], siblings: []
      }).rows, [
        { label: '配偶者', share: '1/2' },
        { name: '子B', share: '1/4' },
        { name: '孫A1', share: '1/8' },
        { name: '孫A2', share: '1/8' }
      ]);
    });

    it('兄(同時死亡,甥1人) → 配偶者3/4、甥1/4', () => {
      checkRows(calculate({
        spouse: { present: true, alive: true, renounced: false, name: '配' },
        children: [], parents: [],
        siblings: [
          person('兄', { alive: true, simultaneousDeath: true,
            descendants: [person('甥')] })
        ]
      }).rows, [
        { label: '配偶者', share: '3/4' },
        { name: '甥', share: '1/4' }
      ]);
    });

    it('引用条文に「民法32条の2」が含まれる', () => {
      const r = calculate({
        spouse: { present: true, alive: true, renounced: false, name: '配' },
        children: [person('子A', { alive: true, simultaneousDeath: true,
          descendants: [person('孫A')] })],
        parents: [], siblings: []
      });
      expect(r.citations).toContain('民法32条の2');
    });
  });

  describe('養子・欠格・廃除', () => {
    it('普通養子は実子と同じ取り分', () => {
      const r = calculate({
        spouse: { present: true, alive: true, renounced: false, name: '配' },
        children: [
          person('実子'),
          person('養子', { adopted: 'normal' })
        ],
        parents: [], siblings: []
      });
      checkRows(r.rows, [
        { label: '配偶者', share: '1/2' },
        { name: '実子', share: '1/4' },
        { name: '養子', share: '1/4' }
      ]);
    });

    it('欠格者は失権するが孫が代襲', () => {
      checkRows(calculate({
        spouse: null,
        children: [
          person('欠格者', { disqualified: true, descendants: [person('孫')] })
        ],
        parents: [], siblings: []
      }).rows, [
        { name: '孫', share: '1' }
      ]);
    });
  });

  describe('放棄', () => {
    it('子全員放棄→父母へ', () => {
      checkRows(calculate({
        spouse: { present: true, alive: true, renounced: false, name: '配' },
        children: [person('子', { renounced: true })],
        parents: [person('父'), person('母')],
        siblings: []
      }).rows, [
        { label: '配偶者', share: '2/3' },
        { name: '父', share: '1/6' },
        { name: '母', share: '1/6' }
      ]);
    });
  });
});

describe('数次×代襲のクロス（実務ベンチマーク）', () => {
  it('兄弟B(後死)→Bの子A(先死=代襲)→A1,A2 ＋ Bの子AA', () => {
    const r = calculateExtended({
      spouse: null,
      children: [],
      parents: [],
      siblings: [
        person('兄B', {
          alive: false, diedAfter: true,
          successors: {
            spouse: { present: true, alive: true, name: 'BSpouse' },
            children: [
              person('A', {
                alive: false,  // 先死亡＝代襲
                descendants: [person('A1'), person('A2')]
              }),
              person('AA')
            ]
          }
        })
      ]
    });
    // B 単独相続：1
    // → BSpouse 1/2、子全体 1/2
    //   → A(代襲) 1/4 → A1 1/8, A2 1/8
    //   → AA 1/4
    checkRows(r.rows, [
      { name: 'BSpouse', share: '1/2' },
      { name: 'A1', share: '1/8' },
      { name: 'A2', share: '1/8' },
      { name: 'AA', share: '1/4' }
    ]);
  });

  it('兄弟B(後死)→Bの子A(先死,代襲なし＝失権) → 残った子へ', () => {
    const r = calculateExtended({
      spouse: null, children: [], parents: [],
      siblings: [
        person('兄B', {
          alive: false, diedAfter: true,
          successors: {
            spouse: null,
            children: [
              person('A', { alive: false, descendants: [] }),  // 子も孫もなし
              person('AA')
            ]
          }
        })
      ]
    });
    // B 1 → AAのみ生存 → AA 1
    checkRows(r.rows, [{ name: 'AA', share: '1' }]);
  });

  it('実例風：兄弟C(後死)＋兄弟D(後死,代襲混在)＋兄弟E(先死,甥)', () => {
    const r = calculateExtended({
      spouse: null, children: [], parents: [],
      siblings: [
        // C：後死亡、配偶者と子1人
        person('C', {
          alive: false, diedAfter: true,
          successors: {
            spouse: { present: true, alive: true, name: 'CSp' },
            children: [person('CC')]
          }
        }),
        // D：後死亡、配偶者と「先死亡の子（=代襲する孫）」
        person('D', {
          alive: false, diedAfter: true,
          successors: {
            spouse: { present: true, alive: true, name: 'DSp' },
            children: [
              person('DA', {
                alive: false,
                descendants: [person('DA1'), person('DA2')]
              })
            ]
          }
        }),
        // E：先死亡（兄弟側代襲）、甥1人
        person('E', {
          alive: false,
          descendants: [person('Eニス')]
        })
      ]
    });
    // C, D, E が全血兄弟3人扱い → 各 1/3
    // C 1/3 → CSp 1/6, CC 1/6
    // D 1/3 → DSp 1/6, DA(代襲) → DA1 1/12, DA2 1/12
    // E 1/3 → Eニス 1/3 (兄弟側代襲)
    checkRows(r.rows, [
      { name: 'CSp', share: '1/6' },
      { name: 'CC', share: '1/6' },
      { name: 'DSp', share: '1/6' },
      { name: 'DA1', share: '1/12' },
      { name: 'DA2', share: '1/12' },
      { name: 'Eニス', share: '1/3' }
    ]);
  });
});
