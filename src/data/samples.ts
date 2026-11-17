// 練習用データ。関係式から計算した値に、測定誤差を模した乱数（標準偏差は値の1.5%）を加える。
// 乱数の種を固定してあるので、だれが開いても同じデータになる。
import { gaussian, makeRng } from '../core/rng'
import type { Col, Row } from '../core/model'
import type { TransformId } from '../core/transform'

export type Sample = {
  id: string
  title: string
  /** 一覧に出す短い説明 */
  about: string
  x: Col
  y: Col
  xs: number[]
  /** 関係式（誤差なし） */
  f: (x: number) => number
  /** 誤差の大きさ（値に対する割合） */
  noise: number
  seed: number
  /** y の有効数字 */
  sig: number
  /** 直線になる組（横軸・縦軸の変換） */
  best: { tx: TransformId; ty: TransformId }
  /** そのときの傾きの理論値と、その意味 */
  slope: number
  meaning: string
  /** 常用対数が必要（発展） */
  needsLog?: boolean
  /** 実データ（乱数を加えない）。[x, y] の組 */
  fixed?: [number, number][]
  source?: string
  /** 3段階のヒント */
  hints: [string, string, string]
}

const G = 9.8
const range = (a: number, b: number, step: number) =>
  Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => Number((a + i * step).toFixed(6)))

const H1 = 'まず、そのままグラフにしてみよう。点は直線に並んでいる？ 直線を引いて、残差（直線からのずれ）も見てみよう。'

