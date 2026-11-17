// 統計と最小二乗法。計算はすべて倍精度で行い、丸めるのは表示のときだけ。

export type Fit = {
  n: number
  sx: number
  sy: number
  sxy: number
  sxx: number
  /** 傾き */
  a: number
  /** 切片 */
  b: number
  /** 傾き・切片の標準誤差（n < 3 のときは null） */
  sa: number | null
  sb: number | null
  /** 決定係数 */
  r2: number | null
}

const sum = (v: number[]) => v.reduce((s, x) => s + x, 0)

/** 最小二乗法 y = ax + b。点が2つ未満、または x がすべて同じなら null */
export function linearFit(xs: number[], ys: number[]): Fit | null {
  const n = xs.length
  if (n < 2) return null
  const sx = sum(xs)
  const sy = sum(ys)
  const sxy = sum(xs.map((x, i) => x * ys[i]))
  const sxx = sum(xs.map((x) => x * x))
  const d = n * sxx - sx * sx
  if (Math.abs(d) < 1e-300) return null
  const a = (n * sxy - sx * sy) / d
  const b = (sy - a * sx) / n
  const ssRes = sum(xs.map((x, i) => (ys[i] - a * x - b) ** 2))
  const my = sy / n
  const ssTot = sum(ys.map((y) => (y - my) ** 2))
  let sa: number | null = null
  let sb: number | null = null
  if (n >= 3) {
    const s2 = ssRes / (n - 2)
    sa = Math.sqrt((s2 * n) / d)
    sb = Math.sqrt((s2 * sxx) / d)
  }
  return { n, sx, sy, sxy, sxx, a, b, sa, sb, r2: ssTot > 0 ? 1 - ssRes / ssTot : null }
}

export type OriginFit = { n: number; sxy: number; sxx: number; a: number; sa: number | null }

/** 原点を通る直線 y = ax */
export function originFit(xs: number[], ys: number[]): OriginFit | null {
  const n = xs.length
  if (n < 1) return null
  const sxy = sum(xs.map((x, i) => x * ys[i]))
  const sxx = sum(xs.map((x) => x * x))
  if (sxx === 0) return null
  const a = sxy / sxx
  let sa: number | null = null
  if (n >= 2) {
    const s2 = sum(xs.map((x, i) => (ys[i] - a * x) ** 2)) / (n - 1)
    sa = Math.sqrt(s2) / Math.sqrt(sxx)
  }
  return { n, sxy, sxx, a, sa }
}

export const mean = (v: number[]) => sum(v) / v.length

/** 標準偏差（n−1 で割る）。2個未満なら null */
export function sd(v: number[]): number | null {
  if (v.length < 2) return null
  const m = mean(v)
  return Math.sqrt(sum(v.map((x) => (x - m) ** 2)) / (v.length - 1))
}

/** 平均の標準誤差。2個未満なら null */
export function se(v: number[]): number | null {
  const s = sd(v)
  return s === null ? null : s / Math.sqrt(v.length)
}

/** 入力順に、1個目から k 個目までの平均と標準誤差 */
export function runningMean(v: number[]): { k: number; mean: number; se: number | null }[] {
  return v.map((_, i) => {
    const part = v.slice(0, i + 1)
    return { k: i + 1, mean: mean(part), se: se(part) }
  })
}

/** 1・2・5 の刻みに丸める */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / p
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return m * p
}

export type Ticks = { min: number; max: number; step: number; ticks: number[] }

/** 軸の目盛り。min〜max を含む、きりのよい範囲と刻みを返す */
export function niceTicks(lo: number, hi: number, target = 6): Ticks {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, step: 0.2, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] }
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.5
    lo -= pad
    hi += pad
  }
  const step = niceStep((hi - lo) / target)
  const min = Math.floor(lo / step + 1e-9) * step
  const max = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  const count = Math.round((max - min) / step)
  for (let i = 0; i <= count; i++) ticks.push(Number((min + i * step).toPrecision(12)))
  return { min, max, step, ticks }
}

/** ヒストグラムの階級の幅（範囲÷√n を 1・2・5 の刻みに丸める） */
export function autoBinWidth(values: number[]): number {
  if (values.length < 2) return 1
  const range = Math.max(...values) - Math.min(...values)
  if (range === 0) return niceStep(Math.abs(values[0]) / 10 || 1)
  // 目盛りとちがい、いちばん近い 1・2・5 の刻みを選ぶ
  const raw = range / Math.sqrt(values.length)
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / p
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p
}

export type Bin = { x0: number; x1: number; count: number }

export function histogram(values: number[], width: number): Bin[] {
  if (!values.length || !(width > 0)) return []
  const lo = Math.floor(Math.min(...values) / width + 1e-9) * width
  const hi = Math.max(...values)
  const n = Math.max(1, Math.floor((hi - lo) / width + 1e-9) + 1)
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({ x0: lo + i * width, x1: lo + (i + 1) * width, count: 0 }))
  for (const v of values) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((v - lo) / width + 1e-9)))
    bins[i].count++
  }
  return bins
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }

/** 有効数字 n 桁で表示する（とても大きい・小さい数は ×10ⁿ の形） */
export function formatSig(v: number, n: number): string {
  if (!Number.isFinite(v)) return '—'
  if (v === 0) return '0'
  const r = Number(v.toPrecision(n))
  const e = Math.floor(Math.log10(Math.abs(r)))
  if (e >= 7 || e < -4) {
    const m = (r / Math.pow(10, e)).toFixed(n - 1)
    return `${m}×10${String(e).split('').map((c) => SUP[c] ?? c).join('')}`
  }
  return r.toFixed(Math.max(0, n - 1 - e))
}

export type Rounded = {
  value: string
  unc: string
  /** 不確かさを何桁に丸めたか */
  digits: 1 | 2
  /** そろえた位（10 の何乗か。−2 なら小数第2位） */
  place: number
}

/**
 * 「値 ± 不確かさ」の表示。不確かさは有効数字1桁（先頭の数字が1のときは2桁）に丸め、
 * 値はその最後の桁にそろえる。
 */
export function roundWithUnc(value: number, unc: number): Rounded | null {
  if (!Number.isFinite(value) || !Number.isFinite(unc) || unc <= 0) return null
  const plan = (u: number, digits: 1 | 2) => {
    const e = Math.floor(Math.log10(u) + 1e-12)
    const place = e - (digits - 1)
    return { place, rounded: Math.round(unc / Math.pow(10, place)) * Math.pow(10, place) }
  }
  const lead = (u: number) => Math.floor(u / Math.pow(10, Math.floor(Math.log10(u) + 1e-12)) + 1e-9)
  let digits: 1 | 2 = lead(unc) === 1 ? 2 : 1
  let p = plan(unc, digits)
  // 0.096 → 0.1 のように、丸めた結果の先頭が 1 になったら2桁で取り直す
  if (digits === 1 && lead(p.rounded) === 1) {
    digits = 2
    p = plan(p.rounded, 2)
  }
  const dec = Math.max(0, -p.place)
  const v = Math.round(value / Math.pow(10, p.place)) * Math.pow(10, p.place)
  return { value: v.toFixed(dec), unc: p.rounded.toFixed(dec), digits, place: p.place }
}
