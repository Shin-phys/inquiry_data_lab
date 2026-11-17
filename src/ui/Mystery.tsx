import { useMemo, useState } from 'react'
import { analyze, emptyView, type Sheet, type View } from '../core/model'
import { POWERS, judge, makeMystery, type Mystery as Q } from '../core/mystery'
import { parseCell } from '../core/parse'
import { makeRng } from '../core/rng'
import { formatSig } from '../core/stats'
import { Workbench } from './Workbench'
import { Btn, Card, Header } from './common'

const TOTAL = 5

type Feedback = { nOk: boolean; kOk: boolean } | null

/** ミステリーデータ：y = k xⁿ の n と k を、直線化で当てる */
export function Mystery({ seed, onHome }: { seed: number | null; onHome: () => void }) {
  const rng = useMemo(() => (seed === null ? Math.random : makeRng(seed)), [seed])
  const [q, setQ] = useState<Q>(() => makeMystery(rng))
  const [num, setNum] = useState(1)
  const [view, setView] = useState<View>(() => ({ ...emptyView(), through: false }))
  const [pick, setPick] = useState<number | null>(null)
  const [kText, setKText] = useState('')
  const [fb, setFb] = useState<Feedback>(null)
  const [tries, setTries] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const sheet: Sheet = useMemo(
    () => ({
      title: `ミステリーデータ ${num}`,
      x: { name: 'x', symbol: 'x', unit: '' },
      y: { name: 'y', symbol: 'y', unit: '' },
      yCols: 1,
      rows: q.xs.map((x, i) => ({ x: String(x), ys: [String(q.ys[i])] })),
    }),
    [q, num],
  )
  const a = useMemo(() => analyze(sheet, view), [sheet, view])
  const solved = !!fb && fb.nOk && fb.kOk
  const finished = solved || revealed

  const check = () => {
    const c = parseCell(kText)
    const r = judge(q, pick, c.kind === 'num' ? c.value : null)
    setFb(r)
    if (r.nOk && r.kOk) setScore((s) => s + 1)
    else setTries((t) => t + 1)
  }
  const next = () => {
    if (num >= TOTAL) {
      setDone(true)
      return
    }
    setQ(makeMystery(rng, q.n))
    setNum(num + 1)
    setView({ ...emptyView() })
    setPick(null)
    setKText('')
    setFb(null)
    setTries(0)
    setRevealed(false)
  }
  const restart = () => {
    setScore(0)
    setDone(false)
    setQ(makeMystery(rng))
    setNum(1)
    setView({ ...emptyView() })
    setPick(null)
    setKText('')
    setFb(null)
    setTries(0)
    setRevealed(false)
  }

  if (done) {
    return (
      <div className="min-h-dvh">
        <Header title="ミステリーデータ" onHome={onHome} />
        <main className="mx-auto flex max-w-md flex-col gap-4 p-4 text-center">
          <Card>
            <p className="text-sm text-slate-500">自分の力で当てた数</p>
            <p className="text-5xl font-bold text-slate-900">
              {score}
              <span className="ml-1 text-xl">/ {TOTAL} 問</span>
            </p>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Btn kind="primary" onClick={restart}>もう一度</Btn>
            <Btn onClick={onHome}>もどる</Btn>
          </div>
        </main>
      </div>
    )
  }

  const answer = POWERS.find((p) => p.n === q.n)!

  return (
    <div className="min-h-dvh">
      <Header title="ミステリーデータ" onHome={onHome} right={<span className="text-sm text-slate-600">{num} / {TOTAL}</span>} />
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card>
          <Workbench a={a} view={view} setView={setView} title={sheet.title} settings={false} />
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="データ">
            <p className="mb-2 text-sm leading-relaxed text-slate-700">
              このデータは <b>y = k × x<sup>n</sup></b> の形の関係にしたがっています（測定の誤差を少し含みます）。横軸を変換して直線になる組を見つけ、n と k を当てよう。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-center text-sm tabular-nums">
                <tbody>
                  <tr><th className="pr-2 text-left text-slate-600">x</th>{q.xs.map((x, i) => <td key={i} className="border border-slate-200 px-1.5 py-1">{x}</td>)}</tr>
                  <tr><th className="pr-2 text-left text-slate-600">y</th>{q.ys.map((y, i) => <td key={i} className="border border-slate-200 px-1.5 py-1">{y}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="答え">
            <p className="mb-1 text-sm font-bold text-slate-700">① y と x の関係は？</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {POWERS.map((p) => (
                <button
                  key={p.n}
                  onClick={() => !finished && setPick(p.n)}
                  disabled={finished}
                  aria-pressed={pick === p.n}
                  className={`min-h-11 rounded-lg border-2 px-2 text-left text-sm ${pick === p.n ? 'border-pos bg-pos/10 font-bold' : 'border-slate-300 bg-white'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm font-bold text-slate-700">
              ② 比例定数 k は？（直線の傾きから読みとる）
              <input
                value={kText}
                onChange={(e) => setKText(e.target.value)}
                disabled={finished}
                inputMode="decimal"
                placeholder="例：3.2"
                className="mt-1 block h-11 w-40 rounded-lg border border-slate-300 px-2 text-base font-normal"
              />
            </label>
            {!finished && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn kind="primary" onClick={check} disabled={pick === null || kText.trim() === ''}>答え合わせ</Btn>
                {tries >= 2 && <Btn onClick={() => setRevealed(true)}>答えを見る</Btn>}
              </div>
            )}

            {fb && !solved && !revealed && (
              <div className="mt-3 rounded-xl bg-vel/10 px-3 py-2 text-sm leading-relaxed text-slate-800">
                <p className="font-bold text-vel">
                  {!fb.nOk ? '✕ 関係がちがいます' : '✕ 関係は合っています。k がちがいます'}
                </p>
                {!fb.nOk && <p>その変換で引いた直線は、原点を通っていますか？ 点は直線の上下にばらばらに散っていますか？</p>}
                {fb.nOk && !fb.kOk && <p>「原点を通す」をオンにして直線を合わせ、傾きを読みとろう。「最小二乗と比べる」も使えます。</p>}
                {tries >= 2 && <p className="mt-1 font-bold">「残差を見る」を押してみよう。ずれが山なり・谷なりに並んでいたら、その変換は直線ではありません。</p>}
              </div>
            )}
            {finished && (
              <div className={`mt-3 rounded-xl px-3 py-2 text-sm leading-relaxed ${solved ? 'bg-acc/10' : 'bg-slate-100'}`}>
                <p className={`text-base font-bold ${solved ? 'text-acc' : 'text-slate-700'}`}>{solved ? '○ 正解' : '答え'}</p>
                <p>
                  {answer.label}、k = {formatSig(q.k, 2)}
                </p>
                <p className="text-xs text-slate-500">k は ±5% 以内なら正解です。</p>
                <div className="mt-2 text-right">
                  <Btn kind="primary" onClick={next}>{num >= TOTAL ? '結果を見る' : '次の問題へ'}</Btn>
                </div>
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  )
}
