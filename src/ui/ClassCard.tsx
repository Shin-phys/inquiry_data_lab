// クラス集計に参加しているときだけ、ラボの中に出す「クラスに送る」カード
import { useState } from 'react'
import { MAX_GROUP, errorText, submit, type ClassConfig, type Payload } from '../core/classroom'
import { Btn, Card, loadJson, saveJson } from './common'

const groupKey = (room: string) => `inquiry_data_lab.class.g.${room}`
const hhmm = (t: number) => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; at: number } | { kind: 'error'; text: string }

export function ClassBanner({ cfg }: { cfg: ClassConfig }) {
  return (
    <p className="no-print bg-sky-50 px-3 py-1.5 text-center text-xs text-sky-900">
      クラス集計に参加中：<b>{cfg.title || 'クラス集計'}</b>（部屋 {cfg.room}）
    </p>
  )
}

export function ClassCard({ cfg, payload, what, onResults }: { cfg: ClassConfig; payload: Payload | null; what: string; onResults: () => void }) {
  const [g, setG] = useState<number>(() => {
    const v = loadJson<number>(groupKey(cfg.room))
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_GROUP ? v : 0
  })
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const pick = (v: number) => {
    setG(v)
    if (v) saveJson(groupKey(cfg.room), v)
  }
  const send = async () => {
    if (!payload || !g || status.kind === 'sending') return
    setStatus({ kind: 'sending' })
    const r = await submit(cfg, g, payload)
    setStatus(r.ok ? { kind: 'sent', at: Date.now() } : { kind: 'error', text: errorText(r.error) })
  }

  return (
    <Card title="クラスに送る" className="no-print ring-2 ring-sky-200">
      <p className="text-sm leading-relaxed text-slate-700">
        「{cfg.title || 'クラス集計'}」に、この画面の数値を送って、クラス全体でまとめます。
      </p>
      <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className="font-bold">班の番号</span>
        <select value={g} onChange={(e) => pick(Number(e.target.value))} aria-label="班の番号" className="h-11 rounded-lg border border-slate-300 bg-white px-2 text-base">
          <option value={0}>えらぶ</option>
          {Array.from({ length: MAX_GROUP }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500">（1人ずつ測ったときは、先生の指示した番号）</span>
      </label>
      <p className="mt-2 text-sm text-slate-700">{payload ? what : '数値を入力すると送れます。'}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn kind="primary" onClick={() => void send()} disabled={!payload || !g || status.kind === 'sending'}>
          {status.kind === 'sending' ? '送っています…' : status.kind === 'sent' ? 'もう一度送る' : 'クラスに送る'}
        </Btn>
        <Btn onClick={onResults}>クラスの結果を見る</Btn>
      </div>
      <p className="mt-2 min-h-5 text-sm" role="status">
        {status.kind === 'sent' && <span className="font-bold text-acc">{g} 番として送りました（{hhmm(status.at)}）。送り直すと、前のデータと入れかわります。</span>}
        {status.kind === 'error' && <span className="text-vel">{status.text}</span>}
        {status.kind === 'idle' && !g && payload && <span className="text-slate-500">班の番号をえらぶと送れます。</span>}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        送るのは「班の番号」と「数値」だけです。送り先は、先生が用意した Google スプレッドシートです。
      </p>
    </Card>
  )
}
