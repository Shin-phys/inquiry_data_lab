// クラスの結果：部屋に集まった全班のデータをまとめて見る
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { encodeClass, errorText, fetchItems, groupStat, parseLineItems, parseSpreadItems, sheetOf, type ClassConfig, type LineItem, type SpreadItem } from '../core/classroom'
import { analyze, emptyView, type View } from '../core/model'
import { formatSig, mean, roundWithUnc, sd, se } from '../core/stats'
import { Hist, Whisker } from './ClassCharts'
import { Workbench, lsqOf, showValue } from './Workbench'
import { BigQr, Btn, Card, Header } from './common'
import { downloadCsv, safeName } from './exporting'

const AUTO_MS = 15000
const hhmmss = (t: number) => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const unitOf = (u: string) => (u ? ` ${u}` : '')

type UseBox = { off: Set<number>; toggle: (g: number) => void }

function UseCheck({ g, box }: { g: number; box: UseBox }) {
  return <input type="checkbox" checked={!box.off.has(g)} onChange={() => box.toggle(g)} aria-label={`${g}番を集計に使う`} className="h-5 w-5 accent-[#0072b2]" />
}

const th = 'border-b border-slate-300 px-2 py-1 text-left text-xs font-bold text-slate-600'
const td = 'border-b border-slate-100 px-2 py-1 tabular-nums'

