// クラス集計：先生が用意した Google Apps Script（GAS）に、班の番号と数値だけを送って集める。
// 先生が配ったリンク（#k=…）から開いたときだけ使う。ふだんは外部と通信しない。
import LZString from 'lz-string'
import type { Col, Sheet } from './model'
import { mean, sd, se } from './stats'

export type ClassKind = 'spread' | 'line'

/** 先生が決める集計の設定。リンクの # 以降に入れて配る */
export type ClassConfig = {
  /** GAS のウェブアプリのURL（…/exec） */
  url: string
  /** 部屋の名前（授業ごとに変える） */
  room: string
  kind: ClassKind
  title: string
  /** 直線化ラボの横軸 */
  x: Col
  /** 直線化ラボの縦軸／ばらつきラボで測る量 */
  y: Col
}

export const MAX_GROUP = 60
export const CLASS_MAX_VALUES = 100
export const CLASS_MAX_ROWS = 50

/** GAS のURLを確かめて整える。使えないものは null（localhost は開発時のみ） */
export function cleanGasUrl(raw: string, allowLocal = false): string | null {
  try {
    const u = new URL(raw.trim())
    if (allowLocal && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u.origin + u.pathname
    if (u.protocol !== 'https:' || u.hostname !== 'script.google.com') return null
    if (!/^\/(macros|a\/macros\/[^/]+|a\/[^/]+\/macros)\/s\/[\w-]+\/exec$/.test(u.pathname)) return null
    return u.origin + u.pathname
  } catch {
    return null
  }
}

export const cleanRoom = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(v) ? v : '')

/** 部屋の名前を作る（読みまちがえやすい 0 O 1 I は使わない） */
export function newRoom(rand: () => number = Math.random): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const all = letters + '23456789'
  let s = letters[Math.floor(rand() * letters.length)]
  for (let i = 0; i < 5; i++) s += all[Math.floor(rand() * all.length)]
  return s
}

const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '')
const col = (v: unknown, sym: string): Col => {
  const a = Array.isArray(v) ? v : []
  return { name: str(a[0]), symbol: str(a[1], 12) || sym, unit: str(a[2], 20) }
}

export function encodeClass(c: ClassConfig): string {
  const p = { v: 1, k: 'class', u: c.url, r: c.room, m: c.kind, t: c.title, x: [c.x.name, c.x.symbol, c.x.unit], y: [c.y.name, c.y.symbol, c.y.unit] }
  return LZString.compressToEncodedURIComponent(JSON.stringify(p))
}

export function decodeClass(code: string, allowLocal = false): ClassConfig | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(code)
    if (!json) return null
    const p = JSON.parse(json)
    if (p?.v !== 1 || p?.k !== 'class') return null
    const url = typeof p.u === 'string' ? cleanGasUrl(p.u, allowLocal) : null
    const room = cleanRoom(p.r)
    if (!url || !room || (p.m !== 'spread' && p.m !== 'line')) return null
    return { url, room, kind: p.m, title: str(p.t, 60), x: col(p.x, 'x'), y: col(p.y, 'y') }
  } catch {
    return null
  }
}

// ---- 受け取ったデータの確認（サーバーから来たものも、そのままは信用しない） ----

export type SpreadItem = { g: number; t: number; values: number[] }
export type LineItem = { g: number; t: number; rows: [number, number][] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const groupOf = (v: unknown): number | null => (isNum(v) && Number.isInteger(v) && v >= 1 && v <= MAX_GROUP ? v : null)

function eachItem<T>(raw: unknown, pick: (d: Record<string, unknown>) => T | null): { g: number; t: number; data: T }[] {
  if (!Array.isArray(raw)) return []
  const by = new Map<number, { g: number; t: number; data: T }>()
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const g = groupOf(o.g)
    if (g === null || !o.d || typeof o.d !== 'object') continue
    const data = pick(o.d as Record<string, unknown>)
    if (data !== null) by.set(g, { g, t: isNum(o.t) ? o.t : 0, data })
  }
  return [...by.values()].sort((a, b) => a.g - b.g)
}

export function parseSpreadItems(raw: unknown): SpreadItem[] {
  return eachItem(raw, (d) => {
    const v = d.v
    return Array.isArray(v) && v.length >= 1 && v.length <= CLASS_MAX_VALUES && v.every(isNum) ? (v as number[]) : null
  }).map(({ g, t, data }) => ({ g, t, values: data }))
}

