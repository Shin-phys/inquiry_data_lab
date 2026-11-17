import type { ReactNode, Ref } from 'react'
import type { Analysis, Line, View } from '../core/model'
import { formatSig, mean, roundWithUnc } from '../core/stats'
import { TRANSFORMS, type TransformId } from '../core/transform'
import { Plot, ResidualPlot, scaleFor, useGeom } from './Plot'

type Props = {
  a: Analysis
  view: View
  setView: (fn: (v: View) => View) => void
  title: string
  svgRef?: Ref<SVGSVGElement>
  /** 設定（対数・決定係数・誤差棒）を出すか */
  settings?: boolean
}

/** 表示に使う直線：最小二乗を出していればそれ、なければ手で引いた直線 */
export function lsqOf(a: Analysis, view: View): { a: number; b: number; sa: number | null; sb: number | null } | null {
  if (view.through) return a.ofit ? { a: a.ofit.a, b: 0, sa: a.ofit.sa, sb: null } : null
  return a.fit ? { a: a.fit.a, b: a.fit.b, sa: a.fit.sa, sb: a.fit.sb } : null
}
export function refLine(a: Analysis, view: View): { a: number; b: number; kind: 'lsq' | 'hand' } | null {
  const l = lsqOf(a, view)
  if (view.lsq && l) return { a: l.a, b: l.b, kind: 'lsq' }
  return a.hand ? { ...a.hand, kind: 'hand' } : null
}

const withUnit = (v: string, u: string) => (u ? `${v} ${u}` : v)

/** 値 ± 標準誤差 の表示（標準誤差がなければ有効数字3桁） */
export function showValue(v: number, s: number | null): string {
  const r = s !== null ? roundWithUnc(v, s) : null
  return r ? `${r.value} ± ${r.unc}` : formatSig(v, 3)
}

function Toggle({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`min-h-11 rounded-lg border px-3 text-sm font-bold disabled:opacity-40 ${on ? 'border-pos bg-pos text-white' : 'border-slate-300 bg-white text-slate-700'}`}
    >
      {children}
    </button>
  )
}

