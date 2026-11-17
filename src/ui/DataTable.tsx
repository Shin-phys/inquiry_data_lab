import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { MAX_ROWS, MAX_Y_COLS, emptyRow, type Analysis, type Col, type Row, type Sheet, type View } from '../core/model'
import { hasHeader, splitTable, thin } from '../core/parse'
import { formatSig } from '../core/stats'
import { Btn } from './common'

type Props = {
  sheet: Sheet
  setSheet: (fn: (s: Sheet) => Sheet) => void
  a: Analysis
  view: View
}

/** 「Time (s)」のような見出しを、名前と単位に分ける */
function splitHeader(h: string): { name: string; unit: string } {
  const m = h.match(/^(.*?)\s*[([〔［（]\s*(.*?)\s*[)\]〕］）]\s*$/)
  return m ? { name: m[1], unit: m[2] } : { name: h, unit: '' }
}

function ColFields({ label, col, onChange }: { label: string; col: Col; onChange: (c: Col) => void }) {
  const field = (key: keyof Col, ph: string, w: string) => (
    <input
      value={col[key]}
      onChange={(e) => onChange({ ...col, [key]: e.target.value })}
      placeholder={ph}
      aria-label={`${label}の${ph}`}
      className={`h-10 rounded-md border border-slate-300 px-2 text-sm ${w}`}
    />
  )
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 text-xs font-bold text-slate-600">{label}</span>
      {field('name', '量の名前', 'min-w-0 flex-1')}
      {field('symbol', '記号', 'w-16')}
      {field('unit', '単位', 'w-20')}
    </div>
  )
}

type Picker = { grid: string[][]; headers: string[]; named: boolean; xi: number; yi: number; total: number }

