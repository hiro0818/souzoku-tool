/* =========================================================
   法定相続分 計算ロジック（純粋関数）
   ブラウザ：window.SouzokuCalc に公開
   Node.js ：module.exports に公開

   対応スコープ：
     - 配偶者（民法890条）
     - 第1順位：子＋直系卑属の再代襲（無限）
     - 第2順位：直系尊属（父母→祖父母→…と世代単位で繰り上がる）
     - 第3順位：兄弟姉妹＋甥姪（1代限り）
     - 半血兄弟（民法900条4号但書）
     - 養子（普通／特別）
     - 相続放棄（系統消滅・代襲なし）
     - 相続欠格／廃除（代襲発生）
     - 数次相続（再帰展開：子・兄弟姉妹側ともに対応）
     - 同時死亡の推定（民法32条の2：互いに相続しない／代襲はある）
   未対応（R3以降）：ビジュアル編集
   ========================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SouzokuCalc = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; };
  const reduce = (f) => { const g = gcd(f.n, f.d); return { n: f.n / g, d: f.d / g }; };
  const mul = (a, b) => reduce({ n: a.n * b.n, d: a.d * b.d });
  const add = (a, b) => reduce({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
  const formatFrac = (f) => f.n === 0 ? '0' : (f.d === 1 ? `${f.n}` : `${f.n}/${f.d}`);

  // 欠格・廃除：本人は失権するが「代襲原因」になる（放棄と区別）
  const isLostQualified = (p) => !!(p && (p.disqualified || p.excluded));
  // 同時死亡の推定（民法32条の2）：互いに相続しない＝相続資格なし扱い、ただし代襲は発生
  const isSimultDead = (p) => !!(p && p.simultaneousDeath);
  // 相続資格：生存・同時死亡でない・非放棄・非失権
  const isHeir = (p) => !!(p && p.alive && !isSimultDead(p) && !p.renounced && !isLostQualified(p));
  // 「実際に取り分を受け取れる」状態（self ライン判定用）
  const canTakeSelf = (p) => !!(p && p.alive && !isSimultDead(p) && !isLostQualified(p));

  function adoptedNote(p) {
    if (!p) return '';
    if (p.adopted === 'normal') return '（普通養子）';
    if (p.adopted === 'special') return '（特別養子）';
    return '';
  }

  // 子孫サブツリーに「相続できる人」が一人でもいるか（放棄なら系統消滅）
  function hasAnyHeirInSubtree(nodes) {
    for (const n of (nodes || [])) {
      if (n.renounced) continue;
      if (canTakeSelf(n)) return true;
      if (hasAnyHeirInSubtree(n.descendants)) return true;
    }
    return false;
  }

  // 子の系統情報
  // 戻り値：[{ origin: 元の子, kind: 'self'|'descendants' }]
  function buildChildLines(children) {
    const lines = [];
    for (const c of (children || [])) {
      if (c.renounced) continue;
      if (canTakeSelf(c)) {
        lines.push({ origin: c, kind: 'self' });
      } else {
        if (hasAnyHeirInSubtree(c.descendants)) {
          lines.push({ origin: c, kind: 'descendants' });
        }
      }
    }
    return lines;
  }

  // 子孫を再帰的に展開して、各受取人と取り分を返す（直系卑属の再代襲：無限）
  // depth 1 = 孫, 2 = ひ孫, 3 = 玄孫, ...
  function distributeDescendants(share, descendants, depth) {
    // 放棄者を除外（放棄＝はじめから相続人でない、再代襲なし）
    const valid = (descendants || []).filter(d => !d.renounced);
    // valid のうち「適格者または、その下に適格者がいる」だけを残す
    const aliveLines = valid.filter(d => canTakeSelf(d) || hasAnyHeirInSubtree(d.descendants));
    if (aliveLines.length === 0) return [];
    const each = mul(share, { n: 1, d: aliveLines.length });
    const result = [];
    for (const d of aliveLines) {
      if (canTakeSelf(d)) {
        const label = depth === 1 ? '孫（代襲）' : depth === 2 ? 'ひ孫（再代襲）' : `直系卑属（${depth}代下）`;
        result.push({ person: d, share: each, label });
      } else {
        result.push(...distributeDescendants(each, d.descendants, depth + 1));
      }
    }
    return result;
  }

  // 直系尊属：世代単位で繰り上がる
  // input.parents（父母）→ いない・全員不適格なら input.grandparents（祖父母）→ 曾祖父母…
  // 戻り値：{ persons: 適格者リスト, generation: 'parents'|'grandparents'|... }
  function findAscendantGeneration(input) {
    const gens = [
      { key: 'parents', label: '父母', list: input.parents || [] },
      { key: 'grandparents', label: '祖父母', list: input.grandparents || [] }
      // 曾祖父母以降は実用上稀のため未実装（必要になれば追加）
    ];
    for (const g of gens) {
      const eligible = g.list.filter(isHeir);
      if (eligible.length > 0) return { persons: eligible, generation: g.key, label: g.label };
    }
    return { persons: [], generation: null, label: null };
  }

  // 兄弟姉妹の代襲（1代限り）
  function buildSiblingLines(siblings) {
    const lines = [];
    for (const s of (siblings || [])) {
      if (s.renounced) continue;
      const halfBlood = !!s.halfBlood;
      if (canTakeSelf(s)) {
        lines.push({ persons: [s], origin: s, halfBlood });
      } else {
        const nieces = (s.descendants || []).filter(isHeir); // 1代限りなのでフィルタのみ
        if (nieces.length > 0) lines.push({ persons: nieces, origin: s, halfBlood });
      }
    }
    return lines;
  }

  function calculate(input) {
    const explanations = [];
    const cites = new Set();

    const spouse = input.spouse;
    const spouseEligible = spouse && spouse.present && spouse.alive && !isSimultDead(spouse) && !spouse.renounced;
    if (spouse && spouse.present) cites.add('民法890条');

    const childLines = buildChildLines(input.children || []);
    const ascend = findAscendantGeneration(input);
    const siblingLines = buildSiblingLines(input.siblings || []);

    let order;
    if (childLines.length > 0) order = 'children';
    else if (ascend.persons.length > 0) order = 'ascendants';
    else if (siblingLines.length > 0) order = 'siblings';
    else if (spouseEligible) order = 'spouseOnly';
    else order = 'none';

    let spouseShare = null;
    let restShare = null;

    if (spouseEligible) {
      if (order === 'children')      { spouseShare = {n:1, d:2}; restShare = {n:1, d:2}; cites.add('民法900条1号'); explanations.push('配偶者と子（直系卑属）が相続人。配偶者は1/2、子（系統）は1/2を均等に分ける。'); }
      else if (order === 'ascendants') { spouseShare = {n:2, d:3}; restShare = {n:1, d:3}; cites.add('民法900条2号'); explanations.push(`配偶者と直系尊属（${ascend.label}）が相続人。配偶者は2/3、直系尊属は1/3を均等に分ける。`); }
      else if (order === 'siblings') { spouseShare = {n:3, d:4}; restShare = {n:1, d:4}; cites.add('民法900条3号'); explanations.push('配偶者と兄弟姉妹が相続人。配偶者は3/4、兄弟姉妹は1/4を均等に分ける。'); }
      else if (order === 'spouseOnly') { spouseShare = {n:1, d:1}; restShare = null; explanations.push('血族相続人がいない（または全員放棄）ため、配偶者が単独で相続。'); }
    } else {
      if (order === 'children')      { restShare = {n:1, d:1}; cites.add('民法900条4号'); explanations.push('配偶者なし。子（直系卑属）のみで均等に相続。'); }
      else if (order === 'ascendants') { restShare = {n:1, d:1}; cites.add('民法900条4号'); explanations.push(`配偶者・子なし。直系尊属（${ascend.label}）で均等に相続。`); }
      else if (order === 'siblings') { restShare = {n:1, d:1}; cites.add('民法900条4号'); explanations.push('配偶者・子・直系尊属なし。兄弟姉妹で均等に相続。'); }
    }

    const resultRows = [];
    if (spouseShare) {
      resultRows.push({ label: '配偶者', person: spouse, share: spouseShare, note: '' });
    }

    if (restShare) {
      if (order === 'children') {
        const lineCount = childLines.length;
        const perLine = mul(restShare, { n: 1, d: lineCount });
        let representativeAnnounced = false;
        childLines.forEach((line) => {
          if (line.kind === 'self') {
            resultRows.push({
              label: '子' + adoptedNote(line.origin),
              person: line.origin,
              share: perLine,
              note: ''
            });
          } else {
            const subRows = distributeDescendants(perLine, line.origin.descendants, 1);
            const cause = isSimultDead(line.origin) ? '同時死亡の推定により'
                       : !line.origin.alive ? '亡くなったため'
                       : line.origin.disqualified ? '相続欠格のため'
                       : line.origin.excluded ? '相続廃除のため'
                       : '';
            subRows.forEach(r => {
              resultRows.push({ label: r.label, person: r.person, share: r.share, note: '代襲相続' });
            });
            cites.add('民法887条2項');
            // ひ孫以下が含まれているなら3項（再代襲）
            if (subRows.some(r => /ひ孫|直系卑属/.test(r.label))) cites.add('民法887条3項');
            if (line.origin.disqualified) cites.add('民法891条');
            if (line.origin.excluded) cites.add('民法892条');
            if (isSimultDead(line.origin)) cites.add('民法32条の2');
            if (!representativeAnnounced && cause) {
              explanations.push(`子（${line.origin.name || ''}）が${cause}、その子（孫）以下が代襲相続。`);
              representativeAnnounced = true;
            }
          }
        });
      } else if (order === 'ascendants') {
        const n = ascend.persons.length;
        const each = mul(restShare, { n: 1, d: n });
        const genLabel = ascend.generation === 'parents' ? '直系尊属' : `直系尊属（${ascend.label}）`;
        ascend.persons.forEach((p) => resultRows.push({ label: genLabel, person: p, share: each, note: '' }));
        if (ascend.generation === 'grandparents') {
          explanations.push('父母が全員亡くなっている（または不適格）ため、直系尊属の世代を祖父母に繰り上げて相続。');
        }
      } else if (order === 'siblings') {
        const lineUnits = siblingLines.map(line => ({ line, units: line.halfBlood ? 1 : 2 }));
        const totalUnits = lineUnits.reduce((acc, x) => acc + x.units, 0);
        const hasMix = lineUnits.some(x => x.line.halfBlood) && lineUnits.some(x => !x.line.halfBlood);
        if (hasMix) {
          cites.add('民法900条4号但書');
          explanations.push('父母の一方のみ同じ兄弟姉妹（半血）は、父母双方が同じ兄弟姉妹（全血）の1/2の相続分（民法900条4号但書）。');
        }
        let representativeAnnounced = false;
        lineUnits.forEach(({ line, units }) => {
          const linePortion = mul(restShare, { n: units, d: totalUnits });
          const halfTag = line.halfBlood ? '（半血）' : '';
          if (line.persons.length === 1 && line.persons[0] === line.origin) {
            resultRows.push({
              label: '兄弟姉妹' + halfTag,
              person: line.persons[0],
              share: linePortion,
              note: ''
            });
          } else {
            const each = line.persons.length === 1 ? linePortion : mul(linePortion, { n: 1, d: line.persons.length });
            const cause = isSimultDead(line.origin) ? '同時死亡の推定により'
                       : !line.origin.alive ? '亡くなったため'
                       : line.origin.disqualified ? '相続欠格のため'
                       : line.origin.excluded ? '相続廃除のため'
                       : '';
            line.persons.forEach((g) => {
              resultRows.push({ label: '甥姪（代襲）' + halfTag, person: g, share: each, note: '代襲相続' });
            });
            cites.add('民法889条2項');
            if (line.origin.disqualified) cites.add('民法891条');
            if (line.origin.excluded) cites.add('民法892条');
            if (isSimultDead(line.origin)) cites.add('民法32条の2');
            if (!representativeAnnounced && cause) {
              explanations.push(`兄弟姉妹（${line.origin.name || ''}）が${cause}、その子（甥姪）が代襲相続。`);
              representativeAnnounced = true;
            }
          }
        });
      }
    }

    // 放棄が1件でもあるなら939条
    const anyRenounced = (input.children || []).some(c => c.renounced) ||
                        (input.siblings || []).some(s => s.renounced) ||
                        (spouse && spouse.renounced);
    if (anyRenounced) cites.add('民法939条');

    // 同時死亡が1件でもあるなら32条の2
    const anySimultDead = (input.children || []).some(isSimultDead) ||
                         (input.siblings || []).some(isSimultDead) ||
                         (spouse && isSimultDead(spouse));
    if (anySimultDead) {
      cites.add('民法32条の2');
      explanations.push('同時死亡の推定（民法32条の2）：互いに相続人にはなりませんが、その方の子・孫等は代襲相続できます。');
    }

    if (order === 'none') {
      explanations.push('該当する相続人がいません（全員放棄等）。');
    }

    return {
      rows: resultRows,
      explanations,
      citations: Array.from(cites),
      order
    };
  }

  /* =========================================================
     数次相続対応版
     被相続人 X の相続人として一旦受け取った人が、X の死亡後（手続き完了前）
     に亡くなった場合（diedAfter=true）、その人の取り分はその人の相続人へ承継。
     現バージョンは「兄弟姉妹の1段階の数次相続」までを正確に扱う。
     ========================================================= */
  function calculateExtended(input) {
    // 子・兄弟姉妹のうち diedAfter=true の方を「生存扱い」に置換し、_origIdx/_kind で元入力と対応
    const transformedChildren = (input.children || []).map((c, i) =>
      c.diedAfter
        ? { ...c, alive: true, descendants: [], _origIdx: i, _kind: 'child' }
        : { ...c, _origIdx: i, _kind: 'child' }
    );
    const transformedSiblings = (input.siblings || []).map((s, i) =>
      s.diedAfter
        ? { ...s, alive: true, descendants: [], _origIdx: i, _kind: 'sibling' }
        : { ...s, _origIdx: i, _kind: 'sibling' }
    );
    const transformed = { ...input, children: transformedChildren, siblings: transformedSiblings };
    const baseResult = calculate(transformed);

    const finalRows = [];
    let sequentialUsed = false;

    const expandRow = (row) => {
      const idx = row.person && row.person._origIdx;
      const kind = row.person && row.person._kind;
      let origin = null;
      if (kind === 'child' && typeof idx === 'number' && input.children && input.children[idx] && input.children[idx].diedAfter) {
        origin = input.children[idx];
      } else if (kind === 'sibling' && typeof idx === 'number' && input.siblings && input.siblings[idx] && input.siblings[idx].diedAfter) {
        origin = input.siblings[idx];
      }
      if (origin && origin.successors) {
        const succ = origin.successors;
        const subInput = {
          spouse: (succ.spouse && succ.spouse.present)
            ? { ...succ.spouse, alive: succ.spouse.alive !== false, renounced: !!succ.spouse.renounced, present: true }
            : null,
          children: succ.children || [],
          parents: [],
          grandparents: [],
          siblings: []
        };
        // 再帰呼出し：successors.children の各人にも diedAfter フラグがあれば、その先まで展開
        const subResult = calculateExtended(subInput);
        if (subResult.rows.length === 0) {
          return [{
            label: `${origin.name || ''}の取り分（承継先なし）`,
            person: origin,
            share: row.share,
            note: '⚠ 数次相続：この方の相続人が確定できません'
          }];
        }
        sequentialUsed = true;
        return subResult.rows.map(sub => ({
          label: sub.label,
          person: sub.person,
          share: mul(row.share, sub.share),
          note: sub.note
            ? `${sub.note} ／ ${origin.name || ''}経由`
            : `数次相続（${origin.name || ''}経由で承継）`
        }));
      }
      return [row];
    };

    for (const row of baseResult.rows) {
      finalRows.push(...expandRow(row));
    }

    const explanations = [...baseResult.explanations];
    if (sequentialUsed) {
      explanations.push('一部の相続人が被相続人より後に亡くなっています。その方の取り分は、その方の相続人へ承継されます（数次相続）。');
    }

    return { ...baseResult, rows: finalRows, explanations };
  }

  return { gcd, reduce, mul, add, formatFrac, calculate, calculateExtended, buildChildLines, buildSiblingLines, findAscendantGeneration, distributeDescendants };
}));
