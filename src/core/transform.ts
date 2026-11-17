// 軸の変換（そのまま・2乗・3乗・平方根・逆数・逆数の2乗・常用対数）

export type TransformId = 'id' | 'sq' | 'cube' | 'sqrt' | 'inv' | 'inv2' | 'log'

export type Transform = {
  id: TransformId
  /** ボタンの表示 */
  label: string
  /** 変換できない値（負の数の平方根など）は null */
  apply: (v: number) => number | null
  /** 記号の表示（例: T → T²） */
  sym: (s: string) => string
  /** 単位の表示（例: s → s²） */
  unit: (u: string) => string
}

/** 単位が m/s のように複合なら、かっこでくくる */
const wrap = (u: string) => (/[/·\s]/.test(u) ? `(${u})` : u)

export const TRANSFORMS: Transform[] = [
  { id: 'id', label: 'そのまま', apply: (v) => v, sym: (s) => s, unit: (u) => u },
  { id: 'sq', label: '2乗', apply: (v) => v * v, sym: (s) => `${s}²`, unit: (u) => (u ? `${wrap(u)}²` : '') },
  { id: 'cube', label: '3乗', apply: (v) => v * v * v, sym: (s) => `${s}³`, unit: (u) => (u ? `${wrap(u)}³` : '') },
  { id: 'sqrt', label: '平方根', apply: (v) => (v >= 0 ? Math.sqrt(v) : null), sym: (s) => `√${s}`, unit: (u) => (u ? `√${wrap(u)}` : '') },
  {
    id: 'inv',
    label: '逆数',
    apply: (v) => (v !== 0 ? 1 / v : null),
    sym: (s) => `1/${s}`,
    unit: (u) => (!u ? '' : u.startsWith('1/') ? u.slice(2) : `1/${wrap(u)}`),
  },
  {
    id: 'inv2',
    label: '逆数の2乗',
    apply: (v) => (v !== 0 ? 1 / (v * v) : null),
    sym: (s) => `1/${s}²`,
    unit: (u) => (u ? `1/${wrap(u)}²` : ''),
  },
  { id: 'log', label: '常用対数', apply: (v) => (v > 0 ? Math.log10(v) : null), sym: (s) => `log ${s}`, unit: () => '' },
]

export const transformOf = (id: TransformId): Transform => TRANSFORMS.find((t) => t.id === id) ?? TRANSFORMS[0]

/** 傾きの単位（縦軸の単位 ÷ 横軸の単位） */
export function slopeUnit(uy: string, ux: string): string {
  if (!ux) return uy
  if (ux.startsWith('1/')) {
    const d = ux.slice(2)
    return uy ? `${uy}·${d}` : d
  }
  return `${uy || '1'}/${wrap(ux)}`
}

/** 「記号〔単位〕」の形の軸ラベル */
export function axisLabel(sym: string, unit: string): string {
  return unit ? `${sym}〔${unit}〕` : sym
}
