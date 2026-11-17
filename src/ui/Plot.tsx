import { useEffect, useRef, useState, type PointerEvent, type Ref } from 'react'
import type { Analysis, Line, View } from '../core/model'
import { formatSig, niceTicks, type Ticks } from '../core/stats'

/** グラフの大きさと余白。スマートフォンでは小さい枠に描き、文字が小さくなりすぎないようにする */
export type Geom = { W: number; H: number; l: number; r: number; t: number; b: number }
export const GEOM_WIDE: Geom = { W: 640, H: 430, l: 74, r: 22, t: 40, b: 58 }
export const GEOM_NARROW: Geom = { W: 380, H: 330, l: 58, r: 14, t: 40, b: 52 }

/** 画面の幅に合った大きさを返す */
export function useGeom(): Geom {
  const query = '(max-width: 639px)'
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow ? GEOM_NARROW : GEOM_WIDE
}
const COL = { pt: '#0072b2', line: '#d55e00', lsq: '#009e73', grid: '#e2e8f0', axis: '#334155', text: '#1f2933' }
const FONT = '"BIZ UDPGothic", "Hiragino Sans", "Noto Sans JP", sans-serif'

export type Scale = {
  x: Ticks
  y: Ticks
  px: (v: number) => number
  py: (v: number) => number
  ix: (p: number) => number
  iy: (p: number) => number
}

/** データの範囲から、きりのよい軸の範囲を決める */
export function scaleFor(a: Analysis, view: View, g: Geom, height = g.H): Scale {
  const xs = a.pts.map((p) => p.X)
  const ys = a.pts.flatMap((p) => (view.err && p.lo !== null && p.hi !== null ? [p.Y, p.lo, p.hi] : [p.Y]))
  const ext = (v: number[]): [number, number] => {
    if (!v.length) return [0, 1]
    let lo = Math.min(...v)
    let hi = Math.max(...v)
    if (view.origin || view.through) {
      lo = Math.min(lo, 0)
      hi = Math.max(hi, 0)
    }
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.06
    return [lo === 0 ? 0 : lo - pad, hi === 0 ? 0 : hi + pad]
  }
  const x = niceTicks(...ext(xs), g.W < 500 ? 4 : 6)
  const y = niceTicks(...ext(ys), 5)
  const pw = g.W - g.l - g.r
  const ph = height - g.t - g.b
  return {
    x,
    y,
    px: (v) => g.l + ((v - x.min) / (x.max - x.min)) * pw,
    py: (v) => g.t + (1 - (v - y.min) / (y.max - y.min)) * ph,
    ix: (p) => x.min + ((p - g.l) / pw) * (x.max - x.min),
    iy: (p) => y.min + (1 - (p - g.t) / ph) * (y.max - y.min),
  }
}

/** 目盛りの数字 */
export function tickLabel(v: number, step: number): string {
  if (v === 0) return '0'
  const big = Math.max(Math.abs(v), step)
  if (big >= 1e6 || step < 1e-4) return formatSig(v, 3)
  return v.toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)))
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type Props = {
  a: Analysis
  view: View
  g: Geom
  title: string
  /** 最小二乗の直線（表示するとき） */
  lsq: { a: number; b: number } | null
  /** グラフの右上に書く式 */
  eq?: string
  onLine?: (l: Line) => void
  onTri?: (t: [number, number]) => void
  svgRef?: Ref<SVGSVGElement>
}

