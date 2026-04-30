/* =========================================================
   共有型定義
   ========================================================= */

export type AdoptedKind = 'normal' | 'special' | null;

export interface Person {
  id?: string;
  name?: string;
  alive: boolean;
  renounced?: boolean;
  disqualified?: boolean;
  excluded?: boolean;
  /** 同時死亡の推定（民法32条の2） */
  simultaneousDeath?: boolean;
  /** 兄弟姉妹のみ：父母の片方だけ同じ */
  halfBlood?: boolean;
  adopted?: AdoptedKind;
  /** 子・兄弟姉妹の子孫（代襲・再代襲対象） */
  descendants?: Person[];
  /** 数次相続：被相続人より後に死亡 */
  diedAfter?: boolean;
  /** 数次相続の場合の承継先（その方が亡くなった後の相続人） */
  successors?: Successors;
  /** 内部処理用：元配列上のインデックス */
  _origIdx?: number;
  _kind?: 'child' | 'sibling';
}

export interface Spouse {
  present: boolean;
  alive: boolean;
  name?: string;
  renounced?: boolean;
  simultaneousDeath?: boolean;
  label?: string;
}

export interface Successors {
  spouse: Spouse | null;
  children: Person[];
}

export interface CalcInput {
  spouse: Spouse | null;
  children: Person[];
  parents: Person[];
  grandparents?: Person[];
  siblings: Person[];
}

export interface Frac {
  n: number;
  d: number;
}

export interface ResultRow {
  label: string;
  person: Person | Spouse | null;
  share: Frac;
  note: string;
}

export type Order = 'children' | 'ascendants' | 'siblings' | 'spouseOnly' | 'none';

export interface CalcResult {
  rows: ResultRow[];
  explanations: string[];
  citations: string[];
  order: Order;
}

export interface GlossaryEntry {
  title: string;
  body: string;
  figure?: string;
}

export interface QAEntry {
  q: string;
  a: string;
}
