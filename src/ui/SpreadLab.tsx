import { useEffect, useMemo, useRef, useState } from 'react'
import { parseCell } from '../core/parse'
import { encodeSpread, type SpreadShare } from '../core/share'
import { autoBinWidth, formatSig, histogram, mean, niceTicks, roundWithUnc, runningMean, sd, se } from '../core/stats'
import { tickLabel, useGeom } from './Plot'
import { Btn, Card, Header, ShareDialog, loadJson, saveJson } from './common'
import { downloadBlob, downloadCsv, safeName, svgToPng } from './exporting'

const KEY = 'inquiry_data_lab.spread.v1'
const MAX_VALUES = 200
const COLORS = ['#0072b2', '#d55e00']
const FONT = '"BIZ UDPGothic", "Hiragino Sans", "Noto Sans JP", sans-serif'

type Group = SpreadShare['groups'][number]
type Val = { i: number; v: number; off: boolean }

const emptyState = (): SpreadShare => ({ name: '', unit: '', groups: [{ label: '', text: '', off: [] }] })

/** 入力欄の文字列を値にする（改行・空白・カンマ区切り） */
function parseGroup(g: Group): { vals: Val[]; bad: number; over: boolean } {
  const tokens = g.text.split(/[\s,;、]+/).filter((t) => t !== '')
  const vals: Val[] = []
  let bad = 0
  tokens.slice(0, MAX_VALUES).forEach((t, i) => {
    const c = parseCell(t)
    if (c.kind === 'num') vals.push({ i, v: c.value, off: g.off.includes(i) })
    else bad++
  })
  return { vals, bad, over: tokens.length > MAX_VALUES }
}

/** 1・2・5 の刻みの中で k 段だけ動かす */
function shiftNice(w: number, k: number): number {
  const seq = [1, 2, 5]
  const e = Math.floor(Math.log10(w) + 1e-9)
  const idx = seq.reduce((best, s, j) => (Math.abs(s - w / 10 ** e) < Math.abs(seq[best] - w / 10 ** e) ? j : best), 0)
  const n = e * 3 + idx + k
  return seq[((n % 3) + 3) % 3] * 10 ** Math.floor(n / 3)
}

const placeName = (p: number) => (p < 0 ? `小数第${-p}位` : p === 0 ? '一の位' : `10${p > 1 ? `の${p}乗` : ''}の位`)

