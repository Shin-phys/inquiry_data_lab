import { useState, type ReactNode } from 'react'
import { qrPath } from './exporting'

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 ${className}`}>
      {title && <h2 className="mb-2 text-sm font-bold text-slate-700">{title}</h2>}
      {children}
    </section>
  )
}

export function Btn({ onClick, children, kind = 'ghost', disabled }: { onClick: () => void; children: ReactNode; kind?: 'primary' | 'ghost'; disabled?: boolean }) {
  const cls = kind === 'primary' ? 'bg-pos text-white border-pos' : 'bg-white text-slate-700 border-slate-300'
  return (
    <button onClick={onClick} disabled={disabled} className={`min-h-11 rounded-lg border px-3 text-sm font-bold active:translate-y-px disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  )
}

export function Header({ title, onHome, right }: { title: string; onHome: () => void; right?: ReactNode }) {
  return (
    <header className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <button onClick={onHome} className="min-h-11 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100">
        ← もどる
      </button>
      <h1 className="flex-1 text-center text-base font-bold text-slate-800">{title}</h1>
      <div className="min-w-16 text-right">{right}</div>
    </header>
  )
}

/** 共有URLとQRコード */
export function ShareDialog({ url, onClose, title = '共有URL', note }: { url: string; onClose: () => void; title?: string; note?: string }) {
  const [copied, setCopied] = useState(false)
  const qr = qrPath(url)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="no-print fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="共有">
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          {note ?? 'このURLを開くと、同じデータ・変換・直線が再現されます。データはURLの中に入っていて、サーバーには送られません。'}
        </p>
        {qr ? (
          <svg viewBox={`-2 -2 ${qr.n + 4} ${qr.n + 4}`} className="mx-auto my-3 w-56" role="img" aria-label="QRコード" shapeRendering="crispEdges">
            <rect x={-2} y={-2} width={qr.n + 4} height={qr.n + 4} fill="#fff" />
            <path d={qr.d} fill="#000" />
          </svg>
        ) : (
          <p className="my-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">データが多いため、QRコードにできませんでした。URLをコピーして共有してください。</p>
        )}
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs" aria-label="共有URL" />
        <p className="mt-1 text-xs text-slate-500">URLの長さ：{url.length} 文字</p>
        <div className="mt-3 flex justify-end gap-2">
          <Btn onClick={copy}>{copied ? 'コピーしました' : 'URLをコピー'}</Btn>
          <Btn onClick={onClose} kind="primary">
            とじる
          </Btn>
        </div>
      </div>
    </div>
  )
}

/** QRコードを画面いっぱいに出す（教室のスクリーンに映して読み取ってもらう） */
export function BigQr({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const qr = qrPath(url)
  return (
    <div className="no-print fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white p-4" role="dialog" aria-label="QRコード" onClick={onClose}>
      <p className="text-center text-xl font-bold text-slate-900">{title}</p>
      {qr ? (
        <svg viewBox={`-3 -3 ${qr.n + 6} ${qr.n + 6}`} style={{ width: 'min(92vw, 76vh)', height: 'min(92vw, 76vh)' }} role="img" aria-label="大きなQRコード" shapeRendering="crispEdges">
          <rect x={-3} y={-3} width={qr.n + 6} height={qr.n + 6} fill="#fff" />
          <path d={qr.d} fill="#000" />
        </svg>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">QRコードにできませんでした。リンクをコピーして配ってください。</p>
      )}
      <Btn onClick={onClose} kind="primary">とじる</Btn>
    </div>
  )
}

/** アプリ自体を手元（localhost）で開いているか。開発用の模擬サーバーを使えるのはこのときだけ */
export const IS_LOCAL = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')

/** 端末内への保存（使えなくても動く） */
export function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
export function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 保存できなくても続行する
  }
}