export function parseLineItems(raw: unknown): LineItem[] {
  return eachItem(raw, (d) => {
    const r = d.r
    if (!Array.isArray(r) || r.length < 1 || r.length > CLASS_MAX_ROWS) return null
    return r.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1])) ? (r as [number, number][]) : null
  }).map(({ g, t, data }) => ({ g, t, rows: data }))
}

// ---- 集計 ----

export type GroupStat = { g: number; n: number; mean: number; sd: number | null; se: number | null }

export const groupStat = (it: SpreadItem): GroupStat => ({ g: it.g, n: it.values.length, mean: mean(it.values), sd: sd(it.values), se: se(it.values) })

/** 直線化ラボのクラス集計用：班のデータを表の形にする */
export function sheetOf(cfg: ClassConfig, items: LineItem[]): Sheet {
  return {
    title: cfg.title,
    x: cfg.x,
    y: cfg.y,
    yCols: 1,
    rows: items.flatMap((it) => it.rows.map(([x, y]) => ({ x: String(x), ys: [String(y)] }))),
  }
}

// ---- 通信 ----

export type ApiError = 'network' | 'bad_response' | 'bad_request' | 'server_error'
export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: ApiError }

async function call(url: string, init: RequestInit, timeoutMs: number): Promise<ApiResult<{ body: Record<string, unknown> }>> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    // GAS は別のドメインへ転送して応答を返すので redirect: follow が必要
    const res = await fetch(url, { ...init, redirect: 'follow', signal: ac.signal, credentials: 'omit' })
    if (!res.ok) return { ok: false, error: 'network' }
    let body: unknown
    try {
      body = JSON.parse(await res.text())
    } catch {
      return { ok: false, error: 'bad_response' }
    }
    if (!body || typeof body !== 'object') return { ok: false, error: 'bad_response' }
    const b = body as Record<string, unknown>
    if (b.ok !== true) return { ok: false, error: b.error === 'bad_request' ? 'bad_request' : 'server_error' }
    return { ok: true, body: b }
  } catch {
    return { ok: false, error: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GAS につながるか確かめる */
export async function ping(url: string): Promise<ApiResult<object>> {
  const r = await call(`${url}?ping=1&_=${Date.now()}`, { method: 'GET' }, 15000)
  if (!r.ok) return r
  return r.body.app === 'inquiry_data_lab' ? { ok: true } : { ok: false, error: 'bad_response' }
}

export type Payload = { v: number[] } | { r: [number, number][] }

/**
 * 班のデータを送る。全員が同時に送ると GAS が混み合って失敗することがあるので、
 * つながらなかったとき・サーバー側の失敗のときは、少し待って2回までやり直す。
 */
export async function submit(cfg: ClassConfig, g: number, d: Payload, wait: (attempt: number) => number = (n) => 800 * n + Math.random() * 1500): Promise<ApiResult<{ t: number }>> {
  // Content-Type を text/plain にすると、事前確認（プリフライト）なしで送れる
  const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ room: cfg.room, kind: cfg.kind, g, d }) }
  let last: ApiResult<{ t: number }> = { ok: false, error: 'network' }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(wait(attempt))
    const r = await call(cfg.url, init, 30000)
    if (r.ok) return { ok: true, t: isNum(r.body.t) ? r.body.t : Date.now() }
    last = r
    if (r.error === 'bad_request' || r.error === 'bad_response') break
  }
  return last
}

/** 部屋に集まったデータを読む（番号ごとに最後に届いたもの） */
export async function fetchItems(cfg: ClassConfig): Promise<ApiResult<{ items: unknown }>> {
  const q = new URLSearchParams({ room: cfg.room, kind: cfg.kind, _: String(Date.now()) })
  const r = await call(`${cfg.url}?${q}`, { method: 'GET' }, 30000)
  return r.ok ? { ok: true, items: r.body.items } : r
}

export const errorText = (e: ApiError): string =>
  e === 'network'
    ? 'つながりませんでした。通信の状態を確かめて、もう一度ためしてください。'
    : e === 'bad_request'
      ? '送った内容を受け取ってもらえませんでした。値の数や番号を確かめてください。'
      : e === 'bad_response'
        ? '送り先から正しい返事がありませんでした。先生に知らせてください。'
        : '送り先でエラーが起きました。少し待って、もう一度ためしてください。'