function SpreadResults({ cfg, items, box }: { cfg: ClassConfig; items: SpreadItem[]; box: UseBox }) {
  const stats = items.map(groupStat)
  const usedItems = items.filter((it) => !box.off.has(it.g))
  const all = usedItems.flatMap((it) => it.values)
  const unit = unitOf(cfg.y.unit)
  const name = cfg.y.name || '測定値'
  const m = all.length ? mean(all) : null
  const s = sd(all)
  const e = se(all)
  const r = m !== null && e !== null ? roundWithUnc(m, e) : null
  const means = stats.filter((x) => !box.off.has(x.g)).map((x) => x.mean)
  const sdMeans = sd(means)
  const axis = `${name}${cfg.y.unit ? `〔${cfg.y.unit}〕` : ''}`

  const saveCsv = () => {
    const rows: (string | number)[][] = [['番号', '個数', '平均', '標準偏差', '標準誤差', '集計に使う', '値…']]
    items.forEach((it, i) => {
      const x = stats[i]
      rows.push([it.g, x.n, formatSig(x.mean, 6), x.sd !== null ? formatSig(x.sd, 6) : '', x.se !== null ? formatSig(x.se, 6) : '', box.off.has(it.g) ? '×' : '○', ...it.values])
    })
    if (m !== null) {
      rows.push([], ['クラス全体', all.length, formatSig(m, 6), s !== null ? formatSig(s, 6) : '', e !== null ? formatSig(e, 6) : ''])
    }
    downloadCsv(`${safeName(cfg.title, 'class')}_${cfg.room}.csv`, rows)
  }

  return (
    <>
      <Card title="クラス全体">
        {m === null ? (
          <p className="text-sm text-slate-600">集計に使う班がありません。</p>
        ) : (
          <>
            <p className="text-3xl font-bold tabular-nums text-slate-900" data-testid="class-result">
              {r ? `${r.value} ± ${r.unc}` : formatSig(m, 4)}
              <span className="text-lg font-normal">{unit}</span>
            </p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm text-slate-700">
              <dt>班の数</dt><dd>{usedItems.length}</dd>
              <dt>値の数</dt><dd>{all.length}</dd>
              <dt>平均</dt><dd>{formatSig(m, 5)}</dd>
              {s !== null && <><dt>標準偏差</dt><dd>{formatSig(s, 3)}</dd></>}
              {e !== null && <><dt>標準誤差</dt><dd>{formatSig(e, 3)}</dd></>}
              {sdMeans !== null && <><dt>班の平均のばらつき</dt><dd>{formatSig(sdMeans, 3)}（班の平均の標準偏差）</dd></>}
            </dl>
          </>
        )}
      </Card>

      <Card title="班ごとの平均 ± 標準誤差">
        <Whisker
          name="班ごとの平均"
          rows={stats.filter((x) => !box.off.has(x.g)).map((x) => ({ label: String(x.g), v: x.mean, e: x.se }))}
          refV={m}
          refLabel="クラス全体の平均"
          axis={axis}
        />
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          点は班の平均、横棒は 平均 ± 標準誤差、点線はクラス全体の平均です。横棒どうしが重ならない班があるときは、測り方にちがい（いつも大きめ・小さめに出る原因）がないか話し合ってみましょう。
        </p>
      </Card>

      <Card title="全員の測定値">
        <Hist values={all} axis={axis} unit={cfg.y.unit} mark={m} />
        <p className="mt-1 text-xs text-slate-500">点線はクラス全体の平均です。</p>
      </Card>

      <Card title="班ごとの値">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>使う</th><th className={th}>番号</th><th className={th}>個数</th><th className={th}>平均</th><th className={th}>標準偏差</th><th className={th}>標準誤差</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((x) => (
                <tr key={x.g} className={box.off.has(x.g) ? 'opacity-50' : ''}>
                  <td className={td}><UseCheck g={x.g} box={box} /></td>
                  <td className={`${td} font-bold`}>{x.g}</td>
                  <td className={td}>{x.n}</td>
                  <td className={td}>{formatSig(x.mean, 4)}</td>
                  <td className={td}>{x.sd !== null ? formatSig(x.sd, 3) : '—'}</td>
                  <td className={td}>{x.se !== null ? formatSig(x.se, 3) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="no-print mt-2">
          <Btn onClick={saveCsv}>CSVで保存</Btn>
        </div>
      </Card>
    </>
  )
}

function LineResults({ cfg, items, box }: { cfg: ClassConfig; items: LineItem[]; box: UseBox }) {
  const [view, setView] = useState<View>(emptyView)
  const usedItems = useMemo(() => items.filter((it) => !box.off.has(it.g)), [items, box.off])
  const a = useMemo(() => analyze(sheetOf(cfg, usedItems), view), [cfg, usedItems, view])
  const whole = lsqOf(a, view)
  // 班ごとの直線は、上のグラフと同じ変換・同じ「原点を通す」で最小二乗法をあてはめる
  const per = useMemo(
    () =>
      items.map((it) => {
        const ag = analyze(sheetOf(cfg, [it]), { ...view, line: null })
        return { g: it.g, n: ag.used.length, total: it.rows.length, fit: lsqOf(ag, view) }
      }),
    [cfg, items, view],
  )
  const su = unitOf(a.slopeUnit)

  const saveCsv = () => {
    const rows: (string | number)[][] = [['番号', `${cfg.x.symbol}${cfg.x.unit ? ` (${cfg.x.unit})` : ''}`, `${cfg.y.symbol}${cfg.y.unit ? ` (${cfg.y.unit})` : ''}`, '集計に使う']]
    items.forEach((it) => it.rows.forEach(([x, y]) => rows.push([it.g, x, y, box.off.has(it.g) ? '×' : '○'])))
    rows.push([], [`傾き（横軸 ${a.xSym}、縦軸 ${a.ySym}${view.through ? '、原点を通す' : ''}）`], ['番号', '点の数', '傾き', '傾きの標準誤差', ...(view.through ? [] : ['切片'])])
    per.forEach((p) => {
      if (p.fit) rows.push([p.g, p.n, formatSig(p.fit.a, 6), p.fit.sa !== null ? formatSig(p.fit.sa, 6) : '', ...(view.through ? [] : [formatSig(p.fit.b, 6)])])
    })
    if (whole) rows.push(['クラス全体', a.used.length, formatSig(whole.a, 6), whole.sa !== null ? formatSig(whole.sa, 6) : '', ...(view.through ? [] : [formatSig(whole.b, 6)])])
    downloadCsv(`${safeName(cfg.title, 'class')}_${cfg.room}.csv`, rows)
  }

  return (
    <>
      <Card title={`全班の点を重ねたグラフ（${usedItems.length} 班・${a.used.length} 点）`}>
        <Workbench a={a} view={view} setView={setView} title={`${cfg.title || 'クラス集計'}（クラス全体）`} />
        {a.dropped > 0 && <p className="mt-1 text-sm text-vel">この変換では計算できない点が {a.dropped} 個あり、グラフから外しています。</p>}
      </Card>

      <Card title="班ごとの傾き ± 標準誤差">
        <Whisker
          name="班ごとの傾き"
          rows={per.filter((p) => p.fit && !box.off.has(p.g)).map((p) => ({ label: String(p.g), v: p.fit!.a, e: p.fit!.sa }))}
          refV={whole ? whole.a : null}
          refLabel="クラス全体の傾き"
          axis={`傾き${a.slopeUnit ? `〔${a.slopeUnit}〕` : ''}`}
        />
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          班ごとに、上のグラフと同じ軸の変換{view.through && '・原点を通す設定'}で最小二乗法の直線をあてはめた傾きです。横棒は 傾き ± 標準誤差、点線は全班の点をまとめてあてはめた傾きです。
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>使う</th><th className={th}>番号</th><th className={th}>点の数</th><th className={th}>傾き{a.slopeUnit && `〔${a.slopeUnit}〕`}</th>
                {!view.through && <th className={th}>切片{a.yUnit && `〔${a.yUnit}〕`}</th>}
              </tr>
            </thead>
            <tbody>
              {per.map((p) => (
                <tr key={p.g} className={box.off.has(p.g) ? 'opacity-50' : ''}>
                  <td className={td}><UseCheck g={p.g} box={box} /></td>
                  <td className={`${td} font-bold`}>{p.g}</td>
                  <td className={td}>{p.n}{p.n < p.total && `（${p.total - p.n} 点は変換できず）`}</td>
                  <td className={td}>{p.fit ? showValue(p.fit.a, p.fit.sa) : '—'}</td>
                  {!view.through && <td className={td}>{p.fit ? showValue(p.fit.b, p.fit.sb) : '—'}</td>}
                </tr>
              ))}
              {whole && (
                <tr className="bg-slate-50 font-bold">
                  <td className={td} />
                  <td className={td}>全体</td>
                  <td className={td}>{a.used.length}</td>
                  <td className={td} data-testid="class-slope">{showValue(whole.a, whole.sa)}{su}</td>
                  {!view.through && <td className={td}>{showValue(whole.b, whole.sb)}</td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="no-print mt-2">
          <Btn onClick={saveCsv}>CSVで保存</Btn>
        </div>
      </Card>
    </>
  )
}

export function ClassResults({ cfg, onBack }: { cfg: ClassConfig; onBack: () => void }) {
  const [raw, setRaw] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [at, setAt] = useState<number | null>(null)
  const [auto, setAuto] = useState(false)
  const [off, setOff] = useState<Set<number>>(() => new Set())
  const busy = useRef(false)
  const [qr, setQr] = useState(false)
  const joinUrl = `${location.origin}${location.pathname}#k=${encodeClass(cfg)}`

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    const r = await fetchItems(cfg)
    busy.current = false
    setLoading(false)
    if (r.ok) {
      setRaw(r.items)
      setAt(Date.now())
      setError('')
    } else setError(errorText(r.error))
  }, [cfg])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => void load(), AUTO_MS)
    return () => clearInterval(id)
  }, [auto, load])

  const spread = useMemo(() => (cfg.kind === 'spread' ? parseSpreadItems(raw) : []), [cfg.kind, raw])
  const line = useMemo(() => (cfg.kind === 'line' ? parseLineItems(raw) : []), [cfg.kind, raw])
  const count = cfg.kind === 'spread' ? spread.length : line.length
  const box: UseBox = {
    off,
    toggle: (g) =>
      setOff((s) => {
        const n = new Set(s)
        if (n.has(g)) n.delete(g)
        else n.add(g)
        return n
      }),
  }

  return (
    <div className="min-h-dvh">
      <Header title="クラスの結果" onHome={onBack} />
      <main className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
        <Card>
          <h2 className="text-lg font-bold text-slate-900">{cfg.title || 'クラス集計'}</h2>
          <p className="mt-0.5 text-sm text-slate-600" role="status">
            部屋 {cfg.room} ／ 届いている班：<b data-testid="class-count">{count}</b>
            {at !== null && ` ／ ${hhmmss(at)} 現在`}
          </p>
          <div className="no-print mt-2 flex flex-wrap items-center gap-3">
            <Btn kind="primary" onClick={() => void load()} disabled={loading}>{loading ? '読みこみ中…' : '更新'}</Btn>
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[#0072b2]" />
              15秒ごとに自動で更新
            </label>
            <Btn onClick={() => setQr(true)}>参加用のQRコード</Btn>
          </div>
          {error && <p className="mt-2 text-sm text-vel">{error}</p>}
          {!error && at !== null && count === 0 && <p className="mt-2 text-sm text-slate-600">まだデータが届いていません。</p>}
        </Card>
        {cfg.kind === 'spread' && spread.length > 0 && <SpreadResults cfg={cfg} items={spread} box={box} />}
        {cfg.kind === 'line' && line.length > 0 && <LineResults cfg={cfg} items={line} box={box} />}
        {count > 0 && (
          <p className="no-print px-1 text-xs leading-relaxed text-slate-500">
            「使う」のチェックを外した班は、この画面の集計からだけ外れます（送られたデータは消えません）。
          </p>
        )}
      </main>
      {qr && <BigQr url={joinUrl} title={`${cfg.title || 'クラス集計'}（部屋 ${cfg.room}）`} onClose={() => setQr(false)} />}
    </div>
  )
}
