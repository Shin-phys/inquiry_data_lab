// ミステリーデータ：y = k xⁿ の n と k を当てる
import { gaussian } from './rng'
import type { TransformId } from './transform'

export const POWERS: { n: number; label: string; tx: TransformId }[] = [
  { n: -2, label: 'x の2乗に反比例（y ∝ 1/x²）', tx: 'inv2' },
  { n: -1, label: 'x に反比例（y ∝ 1/x）', tx: 'inv' },
  { n: 0.5, label: 'x の平方根に比例（y ∝ √x）', tx: 'sqrt' },
  { n: 1, label: 'x に比例（y ∝ x）', tx: 'id' },
  { n: 2, label: 'x の2乗に比例（y ∝ x²）', tx: 'sq' },
  { n: 3, label: 'x の3乗に比例（y ∝ x³）', tx: 'cube' },
]

export type Mystery = { n: number; k: number; xs: number[]; ys: number[] }

export const MYSTERY_NOISE = 0.01
export const K_TOLERANCE = 0.05

/** 問題を1つつくる。x は 1〜10 を等間隔に8点、k は 1.0〜9.0 の有効数字2桁 */
export function makeMystery(rng: () => number, avoid?: number): Mystery {
  let n = POWERS[Math.floor(rng() * POWERS.length)].n
  while (n === avoid) n = POWERS[Math.floor(rng() * POWERS.length)].n
  const k = Number((1 + 8 * rng()).toFixed(1))
  const xs = Array.from({ length: 8 }, (_, i) => Number((1 + (9 * i) / 7).toFixed(2)))
  const ys = xs.map((x) => Number((k * Math.pow(x, n) * (1 + MYSTERY_NOISE * gaussian(rng))).toPrecision(4)))
  return { n, k, xs, ys }
}

export function judge(q: Mystery, n: number | null, k: number | null): { nOk: boolean; kOk: boolean } {
  return { nOk: n === q.n, kOk: k !== null && Math.abs(k - q.k) <= K_TOLERANCE * q.k }
}
