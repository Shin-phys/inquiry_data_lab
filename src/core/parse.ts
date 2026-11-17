// 入力の整形と、貼り付け・CSV の読み取り

const ZEN = '０１２３４５６７８９'

/** 全角の数字・小数点・マイナスなどを半角に直す */
export function normalize(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String(ZEN.indexOf(c)))
    .replace(/[．。]/g, '.')
    .replace(/，/g, ',')
    .replace(/[－−‐―ー]/g, '-')
    .replace(/＋/g, '+')
    .replace(/[ｅＥ]/g, 'e')
    .replace(/[\s　]+/g, '')
    .replace(/[×xX]10\^?\(?(-?\d+)\)?/, 'e$1')
}

export type Cell = { kind: 'empty' } | { kind: 'num'; value: number } | { kind: 'bad' }

/** セルの文字列を数値として読む */
export function parseCell(raw: string): Cell {
  let s = normalize(raw ?? '')
  if (s === '') return { kind: 'empty' }
  // 1,234.5 のような3桁区切りは取り除く
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return { kind: 'bad' }
  const v = Number(s)
  return Number.isFinite(v) ? { kind: 'num', value: v } : { kind: 'bad' }
}

/** 1行を区切り文字で分ける（"…" で囲まれた項目に対応） */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === delim) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/**
 * 表計算ソフトからの貼り付けや CSV の文字列を、行×列の文字列にする。
 * 区切りは タブ・セミコロン・カンマ のうち最も多いものを使い、どれもなければ空白で分ける。
 */
export function splitTable(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lines.length) return []
  const head = lines.slice(0, 10).join('\n')
  const count = (re: RegExp) => (head.match(re) ?? []).length
  const cands: [string, number][] = [
    ['\t', count(/\t/g)],
    [';', count(/;/g)],
    [',', count(/,/g)],
  ]
  cands.sort((a, b) => b[1] - a[1])
  if (cands[0][1] === 0) return lines.map((l) => l.trim().split(/\s+/))
  return lines.map((l) => splitLine(l, cands[0][0]))
}

/** 1行目が見出し（数値でない項目を含む）かどうか */
export function hasHeader(rows: string[][]): boolean {
  if (!rows.length) return false
  return rows[0].some((c) => c !== '' && parseCell(c).kind === 'bad')
}

/** 行数が多すぎるとき、等間隔に max 行へ間引く */
export function thin<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows
  return Array.from({ length: max }, (_, i) => rows[Math.round((i * (rows.length - 1)) / (max - 1))])
}
