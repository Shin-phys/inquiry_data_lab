import { SAMPLES } from '../data/samples'

type Props = {
  onLine: () => void
  onSample: (id: string) => void
  onSpread: () => void
  onMystery: () => void
}

export function Home({ onLine, onSample, onSpread, onMystery }: Props) {
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
        <p className="mt-1">作業の内容は自動で端末に保存され、次に開いたときに続きから始められます。</p>
      </footer>
    </div>
  )
}
