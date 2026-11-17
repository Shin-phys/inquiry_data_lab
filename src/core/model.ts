// 直線化ラボのデータと、グラフ・直線の計算
import { parseCell } from './parse'
import { linearFit, mean, originFit, se, type Fit, type OriginFit } from './stats'
import { axisLabel, slopeUnit, transformOf, type TransformId } from './transform'

export const MAX_ROWS = 50
export const MAX_Y_COLS = 5

/** 量の名前・記号・単位 */
export type Col = { name: string; symbol: string; unit: string }

/** 表の1行。セルは入力された文字列のまま持つ */
export type Row = { x: string; ys: string[]; off?: boolean }

/** 手で引いた直線（変換後の座標での2点） */
export type Line = { x1: number; y1: number; x2: number; y2: number }

export type Sheet = {
  title: string
  x: Col
  y: Col
  /** y の列数（くり返し測定） */
  yCols: number
  rows: Row[]
}

/** グラフ・直線の設定 */
export type View = {
  tx: TransformId
  ty: TransformId
  /** 原点を表示する */
  origin: boolean
  line: Line | null
  /** 直線を自分で動かしたか（最小二乗を見られる条件） */
  touched: boolean
  /** 原点を通す */
  through: boolean
  /** 傾き三角形 */
  tri: boolean
  triX: [number, number] | null
  /** 残差グラフ */
  res: boolean
  /** 最小二乗の直線 */
  lsq: boolean
  /** 設定：決定係数・常用対数・誤差棒 */
  r2: boolean
  log: boolean
  err: boolean
}

export const emptyView = (): View => ({
  tx: 'id', ty: 'id', origin: true, line: null, touched: false, through: false,
  tri: false, triX: null, res: false, lsq: false, r2: false, log: false, err: true,
})

export const emptyRow = (yCols: number): Row => ({ x: '', ys: Array.from({ length: yCols }, () => '') })

export const emptySheet = (): Sheet => ({
  title: '',
  x: { name: '', symbol: 'x', unit: '' },
  y: { name: '', symbol: 'y', unit: '' },
  yCols: 1,
  rows: Array.from({ length: 8 }, () => emptyRow(1)),
})

/** グラフに描く1点 */
export type Pt = {
  /** 表の行番号 */
  row: number
  /** 元の値（y は列の平均） */
  x: number
  y: number
  /** 変換後の値 */
  X: number
  Y: number
  /** 誤差棒（変換後）。くり返し測定が2つ以上あるときだけ */
  lo: number | null
  hi: number | null
  off: boolean
}

export type Analysis = {
  pts: Pt[]
  /** 計算に使う点（除外していないもの） */
  used: Pt[]
  /** 変換できずにグラフから外した行の数 */
  dropped: number
  /** 数値として読めないセル（"行:列"。列は x または y0, y1…） */
  bad: Set<string>
  xSym: string
  ySym: string
  xUnit: string
  yUnit: string
  xLabel: string
  yLabel: string
  slopeUnit: string
  /** 手で引いた直線の傾きと切片 */
  hand: { a: number; b: number } | null
  fit: Fit | null
  ofit: OriginFit | null
}

export function analyze(sheet: Sheet, view: View): Analysis {
  const tx = transformOf(view.tx)
  const ty = transformOf(view.ty)
  const bad = new Set<string>()
  const pts: Pt[] = []
  let dropped = 0
  sheet.rows.forEach((r, i) => {
    const cx = parseCell(r.x)
    if (cx.kind === 'bad') bad.add(`${i}:x`)
    const ys: number[] = []
    for (let j = 0; j < sheet.yCols; j++) {
      const c = parseCell(r.ys[j] ?? '')
      if (c.kind === 'bad') bad.add(`${i}:y${j}`)
      if (c.kind === 'num') ys.push(c.value)
    }
    if (cx.kind !== 'num' || ys.length === 0) return
    const y = mean(ys)
    const X = tx.apply(cx.value)
    const Y = ty.apply(y)
    if (X === null || Y === null || !Number.isFinite(X) || !Number.isFinite(Y)) {
      dropped++
      return
    }
    const e = se(ys)
    let lo: number | null = null
    let hi: number | null = null
    if (e !== null && e > 0) {
      const a = ty.apply(y - e)
      const b = ty.apply(y + e)
      if (a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b)) {
        lo = Math.min(a, b)
        hi = Math.max(a, b)
      }
    }
    pts.push({ row: i, x: cx.value, y, X, Y, lo, hi, off: !!r.off })
  })
  const used = pts.filter((p) => !p.off)
  const xs = used.map((p) => p.X)
  const ysU = used.map((p) => p.Y)
  const xSym = tx.sym(sheet.x.symbol || 'x')
  const ySym = ty.sym(sheet.y.symbol || 'y')
  const xUnit = tx.unit(sheet.x.unit)
  const yUnit = ty.unit(sheet.y.unit)
  let hand: Analysis['hand'] = null
  const l = view.line
  if (l && l.x2 !== l.x1) {
    const a = (l.y2 - l.y1) / (l.x2 - l.x1)
    hand = { a, b: l.y1 - a * l.x1 }
  }
  return {
    pts, used, dropped, bad, xSym, ySym, xUnit, yUnit,
    xLabel: axisLabel(xSym, xUnit),
    yLabel: axisLabel(ySym, yUnit),
    slopeUnit: slopeUnit(yUnit, xUnit),
    hand,
    fit: linearFit(xs, ysU),
    ofit: originFit(xs, ysU),
  }
}