export const SAMPLES: Sample[] = [
  {
    id: 'spring', title: 'ばねののび', about: 'おもりの質量とばねののび',
    x: { name: 'おもりの質量', symbol: 'm', unit: 'kg' }, y: { name: 'ばねののび', symbol: 'x', unit: 'm' },
    xs: range(0.05, 0.3, 0.05), f: (m) => (m * G) / 20, noise: 0.015, seed: 11, sig: 3,
    best: { tx: 'id', ty: 'id' }, slope: G / 20, meaning: 'g/k（k はばね定数）',
    hints: [H1, 'そのままで直線になり、原点を通る。のびは質量に比例している（フックの法則）。', 'つり合いの式 kx = mg より x = (g/k)m。傾きは g/k なので、k = g ÷ 傾き で求められる。'],
  },
  {
    id: 'pendulum', title: '単振り子', about: '糸の長さと周期',
    x: { name: '糸の長さ', symbol: 'L', unit: 'm' }, y: { name: '周期', symbol: 'T', unit: 's' },
    xs: [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0], f: (L) => 2 * Math.PI * Math.sqrt(L / G), noise: 0.015, seed: 49, sig: 3,
    best: { tx: 'id', ty: 'sq' }, slope: (4 * Math.PI ** 2) / G, meaning: '4π²/g',
    hints: [H1, 'L を大きくすると、T の増え方はだんだんゆるやかになる。T を2乗する（または L の平方根をとる）と直線になるか試そう。', 'T = 2π√(L/g) を2乗すると T² = (4π²/g)L。T² と L のグラフの傾きは 4π²/g なので、g = 4π² ÷ 傾き。'],
  },
  {
    id: 'freefall', title: '自由落下', about: '落下時間と落下距離',
    x: { name: '時間', symbol: 't', unit: 's' }, y: { name: '落下距離', symbol: 'y', unit: 'm' },
    xs: range(0.1, 0.45, 0.05), f: (t) => 0.5 * G * t * t, noise: 0.015, seed: 13, sig: 3,
    best: { tx: 'sq', ty: 'id' }, slope: G / 2, meaning: 'g/2',
    hints: [H1, 't を大きくすると、y の増え方はだんだん急になる。t を2乗すると直線になるか試そう。', 'y = (1/2)gt² なので、y と t² のグラフの傾きは g/2。g = 2 × 傾き。'],
  },
  {
    id: 'boyle', title: 'ボイルの法則', about: '気体の体積と圧力',
    x: { name: '体積', symbol: 'V', unit: 'mL' }, y: { name: '圧力', symbol: 'p', unit: 'hPa' },
    xs: range(20, 60, 5), f: (V) => 40520 / V, noise: 0.015, seed: 34, sig: 4,
    best: { tx: 'inv', ty: 'id' }, slope: 40520, meaning: 'pV（一定の値）',
    hints: [H1, 'V を大きくすると p は小さくなる。V の逆数（1/V）を横軸にすると直線になるか試そう。', 'pV = 一定 なので p = (一定)×(1/V)。p と 1/V のグラフは原点を通る直線になり、傾きが pV の値。'],
  },
  {
    id: 'light', title: '光源からの距離と明るさ', about: '点光源からの距離と照度',
    x: { name: '距離', symbol: 'r', unit: 'm' }, y: { name: '照度', symbol: 'E', unit: 'lx' },
    xs: range(0.2, 1.0, 0.1), f: (r) => 100 / (r * r), noise: 0.015, seed: 5, sig: 3,
    best: { tx: 'inv2', ty: 'id' }, slope: 100, meaning: '光度 I',
    hints: [H1, '距離が2倍になると、照度は 1/2 ではなく、もっと小さくなっている。逆数か、逆数の2乗を試そう。', '光は球面状に広がるので E = I/r²（逆2乗の法則）。E と 1/r² のグラフの傾きが光度 I。'],
  },
  {
    id: 'string', title: '弦の振動', about: '弦の張力と基本振動数',
    x: { name: '張力', symbol: 'S', unit: 'N' }, y: { name: '振動数', symbol: 'f', unit: 'Hz' },
    xs: range(2, 18, 2), f: (S) => Math.sqrt(S / 1.0e-3) / (2 * 0.5), noise: 0.015, seed: 16, sig: 3,
    best: { tx: 'sqrt', ty: 'id' }, slope: 1 / (2 * 0.5 * Math.sqrt(1.0e-3)), meaning: '1/(2L√ρ)',
    hints: [H1, 'S を大きくすると、f の増え方はだんだんゆるやかになる。S の平方根（または f の2乗）を試そう。', 'f = (1/2L)√(S/ρ) なので、f と √S のグラフの傾きは 1/(2L√ρ)。L = 0.50 m なら線密度 ρ が求められる。'],
  },
  {
    id: 'ohm', title: '抵抗の電流と電圧', about: '抵抗にかけた電圧と流れる電流',
    x: { name: '電圧', symbol: 'V', unit: 'V' }, y: { name: '電流', symbol: 'I', unit: 'A' },
    xs: range(0.5, 6.0, 0.5), f: (V) => V / 20, noise: 0.015, seed: 17, sig: 3,
    best: { tx: 'id', ty: 'id' }, slope: 1 / 20, meaning: '1/R',
    hints: [H1, 'そのままで原点を通る直線になる。電流は電圧に比例している（オームの法則）。', 'I = V/R なので傾きは 1/R。R = 1 ÷ 傾き。'],
  },
  {
    id: 'discharge', title: 'コンデンサーの放電（発展）', about: '時間とコンデンサーの電圧',
    x: { name: '時間', symbol: 't', unit: 's' }, y: { name: '電圧', symbol: 'V', unit: 'V' },
    xs: range(0, 50, 5), f: (t) => 5.0 * Math.exp(-t / 20), noise: 0.015, seed: 18, sig: 3,
    best: { tx: 'id', ty: 'log' }, slope: -1 / (20 * Math.LN10), meaning: '−1/(2.30×RC)',
    needsLog: true,
    hints: [H1, '2乗・平方根・逆数のどれでも直線にならない。設定で「常用対数」をオンにして、縦軸を log V にしてみよう。', 'V = V₀e^(−t/RC) なので log V = log V₀ − t/(2.30RC)。log V と t のグラフの傾きから、時定数 RC が求められる。'],
  },
  {
    id: 'kepler', title: '惑星の軌道（発展・実データ）', about: '軌道長半径と公転周期（水星〜土星）',
    x: { name: '軌道長半径', symbol: 'a', unit: 'au' }, y: { name: '公転周期', symbol: 'T', unit: '年' },
    xs: [], f: () => 0, noise: 0, seed: 0, sig: 3,
    fixed: [[0.387, 0.241], [0.723, 0.615], [1, 1], [1.52, 1.88], [5.2, 11.9], [9.57, 29.4]],
    source: 'NASA Planetary Fact Sheet – Ratio to Earth Values（nssdc.gsfc.nasa.gov）',
    best: { tx: 'cube', ty: 'sq' }, slope: 1, meaning: '天文単位と年で表すと 1',
    hints: [H1, '片方の軸を変換するだけでは直線にならない。横軸と縦軸の両方を変換してみよう（3乗と2乗の組み合わせ）。', 'T² = k a³（ケプラーの第3法則）。天文単位と年で表すと、地球が (1, 1) なので k = 1 になる。'],
  },
]

export const sampleById = (id: string | null) => SAMPLES.find((s) => s.id === id) ?? null

const fmt = (v: number, sig: number) => String(Number(v.toPrecision(sig)))

/** 練習用データの表（文字列）をつくる。seed を指定すると別の乱数になる */
export function sampleRows(s: Sample, seed?: number): Row[] {
  if (s.fixed) return s.fixed.map(([x, y]) => ({ x: String(x), ys: [String(y)] }))
  const rng = makeRng(seed ?? s.seed)
  return s.xs.map((x) => ({ x: String(x), ys: [fmt(s.f(x) * (1 + s.noise * gaussian(rng)), s.sig)] }))
}
