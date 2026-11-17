import { useEffect, useMemo, useRef, useState } from 'react'
import { analyze, emptySheet, emptyView, type Sheet, type View } from '../core/model'
import { calc } from '../core/calc'
import { encodeLine } from '../core/share'
import { formatSig } from '../core/stats'
import { sampleById, sampleRows, type Sample } from '../data/samples'
import { DataTable } from './DataTable'
import { Workbench, lsqOf, refLine, showValue } from './Workbench'
import { Btn, Card, Header, ShareDialog, loadJson, saveJson } from './common'
import { downloadBlob, downloadCsv, safeName, svgToPng } from './exporting'

const KEY = 'inquiry_data_lab.line.v1'

export type LineInit = { sheet: Sheet; view: View; sampleId?: string | null }

type Saved = { sheet: Sheet; view: View; sampleId: string | null; conclusion: string; expr: string; qName: string; qUnit: string }

/** 練習用データを読み込んだ状態 */
export function sampleInit(s: Sample, seed?: number): LineInit {
  return {
    sheet: { title: s.title, x: s.x, y: s.y, yCols: 1, rows: sampleRows(s, seed) },
    view: { ...emptyView(), log: !!s.needsLog },
    sampleId: s.id,
  }
}

type Tab = 'table' | 'graph' | 'summary'
const TABS: [Tab, string][] = [['table', '表'], ['graph', 'グラフ'], ['summary', 'まとめ']]