/** 散布図。手で引く直線・最小二乗の直線・傾き三角形・誤差棒を重ねる */
export function Plot({ a, view, g, title, lsq, eq, onLine, onTri, svgRef }: Props) {
  const { W, H } = g
  const sc = scaleFor(a, view, g)
  const drag = useRef<string | null>(null)
  const x0 = sc.px(sc.x.min)
  const x1 = sc.px(sc.x.max)
  const y0 = sc.py(sc.y.min)
  const y1 = sc.py(sc.y.max)

  const line = view.line
  const hand = a.hand
  // 直線は軸の範囲いっぱいに描く
  const seg = (k: { a: number; b: number }) => ({
    x1: x0, y1: sc.py(k.a * sc.x.min + k.b), x2: x1, y2: sc.py(k.a * sc.x.max + k.b),
  })

  const toData = (ev: PointerEvent<SVGElement>) => {
    const svg = ev.currentTarget.ownerSVGElement ?? (ev.currentTarget as unknown as SVGSVGElement)
    const r = svg.getBoundingClientRect()
    const k = W / r.width
    return {
      x: clamp(sc.ix((ev.clientX - r.left) * k), sc.x.min, sc.x.max),
      y: clamp(sc.iy((ev.clientY - r.top) * k), sc.y.min, sc.y.max),
    }
  }
  const start = (id: string) => (ev: PointerEvent<SVGElement>) => {
    drag.current = id
    ev.currentTarget.setPointerCapture(ev.pointerId)
    ev.preventDefault()
  }
  const move = (ev: PointerEvent<SVGElement>) => {
    const id = drag.current
    if (!id || !line) return
    const p = toData(ev)
    if (id === 'h1' && onLine) onLine({ ...line, x1: p.x, y1: p.y })
    if (id === 'h2' && onLine) onLine({ ...line, x2: p.x, y2: p.y })
    if ((id === 'ta' || id === 'tb') && onTri && view.triX) {
      onTri(id === 'ta' ? [p.x, view.triX[1]] : [view.triX[0], p.x])
    }
  }
  const end = () => {
    drag.current = null
  }
  const handle = (id: string, cx: number, cy: number, square = false) => (
    <g key={id} data-ui="1" className="no-print">
      {square ? (
        <rect x={cx - 6} y={cy - 6} width={12} height={12} fill="#fff" stroke={COL.axis} strokeWidth={2} />
      ) : (
        <circle cx={cx} cy={cy} r={8} fill="#fff" stroke={COL.line} strokeWidth={3} />
      )}
      {/* 指でつかみやすいよう、見た目より大きい透明な当たり判定を置く */}
      <circle
        cx={cx} cy={cy} r={22} fill="transparent" className="plot-drag"
        onPointerDown={start(id)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      />
    </g>
  )

  const tri = view.tri && hand && view.triX ? view.triX : null
  const triPts = tri && hand ? { xa: tri[0], ya: hand.a * tri[0] + hand.b, xb: tri[1], yb: hand.a * tri[1] + hand.b } : null
  const clipId = 'plot-clip'

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full select-none"
      role="img"
      aria-label="グラフ"
      fontFamily={FONT}
    >
      <rect x={0} y={0} width={W} height={H} fill="#fff" />
      <defs>
        <clipPath id={clipId}>
          <rect x={x0} y={y1} width={x1 - x0} height={y0 - y1} />
        </clipPath>
      </defs>
      {title && (
        <text x={W / 2} y={18} textAnchor="middle" fontSize={15} fontWeight={700} fill={COL.text}>
          {title}
        </text>
      )}
      {eq && (
        <text x={x1} y={34} textAnchor="end" fontSize={12} fill={COL.axis}>
          {eq}
        </text>
      )}
      {/* 目盛り */}
      {sc.x.ticks.map((t) => (
        <g key={`x${t}`}>
          <line x1={sc.px(t)} x2={sc.px(t)} y1={y0} y2={y1} stroke={COL.grid} />
          <text x={sc.px(t)} y={y0 + 18} textAnchor="middle" fontSize={12} fill={COL.axis}>
            {tickLabel(t, sc.x.step)}
          </text>
        </g>
      ))}
      {sc.y.ticks.map((t) => (
        <g key={`y${t}`}>
          <line x1={x0} x2={x1} y1={sc.py(t)} y2={sc.py(t)} stroke={COL.grid} />
          <text x={x0 - 8} y={sc.py(t) + 4} textAnchor="end" fontSize={12} fill={COL.axis}>
            {tickLabel(t, sc.y.step)}
          </text>
        </g>
      ))}
      <rect x={x0} y={y1} width={x1 - x0} height={y0 - y1} fill="none" stroke={COL.axis} strokeWidth={1.5} />
      <text x={(x0 + x1) / 2} y={H - 14} textAnchor="middle" fontSize={15} fill={COL.text}>
        {a.xLabel}
      </text>
      <text x={18} y={(y0 + y1) / 2} textAnchor="middle" fontSize={15} fill={COL.text} transform={`rotate(-90 18 ${(y0 + y1) / 2})`}>
        {a.yLabel}
      </text>

      <g clipPath={`url(#${clipId})`}>
        {lsq && <line {...seg(lsq)} stroke={COL.lsq} strokeWidth={2.5} strokeDasharray="8 5" />}
        {hand && <line {...seg(hand)} stroke={COL.line} strokeWidth={2.5} />}
        {triPts && (
          <path
            d={`M${sc.px(triPts.xa)} ${sc.py(triPts.ya)} H${sc.px(triPts.xb)} V${sc.py(triPts.yb)}`}
            fill="none" stroke={COL.axis} strokeWidth={1.5} strokeDasharray="4 3"
          />
        )}
      </g>

      {/* 測定点（線では結ばない）。除外した点は白抜き */}
      {a.pts.map((p) => {
        const cx = sc.px(p.X)
        const cy = sc.py(p.Y)
        return (
          <g key={p.row}>
            {view.err && p.lo !== null && p.hi !== null && !p.off && (
              <path
                d={`M${cx} ${sc.py(p.lo)} V${sc.py(p.hi)} M${cx - 5} ${sc.py(p.lo)} h10 M${cx - 5} ${sc.py(p.hi)} h10`}
                stroke={COL.pt} strokeWidth={1.5} fill="none"
              />
            )}
            <circle cx={cx} cy={cy} r={5.5} fill={p.off ? '#fff' : COL.pt} stroke={p.off ? '#94a3b8' : COL.pt} strokeWidth={1.5} />
          </g>
        )
      })}

      {triPts && (
        <g fontSize={12} fill={COL.axis}>
          <text x={(sc.px(triPts.xa) + sc.px(triPts.xb)) / 2} y={sc.py(triPts.ya) + (hand!.a >= 0 ? 16 : -8)} textAnchor="middle">
            横の変化 {formatSig(triPts.xb - triPts.xa, 3)}
          </text>
          <text x={sc.px(triPts.xb) + (triPts.xb >= triPts.xa ? 6 : -6)} y={(sc.py(triPts.ya) + sc.py(triPts.yb)) / 2 + 4} textAnchor={triPts.xb >= triPts.xa ? 'start' : 'end'}>
            縦の変化 {formatSig(triPts.yb - triPts.ya, 3)}
          </text>
        </g>
      )}

      {/* つまみ */}
      {line && onLine && (
        <>
          {view.through ? (
            <circle cx={sc.px(0)} cy={sc.py(0)} r={6} fill={COL.line} />
          ) : (
            handle('h1', sc.px(clamp(line.x1, sc.x.min, sc.x.max)), sc.py(clamp(line.y1, sc.y.min, sc.y.max)))
          )}
          {handle('h2', sc.px(clamp(line.x2, sc.x.min, sc.x.max)), sc.py(clamp(line.y2, sc.y.min, sc.y.max)))}
        </>
      )}
      {triPts && onTri && (
        <>
          {handle('ta', sc.px(triPts.xa), sc.py(triPts.ya), true)}
          {handle('tb', sc.px(triPts.xb), sc.py(triPts.yb), true)}
        </>
      )}
    </svg>
  )
}