export function SpreadLab({ init, onHome }: { init: SpreadShare | null; onHome: () => void }) {
  const [st, setSt] = useState<SpreadShare>(() => init ?? loadJson<SpreadShare>(KEY) ?? emptyState())
  const [binShift, setBinShift] = useState(0)
  const [share, setShare] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)
  const { W } = useGeom()

  useEffect(() => saveJson(KEY, st), [st])

  const parsed = useMemo(() => st.groups.map(parseGroup), [st.groups])
  const used = parsed.map((p) => p.vals.filter((x) => !x.off).map((x) => x.v))
  const all = parsed.flatMap((p) => p.vals.map((x) => x.v))
  const unit = st.unit ? ` ${st.unit}` : ''
  const label = (j: number) => st.groups[j].label || (st.groups.length > 1 ? `群${j + 1}` : '測定値')

  const setGroup = (j: number, patch: Partial<Group>) => setSt((s) => ({ ...s, groups: s.groups.map((g, i) => (i === j ? { ...g, ...patch } : g)) }))
  const toggle = (j: number, i: number) => {
    const off = st.groups[j].off
    setGroup(j, { off: off.includes(i) ? off.filter((x) => x !== i) : [...off, i] })
  }

  // ---- 分布の図 ----
  const histMode = parsed.some((p) => p.vals.length > 30)
  const lo = all.length ? Math.min(...all) : 0
  const hi = all.length ? Math.max(...all) : 1
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.08
  const tx = niceTicks(lo - pad, hi + pad, 7)
  const ML = 40
  const MR = 20
  const px = (v: number) => ML + ((v - tx.min) / (tx.max - tx.min)) * (W - ML - MR)
  const BAND = 150
  const HH = st.groups.length * BAND + 44
  const binW = all.length >= 2 ? shiftNice(autoBinWidth(used.flat().length >= 2 ? used.flat() : all), binShift) : 1
  const DOT = 13

  const band = (j: number) => {
    const top = j * BAND + 8
    const base = top + BAND - 22
    const vals = parsed[j].vals
    const u = used[j]
    const m = u.length ? mean(u) : null
    const s = sd(u)
    const color = COLORS[j]
    const nodes = []
    if (m !== null && s !== null) {
      nodes.push(<rect key="sd" x={px(m - s)} y={top + 14} width={Math.max(0, px(m + s) - px(m - s))} height={base - top - 14} fill={color} opacity={0.1} />)
    }
    if (histMode) {
      const bins = histogram(u, binW)
      const maxC = Math.max(1, ...bins.map((b) => b.count))
      bins.forEach((b, k) => {
        const h = ((base - top - 20) * b.count) / maxC
        nodes.push(<rect key={`b${k}`} x={px(b.x0) + 0.5} y={base - h} width={Math.max(1, px(b.x1) - px(b.x0) - 1)} height={h} fill={color} opacity={0.75} />)
        if (b.count > 0) nodes.push(<text key={`c${k}`} x={(px(b.x0) + px(b.x1)) / 2} y={base - h - 3} textAnchor="middle" fontSize={10} fill="#334155">{b.count}</text>)
      })
    } else {
      // 点を積み上げる（横の位置が近い点は上に重ねる）
      const stack = new Map<number, number>()
      vals.slice().sort((p, q) => p.v - q.v).forEach((x) => {
        const col = Math.round((px(x.v) - ML) / DOT)
        const k = stack.get(col) ?? 0
        stack.set(col, k + 1)
        const cx = ML + col * DOT
        const cy = base - 7 - k * DOT
        nodes.push(
          <g key={`d${x.i}`} data-dot={`${j}:${x.i}`} onClick={() => toggle(j, x.i)} className="cursor-pointer">
            <circle cx={cx} cy={cy} r={5.5} fill={x.off ? '#fff' : color} stroke={x.off ? '#94a3b8' : color} strokeWidth={1.5} />
            <circle cx={cx} cy={cy} r={9} fill="transparent" data-ui="1" />
          </g>,
        )
      })
    }
    if (m !== null) {
      nodes.push(<line key="m" x1={px(m)} x2={px(m)} y1={top + 14} y2={base} stroke={color} strokeWidth={2} />)
      nodes.push(<text key="mt" x={px(m)} y={top + 10} textAnchor="middle" fontSize={11} fill={color} fontWeight={700}>平均 {formatSig(m, 4)}</text>)
    }
    nodes.push(<line key="ax" x1={ML} x2={W - MR} y1={base} y2={base} stroke="#334155" />)
    nodes.push(<text key="lb" x={ML} y={top + 10} fontSize={12} fontWeight={700} fill={color}>{label(j)}（{u.length}個）</text>)
    return <g key={j}>{nodes}</g>
  }

  // ---- 回数と平均 ----
  const runs = used.map((u) => runningMean(u))
  const maxK = Math.max(1, ...runs.map((r) => r.length))
  const rv = runs.flatMap((r) => r.flatMap((p) => (p.se !== null ? [p.mean - p.se, p.mean + p.se] : [p.mean])))
  const ry = niceTicks(rv.length ? Math.min(...rv) : 0, rv.length ? Math.max(...rv) : 1, 5)
  const RHH = 230
  const rx = (k: number) => 64 + ((k - 1) / Math.max(1, maxK - 1)) * (W - 64 - 20)
  const rpy = (v: number) => 16 + (1 - (v - ry.min) / (ry.max - ry.min)) * (RHH - 16 - 42)

  const base = safeName(st.name, 'spread')
  const savePng = async () => {
    if (!svgRef.current) return
    try {
      downloadBlob(`${base}.png`, await svgToPng(svgRef.current))
      setMsg('')
    } catch {
      setMsg('画像を保存できませんでした。')
    }
  }
  const saveCsv = () => {
    const rows: (string | number)[][] = [['群', '番号', `${st.name || '測定値'}${st.unit ? ` (${st.unit})` : ''}`, '計算に使う']]
    parsed.forEach((p, j) => p.vals.forEach((x) => rows.push([label(j), x.i + 1, x.v, x.off ? '×' : '○'])))
    used.forEach((u, j) => {
      if (!u.length) return
      rows.push([], [label(j), '個数', u.length], [label(j), '平均', formatSig(mean(u), 6)])
      const s = sd(u)
      const e = se(u)
      if (s !== null && e !== null) rows.push([label(j), '標準偏差', formatSig(s, 6)], [label(j), '標準誤差', formatSig(e, 6)])
    })
    downloadCsv(`${base}.csv`, rows)
  }

  return (
    <div className="min-h-dvh">
      <Header title="ばらつきラボ" onHome={onHome} />
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="flex flex-col gap-3">
          <Card title="測定値">
            <div className="flex flex-wrap gap-2">
              <input value={st.name} onChange={(e) => setSt((s) => ({ ...s, name: e.target.value }))} placeholder="量の名前（例：周期）" aria-label="量の名前" className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm" />
              <input value={st.unit} onChange={(e) => setSt((s) => ({ ...s, unit: e.target.value }))} placeholder="単位" aria-label="単位" className="h-10 w-20 rounded-md border border-slate-300 px-2 text-sm" />
            </div>
            {st.groups.map((g, j) => (
              <div key={j} className="mt-3">
                {st.groups.length > 1 && (
                  <input value={g.label} onChange={(e) => setGroup(j, { label: e.target.value })} placeholder={`群${j + 1}の名前（例：1周期ずつ測る）`} aria-label={`群${j + 1}の名前`} className="mb-1 h-10 w-full rounded-md border-2 px-2 text-sm" style={{ borderColor: COLORS[j] }} />
                )}
                <textarea
                  value={g.text}
                  onChange={(e) => setGroup(j, { text: e.target.value, off: [] })}
                  rows={st.groups.length > 1 ? 5 : 8}
                  inputMode="decimal"
                  placeholder={'1行に1つずつ入力（貼り付けもできます）\n1.42\n1.38\n1.45'}
                  aria-label={`${label(j)}の入力`}
                  className="w-full rounded-lg border border-slate-300 p-2 font-mono text-sm leading-relaxed"
                />
                {parsed[j].bad > 0 && <p className="text-sm text-vel">数値として読めない項目が {parsed[j].bad} 個あり、除いています。</p>}
                {parsed[j].over && <p className="text-sm text-vel">{MAX_VALUES} 個までを使っています。</p>}
              </div>
            ))}
            <div className="no-print mt-2 flex flex-wrap gap-2">
              {st.groups.length < 2 ? (
                <Btn onClick={() => setSt((s) => ({ ...s, groups: [...s.groups, { label: '', text: '', off: [] }] }))}>くらべる群を追加</Btn>
              ) : (
                <Btn onClick={() => setSt((s) => ({ ...s, groups: s.groups.slice(0, 1) }))}>2つめの群を消す</Btn>
              )}
            </div>
            <p className="no-print mt-2 text-xs leading-relaxed text-slate-500">
              2つの群をくらべると、測り方の工夫（例：「1周期を10回測る」と「10周期をまとめて測って10で割る」）でばらつきがどう変わるかを確かめられます。
            </p>
          </Card>

          <Card title="保存・共有" className="no-print">
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => void savePng()} disabled={!all.length}>図を画像で保存</Btn>
              <Btn onClick={saveCsv} disabled={!all.length}>CSVで保存</Btn>
              <Btn onClick={() => setShare(`${location.origin}${location.pathname}?lab=spread#s=${encodeSpread(st)}`)} disabled={!all.length}>共有URL・QRコード</Btn>
              <Btn onClick={() => window.print()}>印刷</Btn>
            </div>
            {msg && <p className="mt-2 text-sm text-vel">{msg}</p>}
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <Card title="結果の書き方">
            {used.every((u) => u.length === 0) && <p className="text-sm text-slate-600">測定値を入力すると、平均とばらつきを表示します。</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {used.map((u, j) => {
                if (!u.length) return null
                const m = mean(u)
                const s = sd(u)
                const e = se(u)
                const r = e !== null ? roundWithUnc(m, e) : null
                const offCount = parsed[j].vals.length - u.length
                return (
                  <div key={j} className="rounded-xl border-2 px-3 py-2" style={{ borderColor: COLORS[j] }}>
                    <p className="text-xs font-bold" style={{ color: COLORS[j] }}>{label(j)}</p>
                    <p className="text-2xl font-bold tabular-nums text-slate-900">
                      {r ? `${r.value} ± ${r.unc}` : formatSig(m, 4)}
                      <span className="text-base font-normal">{unit}</span>
                    </p>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm text-slate-700">
                      <dt>個数</dt><dd>{u.length}{offCount > 0 && `（${offCount} 個を除外）`}</dd>
                      <dt>平均</dt><dd>{formatSig(m, 5)}</dd>
                      {s !== null && <><dt>標準偏差</dt><dd>{formatSig(s, 3)}</dd></>}
                      {e !== null && <><dt>標準誤差</dt><dd>{formatSig(e, 3)}</dd></>}
                      <dt>最小〜最大</dt><dd>{formatSig(Math.min(...u), 5)} 〜 {formatSig(Math.max(...u), 5)}</dd>
                    </dl>
                    {r && e !== null ? (
                      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed text-slate-500">
                        <li>標準誤差 {formatSig(e, 4)} を有効数字{r.digits}桁に丸める → {r.unc}</li>
                        <li>平均 {formatSig(m, 6)} を同じ位（{placeName(r.place)}）にそろえる → {r.value}</li>
                      </ol>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">測定値が2つ以上あると、ばらつきを計算できます。</p>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              標準偏差は1回の測定のばらつき、標準誤差（標準偏差 ÷ √個数）は平均の確かさを表します。結果は「平均 ± 標準誤差」で書き、± の位より細かい桁は書きません。
            </p>
          </Card>

          <Card title={histMode ? '分布（ヒストグラム）' : '分布（点をタップすると、計算から外せます）'}>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${HH}`} xmlns="http://www.w3.org/2000/svg" className="w-full select-none" role="img" aria-label="分布の図" fontFamily={FONT}>
              <rect x={0} y={0} width={W} height={HH} fill="#fff" />
              {tx.ticks.map((t) => (
                <g key={t}>
                  <line x1={px(t)} x2={px(t)} y1={8} y2={HH - 44} stroke="#eef2f6" />
                  <text x={px(t)} y={HH - 26} textAnchor="middle" fontSize={12} fill="#334155">{tickLabel(t, tx.step)}</text>
                </g>
              ))}
              {st.groups.map((_, j) => band(j))}
              <text x={W / 2} y={HH - 6} textAnchor="middle" fontSize={14} fill="#1f2933">
                {st.name || '測定値'}{st.unit && `〔${st.unit}〕`}
              </text>
            </svg>
            {histMode && (
              <div className="no-print mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <span>階級の幅：{formatSig(binW, 2)}{unit}</span>
                <Btn onClick={() => setBinShift(binShift - 1)}>細かく</Btn>
                <Btn onClick={() => setBinShift(binShift + 1)}>粗く</Btn>
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">縦線は平均、うすい帯は 平均 ± 標準偏差 の範囲です。{!histMode && '白ぬきの点は、計算から外した値です。'}</p>
            {histMode && (
              <div className="no-print mt-2">
                <p className="mb-1 text-xs font-bold text-slate-600">値をタップすると、計算から外せます</p>
                {parsed.map((p, j) => (
                  <div key={j} className="mb-2 flex flex-wrap gap-1">
                    {p.vals.map((x) => (
                      <button key={x.i} onClick={() => toggle(j, x.i)} aria-pressed={!x.off} className={`min-h-9 rounded-md border px-2 text-xs tabular-nums ${x.off ? 'border-slate-300 bg-white text-slate-400 line-through' : 'text-white'}`} style={x.off ? undefined : { background: COLORS[j], borderColor: COLORS[j] }}>
                        {x.v}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="測定の回数と平均">
            <svg viewBox={`0 0 ${W} ${RHH}`} className="w-full" role="img" aria-label="回数と平均のグラフ" fontFamily={FONT}>
              <rect x={0} y={0} width={W} height={RHH} fill="#fff" />
              {ry.ticks.map((t) => (
                <g key={t}>
                  <line x1={64} x2={W - 20} y1={rpy(t)} y2={rpy(t)} stroke="#e2e8f0" />
                  <text x={58} y={rpy(t) + 4} textAnchor="end" fontSize={11} fill="#334155">{tickLabel(t, ry.step)}</text>
                </g>
              ))}
              {Array.from({ length: Math.min(maxK, 10) }, (_, i) => Math.round(1 + (i * (maxK - 1)) / Math.max(1, Math.min(maxK, 10) - 1))).map((k, i, arr) =>
                arr.indexOf(k) === i ? <text key={k} x={rx(k)} y={RHH - 24} textAnchor="middle" fontSize={11} fill="#334155">{k}</text> : null,
              )}
              <text x={(64 + W - 20) / 2} y={RHH - 6} textAnchor="middle" fontSize={13} fill="#1f2933">測定の回数（入力した順）</text>
              {runs.map((r, j) => {
                if (!r.length) return null
                const withSe = r.filter((p) => p.se !== null)
                const upper = withSe.map((p) => `${rx(p.k)},${rpy(p.mean + p.se!)}`)
                const lower = withSe.map((p) => `${rx(p.k)},${rpy(p.mean - p.se!)}`).reverse()
                return (
                  <g key={j}>
                    {withSe.length > 1 && <polygon points={[...upper, ...lower].join(' ')} fill={COLORS[j]} opacity={0.15} />}
                    <polyline points={r.map((p) => `${rx(p.k)},${rpy(p.mean)}`).join(' ')} fill="none" stroke={COLORS[j]} strokeWidth={2} />
                    {r.map((p) => <circle key={p.k} cx={rx(p.k)} cy={rpy(p.mean)} r={3} fill={COLORS[j]} />)}
                  </g>
                )
              })}
            </svg>
            <p className="mt-1 text-xs text-slate-500">線は、1回目からその回までの平均です。帯は 平均 ± 標準誤差。回数を増やすと、平均が落ち着き、帯がせまくなります。</p>
          </Card>
        </div>
      </main>
      {share && <ShareDialog url={share} onClose={() => setShare(null)} />}
    </div>
  )
}