export function LineLab({ init, onHome }: { init: LineInit | null; onHome: () => void }) {
  const saved = useMemo(() => (init ? null : loadJson<Saved>(KEY)), [init])
  const [sheet, setSheet] = useState<Sheet>(init?.sheet ?? saved?.sheet ?? emptySheet())
  const [view, setView] = useState<View>(init?.view ?? saved?.view ?? emptyView())
  const [sampleId] = useState<string | null>(init ? (init.sampleId ?? null) : (saved?.sampleId ?? null))
  const [conclusion, setConclusion] = useState(init ? '' : (saved?.conclusion ?? ''))
  const [expr, setExpr] = useState(init ? '' : (saved?.expr ?? ''))
  const [qName, setQName] = useState(init ? '' : (saved?.qName ?? ''))
  const [qUnit, setQUnit] = useState(init ? '' : (saved?.qUnit ?? ''))
  const [hint, setHint] = useState(0)
  const [tab, setTab] = useState<Tab>(init?.sampleId ? 'graph' : 'table')
  const [share, setShare] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)

  const a = useMemo(() => analyze(sheet, view), [sheet, view])
  const sample = sampleById(sampleId)
  const ref = refLine(a, view)
  const lsq = lsqOf(a, view)

  useEffect(() => {
    saveJson(KEY, { sheet, view, sampleId, conclusion, expr, qName, qUnit } satisfies Saved)
  }, [sheet, view, sampleId, conclusion, expr, qName, qUnit])

  const title = sheet.title || (sheet.x.name && sheet.y.name ? `${sheet.y.name}と${sheet.x.name}の関係` : '')
  const base = safeName(sheet.title, 'graph')

  const makeSentence = () => {
    if (!ref) return
    const slope = ref.kind === 'lsq' && lsq ? showValue(lsq.a, lsq.sa) : formatSig(ref.a, 3)
    const u = a.slopeUnit ? ` ${a.slopeUnit}` : ''
    setConclusion(
      view.through
        ? `${a.ySym} は ${a.xSym} に比例する。傾き（比例定数）は ${slope}${u}。`
        : `${a.ySym} と ${a.xSym} のグラフは直線になる。傾きは ${slope}${u}、切片は ${formatSig(ref.b, 3)}${a.yUnit ? ` ${a.yUnit}` : ''}。`,
    )
  }

  const value = ref && expr.trim() ? calc(expr, { a: ref.a, b: ref.b }) : null

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
    const by = new Map(a.pts.map((p) => [p.row, p]))
    const unit = (s: string, u: string) => (u ? `${s} (${u})` : s)
    const head = [
      unit(sheet.x.symbol, sheet.x.unit),
      ...Array.from({ length: sheet.yCols }, (_, j) => unit(sheet.yCols > 1 ? `${sheet.y.symbol}${j + 1}` : sheet.y.symbol, sheet.y.unit)),
      ...(sheet.yCols > 1 ? [unit(`${sheet.y.symbol}の平均`, sheet.y.unit)] : []),
      unit(a.xSym, a.xUnit),
      unit(a.ySym, a.yUnit),
      '計算に使う',
    ]
    const body = sheet.rows
      .map((r, i) => ({ r, p: by.get(i) }))
      .filter(({ r }) => r.x.trim() !== '' || r.ys.some((y) => y.trim() !== ''))
      .map(({ r, p }) => [
        r.x,
        ...Array.from({ length: sheet.yCols }, (_, j) => r.ys[j] ?? ''),
        ...(sheet.yCols > 1 ? [p ? formatSig(p.y, 6) : ''] : []),
        p ? formatSig(p.X, 6) : '',
        p ? formatSig(p.Y, 6) : '',
        r.off ? '×' : p ? '○' : '',
      ])
    const tail: (string | number)[][] = []
    if (ref) {
      tail.push([], [ref.kind === 'lsq' ? '最小二乗の直線' : '手で引いた直線'], ['傾き', formatSig(ref.a, 6), a.slopeUnit])
      if (!view.through) tail.push(['切片', formatSig(ref.b, 6), a.yUnit])
    }
    downloadCsv(`${base}.csv`, [head, ...body, ...tail])
  }
  const openShare = () => {
    const url = `${location.origin}${location.pathname}?lab=line#d=${encodeLine(sheet, view)}`
    setShare(url)
  }

  const show = (t: Tab) => (tab === t ? 'block' : 'hidden lg:block')

  return (
    <div className="min-h-dvh">
      <Header title="直線化ラボ" onHome={onHome} />
      <nav className="no-print sticky top-[61px] z-10 grid grid-cols-3 border-b border-slate-200 bg-white lg:hidden" aria-label="表示の切り替え">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={`min-h-11 text-sm font-bold ${tab === t ? 'border-b-2 border-pos text-pos' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </nav>

      <main className="print-main mx-auto grid max-w-7xl grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={`${show('table')} print-show min-w-0`}>
          <Card title="データ">
            <DataTable sheet={sheet} setSheet={setSheet} a={a} view={view} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className={`${show('graph')} print-show`}>
            <Card>
              <Workbench a={a} view={view} setView={setView} title={title} svgRef={svgRef} />
            </Card>
          </div>

          <div className={`${show('summary')} print-show flex flex-col gap-3`}>
            {sample && (
              <Card title={`ヒント（${sample.title}）`} className="no-print">
                <ol className="flex flex-col gap-2 text-sm leading-relaxed text-slate-700">
                  {sample.hints.slice(0, hint).map((h, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
                      <b className="mr-1">{i + 1}.</b>
                      {h}
                    </li>
                  ))}
                </ol>
                {hint < 3 ? (
                  <div className="mt-2">
                    <Btn onClick={() => setHint(hint + 1)}>{hint === 0 ? 'ヒントを見る' : '次のヒント'}（{hint + 1}/3）</Btn>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    傾きの理論値：{sample.meaning} ＝ {formatSig(sample.slope, 3)} {a.slopeUnit}
                    {sample.source && <span className="block">出典：{sample.source}</span>}
                  </p>
                )}
              </Card>
            )}

            <Card title="結論">
              <textarea
                value={conclusion}
                onChange={(e) => setConclusion(e.target.value)}
                rows={3}
                placeholder="例：T² は L に比例する。傾きは 4.03 s²/m。"
                aria-label="結論"
                className="w-full rounded-lg border border-slate-300 p-2 text-sm leading-relaxed"
              />
              <div className="no-print mt-2 flex flex-wrap items-center gap-2">
                <Btn onClick={makeSentence} disabled={!ref}>
                  いまの直線から文をつくる
                </Btn>
                {!ref && <span className="text-xs text-slate-500">グラフで直線を引くと使えます。</span>}
              </div>
            </Card>

            <Card title="傾きから求める" className={value === null ? 'no-print' : ''}>
              <p className="no-print text-xs leading-relaxed text-slate-500">
                式の中で a（傾き）・b（切片）・pi が使えます。例：4*pi^2/a
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input value={qName} onChange={(e) => setQName(e.target.value)} placeholder="求める量（例：g）" aria-label="求める量の名前" className="h-11 w-36 rounded-lg border border-slate-300 px-2 text-sm" />
                <span>＝</span>
                <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="4*pi^2/a" aria-label="式" autoCapitalize="off" autoCorrect="off" className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 font-mono text-sm" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-base">
                <span>＝</span>
                <b className="text-xl">{value !== null ? formatSig(value, 3) : '—'}</b>
                <input value={qUnit} onChange={(e) => setQUnit(e.target.value)} placeholder="単位" aria-label="求める量の単位" className="h-11 w-24 rounded-lg border border-slate-300 px-2 text-sm" />
              </div>
              {ref ? (
                <p className="mt-1 text-xs text-slate-500">
                  a = {formatSig(ref.a, 4)}、b = {formatSig(ref.b, 4)}（{ref.kind === 'lsq' ? '最小二乗の直線' : '手で引いた直線'}）
                  {expr.trim() && value === null && <span className="ml-2 text-vel">式を読めませんでした。</span>}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">グラフで直線を引くと計算できます。</p>
              )}
            </Card>

            <Card title="保存・共有" className="no-print">
              <div className="flex flex-wrap gap-2">
                <Btn onClick={() => void savePng()} disabled={a.pts.length === 0}>グラフを画像で保存</Btn>
                <Btn onClick={saveCsv} disabled={a.pts.length === 0}>表をCSVで保存</Btn>
                <Btn onClick={openShare} disabled={a.pts.length === 0}>共有URL・QRコード</Btn>
                <Btn onClick={() => window.print()}>印刷</Btn>
              </div>
              {msg && <p className="mt-2 text-sm text-vel">{msg}</p>}
              <p className="mt-2 text-xs text-slate-500">入力したデータはこの端末の中だけで処理し、外部には送りません。</p>
            </Card>
          </div>
        </div>
      </main>
      {share && <ShareDialog url={share} onClose={() => setShare(null)} />}
    </div>
  )
}