const RH = 170

/** 残差グラフ：各点の、直線からのずれ */
export function ResidualPlot({ a, view, g, k, label }: { a: Analysis; view: View; g: Geom; k: { a: number; b: number }; label: string }) {
  const W = g.W
  const sc = scaleFor(a, view, g, RH)
  const res = a.used.map((p) => ({ X: p.X, r: p.Y - (k.a * p.X + k.b), row: p.row }))
  const m = Math.max(...res.map((p) => Math.abs(p.r)), 1e-12)
  const ty = niceTicks(-m * 1.15, m * 1.15, 4)
  const top = 26
  const bottom = RH - 30
  const py = (v: number) => top + (1 - (v - ty.min) / (ty.max - ty.min)) * (bottom - top)
  const x0 = sc.px(sc.x.min)
  const x1 = sc.px(sc.x.max)
  return (
    <svg viewBox={`0 0 ${W} ${RH}`} className="w-full" role="img" aria-label="残差グラフ" fontFamily={FONT}>
      <rect x={0} y={0} width={W} height={RH} fill="#fff" />
      <text x={x0} y={16} fontSize={13} fontWeight={700} fill={COL.text}>
        残差（{label}からのずれ）
      </text>
      {ty.ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={py(t)} y2={py(t)} stroke={t === 0 ? COL.axis : COL.grid} strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={x0 - 8} y={py(t) + 4} textAnchor="end" fontSize={11} fill={COL.axis}>
            {tickLabel(t, ty.step)}
          </text>
        </g>
      ))}
      {sc.x.ticks.map((t) => (
        <text key={t} x={sc.px(t)} y={bottom + 16} textAnchor="middle" fontSize={11} fill={COL.axis}>
          {tickLabel(t, sc.x.step)}
        </text>
      ))}
      {res.map((p) => (
        <g key={p.row}>
          <line x1={sc.px(p.X)} x2={sc.px(p.X)} y1={py(0)} y2={py(p.r)} stroke={COL.pt} strokeWidth={1.5} />
          <circle cx={sc.px(p.X)} cy={py(p.r)} r={5} fill={COL.pt} />
        </g>
      ))}
    </svg>
  )
}
