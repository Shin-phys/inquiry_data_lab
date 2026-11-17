// 共有URL：データをURLの # 以降に圧縮して入れる。サーバーには何も送らない。
import LZString from 'lz-string'
import { MAX_ROWS, MAX_Y_COLS, emptyRow, emptyView, type Row, type Sheet, type View } from './model'
import type { TransformId } from './transform'

const IDS: TransformId[] = ['id', 'sq', 'cube', 'sqrt', 'inv', 'inv2', 'log']

type Packed = {
  v: 1
  k: 'line'
  t: string
  x: [string, string, string]
  y: [string, string, string]
  n: number
  /** 行ごとに [x, y1, y2…] */
  r: string[][]
  /** 除外した行の番号 */
  o: number[]
  /** [横軸の変換, 縦軸の変換] */
  f: [number, number]
  l: [number, number, number, number] | null
  /** フラグ: 原点表示・原点を通す・最小二乗・残差・対数・決定係数 */
  g: number
}

const sig = (v: number) => Number(v.toPrecision(6))

export function encodeLine(sheet: Sheet, view: View): string {
  const rows = sheet.rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.x.trim() !== '' || r.ys.some((y) => y.trim() !== ''))
  const p: Packed = {
    v: 1,
    k: 'line',
    t: sheet.title,
    x: [sheet.x.name, sheet.x.symbol, sheet.x.unit],
    y: [sheet.y.name, sheet.y.symbol, sheet.y.unit],
    n: sheet.yCols,
    r: rows.map(({ r }) => [r.x, ...r.ys.slice(0, sheet.yCols)]),
    o: rows.map(({ r }, j) => (r.off ? j : -1)).filter((j) => j >= 0),
    f: [IDS.indexOf(view.tx), IDS.indexOf(view.ty)],
    l: view.line ? [sig(view.line.x1), sig(view.line.y1), sig(view.line.x2), sig(view.line.y2)] : null,
    g: (view.origin ? 1 : 0) | (view.through ? 2 : 0) | (view.lsq ? 4 : 0) | (view.res ? 8 : 0) | (view.log ? 16 : 0) | (view.r2 ? 32 : 0),
  }
  return LZString.compressToEncodedURIComponent(JSON.stringify(p))
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function decodeLine(code: string): { sheet: Sheet; view: View } | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(code)
    if (!json) return null
    const p = JSON.parse(json) as Partial<Packed>
    if (p.v !== 1 || p.k !== 'line' || !Array.isArray(p.r) || !Array.isArray(p.x) || !Array.isArray(p.y)) return null
    const yCols = Math.min(MAX_Y_COLS, Math.max(1, Number(p.n) || 1))
    const off = new Set(Array.isArray(p.o) ? p.o : [])
    const rows: Row[] = p.r.slice(0, MAX_ROWS).map((cells, i) => ({
      x: str(cells?.[0]),
      ys: Array.from({ length: yCols }, (_, j) => str(cells?.[j + 1])),
      ...(off.has(i) ? { off: true } : {}),
    }))
    while (rows.length < 3) rows.push(emptyRow(yCols))
    const g = Number(p.g) || 0
    const f = Array.isArray(p.f) ? p.f : [0, 0]
    const l = Array.isArray(p.l) && p.l.length === 4 && p.l.every((n) => typeof n === 'number') ? p.l : null
    const view: View = {
      ...emptyView(),
      tx: IDS[f[0]] ?? 'id',
      ty: IDS[f[1]] ?? 'id',
      origin: !!(g & 1),
      through: !!(g & 2),
      lsq: !!(g & 4),
      res: !!(g & 8),
      log: !!(g & 16),
      r2: !!(g & 32),
      line: l ? { x1: l[0], y1: l[1], x2: l[2], y2: l[3] } : null,
      touched: !!l,
    }
    const sheet: Sheet = {
      title: str(p.t),
      x: { name: str(p.x[0]), symbol: str(p.x[1]) || 'x', unit: str(p.x[2]) },
      y: { name: str(p.y[0]), symbol: str(p.y[1]) || 'y', unit: str(p.y[2]) },
      yCols,
      rows,
    }
    return { sheet, view }
  } catch {
    return null
  }
}

/** ばらつきラボ用：群の名前と値 */
export type SpreadShare = { name: string; unit: string; groups: { label: string; text: string; off: number[] }[] }

export function encodeSpread(s: SpreadShare): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, k: 'spread', ...s }))
}

export function decodeSpread(code: string): SpreadShare | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(code)
    if (!json) return null
    const p = JSON.parse(json)
    if (p?.v !== 1 || p?.k !== 'spread' || !Array.isArray(p.groups)) return null
    return {
      name: str(p.name),
      unit: str(p.unit),
      groups: p.groups.slice(0, 2).map((g: { label?: unknown; text?: unknown; off?: unknown }) => ({
        label: str(g?.label),
        text: str(g?.text),
        off: Array.isArray(g?.off) ? g.off.filter((n: unknown) => typeof n === 'number') : [],
      })),
    }
  } catch {
    return null
  }
}
