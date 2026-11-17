// クラス集計の図：班ごとの「値 ± 不確かさ」と、全員の値のヒストグラム
import { useState } from 'react'
import { autoBinWidth, formatSig, histogram, niceTicks, shiftNice } from '../core/stats'
import { tickLabel, useGeom } from './Plot'
import { Btn } from './common'

const FONT = '"BIZ UDPGothic", "Hiragino Sans", "Noto Sans JP", sans-serif'

export type WhiskerRow = { label: string; v: number; e: number | null }

/** 班ごとの値を点、不確かさを横棒で並べる。refV はクラス全体の値（縦線） */
export function Whisker({ rows, refV, refLabel, axis, name }: { rows: WhiskerRow[]; refV: number | null; refLabel: string; axis: string; name: string }) {
  const { W } = useGeom()
  if (!rows.length) return null
  const L = 46
  const R = 20
  const T = 26
  const ROW = 26
  const vals = rows.flatMap((r) => (r.e !== null ? [r.v - r.e, r.v + r.e] : [r.v])).concat(refV !== null ? [refV] : [])
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.1
  const tx = niceTicks(lo - pad, hi + pad, W < 500 ? 4 : 6)
  const px = (v: number) => L + ((v - tx.min) / (tx.max - tx.min)) * (W - L - R)
  const bottom = T + rows.length * ROW
  const H = bottom + 46
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={name} fontFamily={FONT}>
      <rect x={0} y={0} width={W} height={H} fill="#fff" />
      {tx.ticks.map((t) => (
        <g key={t}>
          <line x1={px(t)} x2={px(t)} y1={T} y2={bottom} stroke="#e2e8f0" />
          <text x={px(t)} y={bottom + 16} textAnchor="middle" fontSize={12} fill="#334155">{tickLabel(t, tx.step)}</text>
        </g>
      ))}
      <text x={L - 8} y={T - 8} textAnchor="end" fontSize={11} fill="#64748b">番号</text>
      {refV !== null && (
        <g>
          <line x1={px(refV)} x2={px(refV)} y1={T - 4} y2={bottom} stroke="#d55e00" strokeWidth={2} strokeDasharray="6 4" />
          <text x={Math.min(W - R, Math.max(L + 40, px(refV)))} y={T - 9} textAnchor="middle" fontSize={11} fontWeight={700} fill="#d55e00">{refLabel}</text>
        </g>
      )}
      {rows.map((r, i) => {
        const y = T + i * ROW + ROW / 2
        return (
          <g key={r.label} data-whisker={r.label}>
            {i % 2 === 1 && <rect x={L} y={y - ROW / 2} width={W - L - R} height={ROW} fill="#f8fafc" opacity={0.6} />}
            <text x={L - 8} y={y + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="#334155">{r.label}</text>
            {r.e !== null && (
              <g stroke="#0072b2" strokeWidth={2}>
                <line x1={px(r.v - r.e)} x2={px(r.v + r.e)} y1={y} y2={y} />
                <line x1={px(r.v - r.e)} x2={px(r.v - r.e)} y1={y - 5} y2={y + 5} />
                <line x1={px(r.v + r.e)} x2={px(r.v + r.e)} y1={y - 5} y2={y + 5} />
              </g>
            )}
            <circle cx={px(r.v)} cy={y} r={5} fill="#0072b2" />
          </g>
        )
      })}
      <line x1={L} x2={W - R} y1={bottom} y2={bottom} stroke="#334155" />
      <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize={13} fill="#1f2933">{axis}</text>
    </svg>
  )
}

/** 全員の値のヒストグラム。mark は平均（縦線） */
export function Hist({ values, axis, unit, mark }: { values: number[]; axis: string; unit: string; mark: number | null }) {
  const { W } = useGeom()
  const [shift, setShift] = useState(0)
  if (!values.length) return null
  const binW = shiftNice(autoBinWidth(values), shift)
  const bins = histogram(values, binW)
  const L = 46
  const R = 20
  const T = 22
  const H = 250
  const bottom = H - 46
  const pad = binW * 0.5
  const tx = niceTicks(bins[0].x0 - pad, bins[bins.length - 1].x1 + pad, W < 500 ? 4 : 7)
  const px = (v: number) => L + ((v - tx.min) / (tx.max - tx.min)) * (W - L - R)
  const maxC = Math.max(1, ...bins.map((b) => b.count))
  const ty = niceTicks(0, maxC, 4)
  const py = (c: number) => bottom - (c / ty.max) * (bottom - T)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="全員の値のヒストグラム" fontFamily={FONT}>
        <rect x={0} y={0} width={W} height={H} fill="#fff" />
        {ty.ticks.filter((t) => Number.isInteger(t)).map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke="#e2e8f0" />
            <text x={L - 6} y={py(t) + 4} textAnchor="end" fontSize={11} fill="#334155">{t}</text>
          </g>
        ))}
        {tx.ticks.map((t) => (
          <text key={t} x={px(t)} y={bottom + 16} textAnchor="middle" fontSize={12} fill="#334155">{tickLabel(t, tx.step)}</text>
        ))}
        {bins.map((b, k) => (
          <g key={k}>
            <rect x={px(b.x0) + 0.5} y={py(b.count)} width={Math.max(1, px(b.x1) - px(b.x0) - 1)} height={bottom - py(b.count)} fill="#0072b2" opacity={0.75} />
            {b.count > 0 && <text x={(px(b.x0) + px(b.x1)) / 2} y={py(b.count) - 3} textAnchor="middle" fontSize={10} fill="#334155">{b.count}</text>}
          </g>
        ))}
        {mark !== null && <line x1={px(mark)} x2={px(mark)} y1={T - 6} y2={bottom} stroke="#d55e00" strokeWidth={2} strokeDasharray="6 4" />}
        <line x1={L} x2={W - R} y1={bottom} y2={bottom} stroke="#334155" />
        <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize={13} fill="#1f2933">{axis}</text>
        <text x={12} y={T - 8} fontSize={11} fill="#64748b">個数</text>
      </svg>
      <div className="no-print mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span>階級の幅：{formatSig(binW, 2)}{unit && ` ${unit}`}</span>
        <Btn onClick={() => setShift(shift - 1)}>細かく</Btn>
        <Btn onClick={() => setShift(shift + 1)}>粗く</Btn>
      </div>
    </div>
  )
}