function TransformRow({ axis, sym, value, log, onPick }: { axis: string; sym: string; value: TransformId; log: boolean; onPick: (id: TransformId) => void }) {
  return (
    <div data-axis={axis} className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
      <span className="w-20 shrink-0 text-xs font-bold text-slate-600 sm:w-24">
        {axis}（{sym}）
      </span>
      {TRANSFORMS.filter((t) => t.id !== 'log' || log).map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          aria-pressed={value === t.id}
          className={`min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3 text-sm ${value === t.id ? 'border-pos bg-pos font-bold text-white' : 'border-slate-300 bg-white text-slate-700'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** 軸変換・グラフ・直線・残差・最小二乗をまとめた作業台 */
export function Workbench({ a, view, setView, title, svgRef, settings = true }: Props) {
  const g = useGeom()
  const sc = scaleFor(a, view, g)
  const lsq = lsqOf(a, view)
  const ref = refLine(a, view)

  // 軸を変えたら、直線は引き直す（最小二乗もいったん隠す）
  const pick = (key: 'tx' | 'ty') => (id: TransformId) =>
    setView((v) => (v[key] === id ? v : { ...v, [key]: id, line: null, touched: false, lsq: false, triX: null }))

  const newLine = (through: boolean): Line => {
    const span = sc.x.max - sc.x.min
    const my = a.used.length ? mean(a.used.map((p) => p.Y)) : (sc.y.min + sc.y.max) / 2
    return through
      ? { x1: 0, y1: 0, x2: sc.x.min + 0.85 * span, y2: my }
      : { x1: sc.x.min + 0.15 * span, y1: my, x2: sc.x.min + 0.85 * span, y2: my }
  }
  const toggleLine = () =>
    setView((v) => (v.line ? { ...v, line: null, touched: false, lsq: false, tri: false, triX: null } : { ...v, line: newLine(v.through) }))
  const toggleThrough = () =>
    setView((v) => {
      const through = !v.through
      return { ...v, through, origin: through ? true : v.origin, line: v.line ? (through ? { ...v.line, x1: 0, y1: 0 } : v.line) : null }
    })
  const toggleTri = () =>
    setView((v) => {
      const span = sc.x.max - sc.x.min
      return { ...v, tri: !v.tri, triX: v.triX ?? [sc.x.min + 0.25 * span, sc.x.min + 0.75 * span] }
    })

  const eq = ref
    ? `${ref.kind === 'lsq' ? '最小二乗' : '手で引いた直線'}：${a.ySym} = ${formatSig(ref.a, 3)} × ${a.xSym}${view.through ? '' : ` ${ref.b >= 0 ? '+' : '−'} ${formatSig(Math.abs(ref.b), 3)}`}`
    : undefined

  const diff = a.hand && lsq && lsq.a !== 0 ? ((a.hand.a - lsq.a) / Math.abs(lsq.a)) * 100 : null
  const tri = view.tri && a.hand && view.triX ? view.triX : null

  return (
    <div className="flex flex-col gap-3">
      <div className="no-print flex flex-col gap-2">
        <TransformRow axis="横軸" sym={a.xSym} value={view.tx} log={view.log} onPick={pick('tx')} />
        <TransformRow axis="縦軸" sym={a.ySym} value={view.ty} log={view.log} onPick={pick('ty')} />
      </div>

      {a.dropped > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          この変換ができない値を含む {a.dropped} 行を、グラフから外しています。
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Plot
          a={a}
          view={view}
          g={g}
          title={title}
          lsq={view.lsq && lsq ? lsq : null}
          eq={eq}
          svgRef={svgRef}
          onLine={(l) => setView((v) => ({ ...v, line: v.through ? { ...l, x1: 0, y1: 0 } : l, touched: true }))}
          onTri={(t) => setView((v) => ({ ...v, triX: t }))}
        />
      </div>

      <div className="no-print flex flex-wrap gap-2">
        <Toggle on={!!view.line} onClick={toggleLine} disabled={a.used.length < 2}>
          {view.line ? '直線を消す' : '直線を引く'}
        </Toggle>
        <Toggle on={view.through} onClick={toggleThrough}>
          原点を通す
        </Toggle>
        <Toggle on={view.tri} onClick={toggleTri} disabled={!a.hand}>
          傾き三角形
        </Toggle>
        <Toggle on={view.res} onClick={() => setView((v) => ({ ...v, res: !v.res }))} disabled={!ref}>
          残差を見る
        </Toggle>
        <Toggle on={view.lsq} onClick={() => setView((v) => ({ ...v, lsq: !v.lsq }))} disabled={!view.touched || !lsq}>
          最小二乗と比べる
        </Toggle>
        <label className="flex min-h-11 items-center gap-2 px-1 text-sm text-slate-700">
          <input type="checkbox" className="h-5 w-5" checked={view.origin} disabled={view.through} onChange={(e) => setView((v) => ({ ...v, origin: e.target.checked }))} />
          原点を表示
        </label>
      </div>
      {!view.line && a.used.length >= 2 && (
        <p className="no-print text-sm text-slate-600">「直線を引く」を押し、両端のつまみを動かして点に合わせよう。</p>
      )}
      {view.line && !view.touched && <p className="no-print text-sm text-slate-600">つまみを動かして直線を合わせると、「最小二乗と比べる」が使えるようになります。</p>}

      {(a.hand || (view.lsq && lsq)) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {a.hand && (
            <div className="rounded-xl border-2 border-vel/40 bg-white px-3 py-2">
              <p className="text-xs font-bold text-vel">手で引いた直線</p>
              <p className="text-base">
                傾き <b className="text-lg">{withUnit(formatSig(a.hand.a, 3), a.slopeUnit)}</b>
              </p>
              {!view.through && <p className="text-sm text-slate-700">切片 {withUnit(formatSig(a.hand.b, 3), a.yUnit)}</p>}
            </div>
          )}
          {view.lsq && lsq && (
            <div className="rounded-xl border-2 border-acc/50 bg-white px-3 py-2">
              <p className="text-xs font-bold text-acc">最小二乗法の直線（点線）</p>
              <p className="text-base">
                傾き <b className="text-lg">{withUnit(showValue(lsq.a, lsq.sa), a.slopeUnit)}</b>
              </p>
              {!view.through && <p className="text-sm text-slate-700">切片 {withUnit(showValue(lsq.b, lsq.sb), a.yUnit)}</p>}
              {diff !== null && <p className="text-sm text-slate-700">手で引いた直線との傾きの差：{diff >= 0 ? '+' : '−'}{Math.abs(diff).toFixed(1)}%</p>}
              {view.r2 && !view.through && a.fit?.r2 != null && (
                <p className="mt-1 text-sm text-slate-700">
                  決定係数 R² = {formatSig(a.fit.r2, 4)}
                  <span className="block text-xs text-slate-500">値が高くても、残差が山なり・谷なりに並んでいれば直線ではありません。</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tri && a.hand && (
        <p className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700 border border-slate-200">
          傾き三角形：縦の変化 ÷ 横の変化 ＝ {formatSig(a.hand.a * (tri[1] - tri[0]), 3)} ÷ {formatSig(tri[1] - tri[0], 3)} ＝{' '}
          <b>{formatSig(a.hand.a, 3)}</b>
          <span className="block text-xs text-slate-500">傾きは、測定点ではなく「直線の上の、はなれた2点」から読みとります。□ を動かして確かめよう。</span>
        </p>
      )}

      {view.res && ref && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ResidualPlot a={a} view={view} g={g} k={ref} label={ref.kind === 'lsq' ? '最小二乗の直線' : '手で引いた直線'} />
          <p className="px-3 pb-2 text-xs text-slate-600">
            ずれが上下にばらばらに散っていれば直線、山なり・谷なりに並んでいれば曲線です。原点を通るはずの関係なら、直線が原点を通るかも確かめよう。
          </p>
        </div>
      )}

      {view.lsq && a.fit && !view.through && (
        <details className="no-print rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <summary className="min-h-9 cursor-pointer font-bold">計算の中身（Excelでも確かめられます）</summary>
          <div className="mt-2 space-y-1 font-mono text-xs leading-relaxed">
            <p>n = {a.fit.n}　Σx = {formatSig(a.fit.sx, 6)}　Σy = {formatSig(a.fit.sy, 6)}</p>
            <p>Σxy = {formatSig(a.fit.sxy, 6)}　Σx² = {formatSig(a.fit.sxx, 6)}</p>
            <p>傾き a = (nΣxy − ΣxΣy) ÷ (nΣx² − (Σx)²) = {formatSig(a.fit.a, 6)}</p>
            <p>切片 b = (Σy − aΣx) ÷ n = {formatSig(a.fit.b, 6)}</p>
            {a.fit.sa !== null && a.fit.sb !== null && (
              <p>標準誤差　傾き {formatSig(a.fit.sa, 6)}　切片 {formatSig(a.fit.sb, 6)}</p>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            ここでの x・y は、変換後の値（{a.xSym}・{a.ySym}）です。Excel では =SLOPE(yの範囲, xの範囲)、=INTERCEPT(yの範囲, xの範囲)、標準誤差は =LINEST(yの範囲, xの範囲, TRUE, TRUE) で求められます。
          </p>
        </details>
      )}
      {view.lsq && a.ofit && view.through && (
        <details className="no-print rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <summary className="min-h-9 cursor-pointer font-bold">計算の中身（原点を通る直線）</summary>
          <div className="mt-2 space-y-1 font-mono text-xs leading-relaxed">
            <p>n = {a.ofit.n}　Σxy = {formatSig(a.ofit.sxy, 6)}　Σx² = {formatSig(a.ofit.sxx, 6)}</p>
            <p>傾き a = Σxy ÷ Σx² = {formatSig(a.ofit.a, 6)}</p>
            {a.ofit.sa !== null && <p>傾きの標準誤差 {formatSig(a.ofit.sa, 6)}</p>}
          </div>
          <p className="mt-2 text-xs text-slate-500">Excel では =LINEST(yの範囲, xの範囲, FALSE, TRUE) で求められます。</p>
        </details>
      )}

      {settings && (
        <details className="no-print rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <summary className="min-h-9 cursor-pointer font-bold">設定</summary>
          <div className="mt-1 flex flex-col">
            {(
              [
                ['log', '軸の変換に「常用対数」を加える（発展）'],
                ['r2', '最小二乗の結果に決定係数 R² を表示する'],
                ['err', 'くり返し測定があるとき、誤差棒（標準誤差）を表示する'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={view[k]} onChange={(e) => setView((v) => ({ ...v, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
