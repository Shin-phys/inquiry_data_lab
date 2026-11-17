// 先生用：クラス集計の準備。GAS のURLと集める内容を決めて、生徒に配るリンクを作る
import { useEffect, useMemo, useState } from 'react'
import gasCode from '../../gas/Code.gs?raw'
import { cleanGasUrl, cleanRoom, encodeClass, errorText, newRoom, ping, type ClassConfig, type ClassKind } from '../core/classroom'
import { BigQr, Btn, Card, Header, IS_LOCAL, loadJson, saveJson } from './common'
import { qrPath } from './exporting'

const KEY = 'inquiry_data_lab.class.setup.v1'

type Form = {
  url: string
  kind: ClassKind
  title: string
  room: string
  xName: string; xSym: string; xUnit: string
  yName: string; ySym: string; yUnit: string
}
const emptyForm = (): Form => ({ url: '', kind: 'spread', title: '', room: newRoom(), xName: '', xSym: 'x', xUnit: '', yName: '', ySym: 'y', yUnit: '' })

type Check = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok' } | { kind: 'ng'; text: string }

const inp = 'h-11 min-w-0 rounded-lg border border-slate-300 px-2 text-sm'

export function ClassSetup({ onBack, onOpen }: { onBack: () => void; onOpen: (cfg: ClassConfig) => void }) {
  const [f, setF] = useState<Form>(() => ({ ...emptyForm(), ...(loadJson<Partial<Form>>(KEY) ?? {}) }))
  const [check, setCheck] = useState<Check>({ kind: 'idle' })
  const [copied, setCopied] = useState('')
  const [big, setBig] = useState(false)
  const set = (patch: Partial<Form>) => setF((s) => ({ ...s, ...patch }))

  useEffect(() => saveJson(KEY, f), [f])

  const url = cleanGasUrl(f.url, IS_LOCAL)
  const room = cleanRoom(f.room)
  const cfg: ClassConfig | null = useMemo(
    () =>
      url && room
        ? {
            url, room, kind: f.kind, title: f.title.trim(),
            x: { name: f.xName.trim(), symbol: f.xSym.trim() || 'x', unit: f.xUnit.trim() },
            y: { name: f.yName.trim(), symbol: f.ySym.trim() || 'y', unit: f.yUnit.trim() },
          }
        : null,
    [url, room, f],
  )
  const base = `${location.origin}${location.pathname}`
  const studentUrl = cfg ? `${base}#k=${encodeClass(cfg)}` : ''
  const resultUrl = cfg ? `${base}?view=class#k=${encodeClass(cfg)}` : ''
  const qr = studentUrl ? qrPath(studentUrl) : null

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      setCopied('')
    }
  }
  const test = async () => {
    if (!url) return
    setCheck({ kind: 'busy' })
    const r = await ping(url)
    setCheck(
      r.ok
        ? { kind: 'ok' }
        : {
            kind: 'ng',
            text:
              r.error === 'network' || r.error === 'bad_response'
                ? 'つながりませんでした。デプロイの「アクセスできるユーザー」が「全員」になっているか、URLが「ウェブアプリ」のもの（…/exec）かを確かめてください。'
                : errorText(r.error),
          },
    )
  }

  return (
    <div className="min-h-dvh">
      <Header title="クラスで集める（先生用）" onHome={onBack} />
      <main className="mx-auto flex max-w-2xl flex-col gap-3 p-3">
        <Card>
          <p className="text-sm leading-relaxed text-slate-700">
            班ごとの測定値を1か所に集めて、クラス全体のグラフにまとめます。集める先は、先生自身の Google スプレッドシートです。
            生徒から送られるのは<b>班の番号と数値だけ</b>で、氏名やアカウントの情報は送られません。
          </p>
        </Card>

        <Card title="1. 準備（最初の1回だけ）">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
            <li>Google スプレッドシートを新しく作る。</li>
            <li>メニューの「拡張機能」→「Apps Script」を開く。</li>
            <li>
              最初から入っているコードを消して、下のボタンでコピーしたコードを貼り付け、保存する。
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Btn onClick={() => void copy('code', gasCode)}>{copied === 'code' ? 'コピーしました' : 'GAS のコードをコピー'}</Btn>
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-500">コピーできないときは、ここから選んでコピー</summary>
                <textarea readOnly value={gasCode} rows={6} onFocus={(e) => e.currentTarget.select()} aria-label="GAS のコード" className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs" />
              </details>
            </li>
            <li>
              右上の「デプロイ」→「新しいデプロイ」→ 種類で「ウェブアプリ」をえらび、
              <b>次のユーザーとして実行：自分</b>、<b>アクセスできるユーザー：全員</b> にしてデプロイする（初回は承認の画面が出ます）。
            </li>
            <li>表示された「ウェブアプリ」のURL（…/exec で終わる）を、下に貼る。</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={f.url} onChange={(e) => { set({ url: e.target.value }); setCheck({ kind: 'idle' }) }} placeholder="https://script.google.com/macros/s/…/exec" aria-label="GAS のURL" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={`${inp} flex-1 basis-64`} />
            <Btn onClick={() => void test()} disabled={!url || check.kind === 'busy'}>{check.kind === 'busy' ? '確かめています…' : '接続を確かめる'}</Btn>
          </div>
          <p className="mt-1 min-h-5 text-sm" role="status">
            {f.url.trim() !== '' && !url && <span className="text-vel">GAS のウェブアプリのURL（https://script.google.com/…/exec）を入れてください。</span>}
            {check.kind === 'ok' && <span className="font-bold text-acc">つながりました。</span>}
            {check.kind === 'ng' && <span className="text-vel">{check.text}</span>}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            学校のアカウントでは「全員」をえらべない設定になっていることがあります。その場合は、個人の Google アカウントで作るか、管理者に確認してください。
            URLを知っている人は誰でも数値を送れるので、リンクは授業の中だけで配ってください。
          </p>
        </Card>

        <Card title="2. 集める内容">
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['spread', 'ばらつきラボ', '同じ量をくり返し測る（例：同じ振り子の周期）'],
              ['line', '直線化ラボ', '条件を変えて測る（例：糸の長さと周期）'],
            ] as const).map(([k, name, desc]) => (
              <button key={k} onClick={() => set({ kind: k })} aria-pressed={f.kind === k} className={`rounded-xl border-2 p-3 text-left ${f.kind === k ? 'border-pos bg-sky-50' : 'border-slate-200 bg-white'}`}>
                <span className="block text-sm font-bold text-slate-900">{name}</span>
                <span className="block text-xs text-slate-600">{desc}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="タイトル（例：振り子の周期）" aria-label="タイトル" maxLength={60} className={inp} />
            {f.kind === 'line' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-xs font-bold text-slate-600">横軸</span>
                <input value={f.xName} onChange={(e) => set({ xName: e.target.value })} placeholder="量の名前（例：糸の長さ）" aria-label="横軸の量の名前" maxLength={40} className={`${inp} flex-1 basis-40`} />
                <input value={f.xSym} onChange={(e) => set({ xSym: e.target.value })} placeholder="記号" aria-label="横軸の記号" maxLength={12} className={`${inp} w-16`} />
                <input value={f.xUnit} onChange={(e) => set({ xUnit: e.target.value })} placeholder="単位" aria-label="横軸の単位" maxLength={20} className={`${inp} w-20`} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-10 text-xs font-bold text-slate-600">{f.kind === 'line' ? '縦軸' : '測る量'}</span>
              <input value={f.yName} onChange={(e) => set({ yName: e.target.value })} placeholder="量の名前（例：周期）" aria-label="測る量の名前" maxLength={40} className={`${inp} flex-1 basis-40`} />
              {f.kind === 'line' && <input value={f.ySym} onChange={(e) => set({ ySym: e.target.value })} placeholder="記号" aria-label="縦軸の記号" maxLength={12} className={`${inp} w-16`} />}
              <input value={f.yUnit} onChange={(e) => set({ yUnit: e.target.value })} placeholder="単位" aria-label="測る量の単位" maxLength={20} className={`${inp} w-20`} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-10 text-xs font-bold text-slate-600">部屋</span>
              <input value={f.room} onChange={(e) => set({ room: e.target.value })} aria-label="部屋の名前" maxLength={32} autoCapitalize="off" className={`${inp} w-40 font-mono`} />
              <Btn onClick={() => set({ room: newRoom() })}>新しい部屋にする</Btn>
            </div>
            {!room && <p className="text-sm text-vel">部屋の名前は、半角の英数字（- と _ も可）で入れてください。</p>}
            <p className="text-xs leading-relaxed text-slate-500">
              部屋ごとにデータが分かれます。クラスや授業が変わるたびに「新しい部屋にする」を押すと、前のデータと混ざりません。
            </p>
          </div>
        </Card>

        <Card title="3. 生徒に配る">
          {!cfg ? (
            <p className="text-sm text-slate-600">GAS のURLと部屋の名前を入れると、配るためのQRコードとリンクができます。</p>
          ) : (
            <>
              {qr ? (
                <svg viewBox={`-2 -2 ${qr.n + 4} ${qr.n + 4}`} className="mx-auto my-2 w-64" role="img" aria-label="生徒用のQRコード" shapeRendering="crispEdges">
                  <rect x={-2} y={-2} width={qr.n + 4} height={qr.n + 4} fill="#fff" />
                  <path d={qr.d} fill="#000" />
                </svg>
              ) : (
                <p className="my-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">QRコードにできませんでした。下のリンクをコピーして配ってください。</p>
              )}
              <input readOnly value={studentUrl} onFocus={(e) => e.currentTarget.select()} aria-label="生徒用のリンク" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs" />
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn onClick={() => setBig(true)} disabled={!qr}>QRコードを大きく映す</Btn>
                <Btn onClick={() => void copy('student', studentUrl)}>{copied === 'student' ? 'コピーしました' : '生徒用のリンクをコピー'}</Btn>
                <Btn onClick={() => void copy('result', resultUrl)}>{copied === 'result' ? 'コピーしました' : '結果画面のリンクをコピー'}</Btn>
                <Btn kind="primary" onClick={() => onOpen(cfg)}>クラスの結果を開く</Btn>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                生徒がこのリンクを開くと、{cfg.kind === 'spread' ? 'ばらつきラボ' : '直線化ラボ'}に「クラスに送る」が出ます。結果画面は生徒も見られます。
                集まったデータは、スプレッドシートの「class_data」シートに1行ずつ記録されます。
              </p>
            </>
          )}
        </Card>
      </main>
      {big && cfg && <BigQr url={studentUrl} title={`${cfg.title || 'クラス集計'}（部屋 ${cfg.room}）`} onClose={() => setBig(false)} />}
    </div>
  )
}