export function DataTable({ sheet, setSheet, a, view }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [picker, setPicker] = useState<Picker | null>(null)
  const [note, setNote] = useState('')
  const showX = view.tx !== 'id'
  const showY = view.ty !== 'id'
  const byRow = new Map(a.pts.map((p) => [p.row, p]))

  const setCell = (r: number, c: number, value: string) =>
    setSheet((s) => {
      const rows = s.rows.map((row, i) => {
        if (i !== r) return row
        if (c === 0) return { ...row, x: value }
        const ys = row.ys.slice()
        ys[c - 1] = value
        return { ...row, ys }
      })
      // 最後の行に入力したら、次の行を足す
      if (r === rows.length - 1 && value !== '' && rows.length < MAX_ROWS) rows.push(emptyRow(s.yCols))
      return { ...s, rows }
    })

  /** 貼り付けた表を、(r, c) を左上にして流し込む */
  const fill = (grid: string[][], r0: number, c0: number) =>
    setSheet((s) => {
      const width = Math.max(...grid.map((g) => g.length))
      const yCols = Math.min(MAX_Y_COLS, Math.max(s.yCols, c0 + width - 1))
      const rows: Row[] = s.rows.map((row) => ({ ...row, ys: Array.from({ length: yCols }, (_, j) => row.ys[j] ?? '') }))
      grid.forEach((cells, i) => {
        const r = r0 + i
        if (r >= MAX_ROWS) return
        while (rows.length <= r) rows.push(emptyRow(yCols))
        cells.forEach((v, j) => {
          const c = c0 + j
          if (c === 0) rows[r] = { ...rows[r], x: v }
          else if (c - 1 < yCols) {
            const ys = rows[r].ys.slice()
            ys[c - 1] = v
            rows[r] = { ...rows[r], ys }
          }
        })
      })
      if (rows.length < MAX_ROWS && rows[rows.length - 1].x !== '') rows.push(emptyRow(yCols))
      return { ...s, yCols, rows }
    })

  const onPaste = (r: number, c: number) => (ev: ClipboardEvent<HTMLInputElement>) => {
    const text = ev.clipboardData.getData('text')
    if (!/[\t\n]/.test(text.trim())) return
    ev.preventDefault()
    let grid = splitTable(text)
    if (hasHeader(grid)) grid = grid.slice(1)
    if (!grid.length) return
    if (r + grid.length > MAX_ROWS) setNote(`表は ${MAX_ROWS} 行までです。${MAX_ROWS} 行を超えた分は取り込んでいません。`)
    else setNote('')
    fill(grid, r, c)
  }

  const onKey = (r: number, c: number) => (ev: KeyboardEvent<HTMLInputElement>) => {
    const go = (rr: number, cc: number) => {
      const el = document.querySelector<HTMLInputElement>(`[data-cell="${rr}:${cc}"]`)
      if (el) {
        ev.preventDefault()
        el.focus()
        el.select()
      }
    }
    if (ev.key === 'Enter' || ev.key === 'ArrowDown') go(r + 1, c)
    else if (ev.key === 'ArrowUp') go(r - 1, c)
  }

  const applyCsv = (p: Picker) => {
    const body = thin(p.grid, MAX_ROWS)
    const hx = splitHeader(p.headers[p.xi] ?? '')
    const hy = splitHeader(p.headers[p.yi] ?? '')
    setSheet((s) => ({
      ...s,
      x: p.named ? { name: hx.name, symbol: s.x.symbol || 'x', unit: hx.unit } : s.x,
      y: p.named ? { name: hy.name, symbol: s.y.symbol || 'y', unit: hy.unit } : s.y,
      yCols: 1,
      rows: body.map((g) => ({ x: g[p.xi] ?? '', ys: [g[p.yi] ?? ''] })),
    }))
    setNote(p.total > MAX_ROWS ? `${p.total} 行のデータを、等間隔に ${MAX_ROWS} 行へ間引いて読み込みました。` : '')
    setPicker(null)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    let grid = splitTable(text)
    let headers: string[] = []
    if (hasHeader(grid)) {
      headers = grid[0]
      grid = grid.slice(1)
    }
    if (!grid.length) {
      setNote('読み込めるデータが見つかりませんでした。')
      return
    }
    const width = Math.max(...grid.map((g) => g.length))
    const p: Picker = { grid, headers, named: headers.length > 0, xi: 0, yi: Math.min(1, width - 1), total: grid.length }
    if (width <= 2) applyCsv(p)
    else setPicker({ ...p, headers: headers.length ? headers : Array.from({ length: width }, (_, i) => `${i + 1}列目`) })
  }

  const setYCols = (n: number) =>
    setSheet((s) => ({ ...s, yCols: n, rows: s.rows.map((r) => ({ ...r, ys: Array.from({ length: n }, (_, j) => r.ys[j] ?? '') })) }))

  const clearAll = () => {
    if (!window.confirm('表のデータをすべて消します。よろしいですか？')) return
    setSheet((s) => ({ ...s, rows: Array.from({ length: 8 }, () => emptyRow(s.yCols)) }))
    setNote('')
  }

  const cell = (r: number, c: number, value: string) => (
    <input
      data-cell={`${r}:${c}`}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => setCell(r, c, e.target.value)}
      onPaste={onPaste(r, c)}
      onKeyDown={onKey(r, c)}
      aria-label={`${r + 1}行目 ${c === 0 ? sheet.x.symbol : `${sheet.y.symbol}${sheet.yCols > 1 ? c : ''}`}`}
      className={`cell ${a.bad.has(`${r}:${c === 0 ? 'x' : `y${c - 1}`}`) ? 'cell-bad' : ''}`}
    />
  )
  const ySyms = Array.from({ length: sheet.yCols }, (_, j) => (sheet.yCols > 1 ? `${sheet.y.symbol}${'₁₂₃₄₅'[j]}` : sheet.y.symbol))

  return (
    <div className="flex flex-col gap-3">
      <div className="no-print flex flex-col gap-2">
        <input
          value={sheet.title}
          onChange={(e) => setSheet((s) => ({ ...s, title: e.target.value }))}
          placeholder="グラフのタイトル（例：単振り子の周期）"
          aria-label="グラフのタイトル"
          className="h-10 rounded-md border border-slate-300 px-2 text-sm"
        />
        <ColFields label="横軸" col={sheet.x} onChange={(x) => setSheet((s) => ({ ...s, x }))} />
        <ColFields label="縦軸" col={sheet.y} onChange={(y) => setSheet((s) => ({ ...s, y }))} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-xs text-slate-600">
              <th className="no-print w-9 font-normal">使う</th>
              <th className="font-bold">
                {sheet.x.symbol}
                {sheet.x.unit && `〔${sheet.x.unit}〕`}
              </th>
              {ySyms.map((s) => (
                <th key={s} className="font-bold">
                  {s}
                  {sheet.y.unit && `〔${sheet.y.unit}〕`}
                </th>
              ))}
              {showX && <th className="font-bold text-pos">{a.xLabel}</th>}
              {showY && <th className="font-bold text-pos">{a.yLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => {
              const p = byRow.get(r)
              const filled = row.x.trim() !== '' || row.ys.some((y) => y.trim() !== '')
              return (
                <tr key={r} className={`${row.off ? 'opacity-50' : ''} ${filled ? '' : 'no-print'}`}>
                  <td className="no-print text-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={!row.off}
                      disabled={!filled}
                      onChange={(e) => setSheet((s) => ({ ...s, rows: s.rows.map((x, i) => (i === r ? { ...x, off: !e.target.checked || undefined } : x)) }))}
                      aria-label={`${r + 1}行目を計算に使う`}
                    />
                  </td>
                  <td>{cell(r, 0, row.x)}</td>
                  {ySyms.map((_, j) => (
                    <td key={j}>{cell(r, j + 1, row.ys[j] ?? '')}</td>
                  ))}
                  {showX && <td><div className="cell cell-ro flex items-center justify-end">{p ? formatSig(p.X, 4) : filled ? '—' : ''}</div></td>}
                  {showY && <td><div className="cell cell-ro flex items-center justify-end">{p ? formatSig(p.Y, 4) : filled ? '—' : ''}</div></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {a.bad.size > 0 && <p className="text-sm text-vel">赤いわくのセルは数値として読めないため、グラフから除いています。</p>}
      {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{note}</p>}

      <div className="no-print flex flex-wrap gap-2">
        <Btn onClick={() => setSheet((s) => (s.rows.length < MAX_ROWS ? { ...s, rows: [...s.rows, emptyRow(s.yCols)] } : s))} disabled={sheet.rows.length >= MAX_ROWS}>
          行を追加
        </Btn>
        <Btn onClick={() => setYCols(sheet.yCols + 1)} disabled={sheet.yCols >= MAX_Y_COLS}>
          測定の列を増やす
        </Btn>
        {sheet.yCols > 1 && <Btn onClick={() => setYCols(sheet.yCols - 1)}>列を減らす</Btn>}
        <Btn onClick={() => fileRef.current?.click()}>CSVを読み込む</Btn>
        <Btn onClick={clearAll}>すべて消す</Btn>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <p className="no-print text-xs leading-relaxed text-slate-500">
        Excel やスプレッドシートのセルをコピーして、表にそのまま貼り付けられます。同じ条件でくり返し測ったときは「測定の列を増やす」で列を足すと、平均をグラフに使います（最大 {MAX_Y_COLS} 列・{MAX_ROWS} 行）。
      </p>

      {picker && (
        <div className="no-print fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={() => setPicker(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="列の選択">
            <h2 className="text-base font-bold text-slate-800">どの列を使いますか？</h2>
            <p className="mt-1 text-sm text-slate-600">{picker.total} 行・{picker.headers.length} 列のデータです。</p>
            {(['xi', 'yi'] as const).map((k) => (
              <label key={k} className="mt-3 block text-sm font-bold text-slate-700">
                {k === 'xi' ? '横軸に使う列' : '縦軸に使う列'}
                <select
                  value={picker[k]}
                  onChange={(e) => setPicker({ ...picker, [k]: Number(e.target.value) })}
                  className="mt-1 block h-11 w-full rounded-lg border border-slate-300 px-2 font-normal"
                >
                  {picker.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="mt-4 flex justify-end gap-2">
              <Btn onClick={() => setPicker(null)}>やめる</Btn>
              <Btn kind="primary" onClick={() => applyCsv(picker)}>
                読み込む
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
