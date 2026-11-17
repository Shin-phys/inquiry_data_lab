import type { ClassConfig } from '../core/classroom'
import { SAMPLES } from '../data/samples'

type Props = {
  /** クラス集計のリンクから開いたとき */
  cls: ClassConfig | null
  onClassLab: () => void
  onClassResults: () => void
  onSetup: () => void
  onLine: () => void
  onSample: (id: string) => void
  onSpread: () => void
  onMystery: () => void
}

export function Home({ cls, onClassLab, onClassResults, onSetup, onLine, onSample, onSpread, onMystery }: Props) {
  const card = (title: string, desc: string, action: string, onClick: () => void, primary = false) => (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex-1">
        <p className="font-bold text-slate-900">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{desc}</p>
      </div>
      <button
        onClick={onClick}
        className={`min-h-14 shrink-0 rounded-xl px-5 font-bold shadow-sm active:translate-y-px ${primary ? 'bg-pos text-white' : 'border-2 border-pos bg-white text-pos'}`}
      >
        {action}
      </button>
    </div>
  )
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">探究データラボ</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          測定値をグラフにして、<b>直線になる関係</b>をさがそう
        </p>
      </header>

      {cls && (
        <section className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-4">
          <p className="text-xs font-bold text-sky-900">クラス集計に参加中（部屋 {cls.room}）</p>
          <p className="mt-0.5 font-bold text-slate-900">{cls.title || 'クラス集計'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={onClassLab} className="min-h-12 rounded-xl bg-pos px-4 font-bold text-white shadow-sm active:translate-y-px">測定値を入力して送る</button>
            <button onClick={onClassResults} className="min-h-12 rounded-xl border-2 border-pos bg-white px-4 font-bold text-pos active:translate-y-px">クラスの結果を見る</button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {card('直線化ラボ', '2つの量の関係を調べる。軸を変換して直線になる組をさがし、傾きから物理量を求める', 'はじめる', onLine, true)}
        {card('ばらつきラボ', '同じ量をくり返し測った値を整理し、結果を「平均 ± 不確かさ」で書く', 'はじめる', onSpread)}
        {card('ミステリーデータ', '関係が伏せられたデータの正体を、直線化で当てる（5問）', '挑戦する', onMystery)}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">練習用データで直線化をためす</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <button key={s.id} onClick={() => onSample(s.id)} className="min-h-14 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm active:translate-y-px">
              <span className="block text-sm font-bold text-slate-800">{s.title}</span>
              <span className="block text-xs text-slate-500">{s.about}</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs leading-relaxed text-slate-500">
        <p>入力したデータはこの端末の中だけで処理し、外部には送りません。</p>
        <p className="mt-1">
          例外は、先生が配ったクラス集計のリンクから開いて「クラスに送る」を押したときだけです（班の番号と数値を、先生のスプレッドシートに送ります）。
        </p>
        <p className="mt-1">作業の内容は自動で端末に保存され、次に開いたときに続きから始められます。</p>
        <p className="mt-3">
          <button onClick={onSetup} className="min-h-11 rounded-lg px-3 text-sm text-slate-600 underline underline-offset-2">
            先生用：クラスで集める
          </button>
        </p>
      </footer>
    </div>
  )
}
