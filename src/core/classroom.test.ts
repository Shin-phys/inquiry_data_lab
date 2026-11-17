import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeGas } from '../../gas/mock-server.mjs'
import { analyze, emptyView } from './model'
import {
  cleanGasUrl, cleanRoom, decodeClass, encodeClass, fetchItems, groupStat, newRoom, parseLineItems, parseSpreadItems, ping, sheetOf, submit,
  type ClassConfig,
} from './classroom'
import { makeRng } from './rng'
import { formatSig } from './stats'

const URL_OK = 'https://script.google.com/macros/s/AKfycbx_abc-123/exec'
const cfg: ClassConfig = {
  url: URL_OK, room: 'K4P2QX', kind: 'spread', title: '振り子の周期',
  x: { name: '', symbol: 'x', unit: '' }, y: { name: '周期', symbol: 'T', unit: 's' },
}

describe('GAS のURLの確認', () => {
  it('ウェブアプリのURLだけを通す', () => {
    expect(cleanGasUrl(URL_OK)).toBe(URL_OK)
    expect(cleanGasUrl(` ${URL_OK}?usp=sharing `)).toBe(URL_OK)
    expect(cleanGasUrl('https://script.google.com/a/macros/example.ed.jp/s/AKfy_1/exec')).not.toBeNull()
    expect(cleanGasUrl('https://script.google.com/a/example.ed.jp/macros/s/AKfy_1/exec')).not.toBeNull()
  })
  it('それ以外は通さない', () => {
    for (const u of [
      '', 'abc', 'http://script.google.com/macros/s/AK/exec', 'https://example.com/macros/s/AK/exec',
      'https://script.google.com/macros/s/AK/dev', 'https://script.google.com.evil.example/macros/s/AK/exec',
      'https://docs.google.com/spreadsheets/d/xxx/edit', 'http://localhost:8787/exec', 'javascript:alert(1)',
    ]) expect(cleanGasUrl(u)).toBeNull()
  })
  it('localhost は開発時だけ', () => {
    expect(cleanGasUrl('http://localhost:8787/exec', true)).toBe('http://localhost:8787/exec')
  })
})

describe('部屋の名前と設定の受け渡し', () => {
  it('部屋の名前は英字で始まる6文字', () => {
    const rng = makeRng(3)
    for (let i = 0; i < 200; i++) {
      const r = newRoom(rng)
      expect(r).toMatch(/^[A-HJ-NP-Z][A-HJ-NP-Z2-9]{5}$/)
      expect(cleanRoom(r)).toBe(r)
    }
    expect(cleanRoom('1年3組')).toBe('')
    expect(cleanRoom('a b')).toBe('')
  })
  it('設定をURLに入れて、元にもどせる', () => {
    expect(decodeClass(encodeClass(cfg))).toEqual(cfg)
    const line: ClassConfig = { ...cfg, kind: 'line', x: { name: '糸の長さ', symbol: 'L', unit: 'm' } }
    expect(decodeClass(encodeClass(line))).toEqual(line)
  })
  it('送り先が GAS でない設定は読まない', () => {
    expect(decodeClass(encodeClass({ ...cfg, url: 'https://example.com/collect' }))).toBeNull()
    expect(decodeClass(encodeClass({ ...cfg, room: 'x y' }))).toBeNull()
    expect(decodeClass('こわれた文字列')).toBeNull()
  })
})

describe('受け取ったデータの確認', () => {
  it('形の合わないものは捨てる', () => {
    const raw = [
      { g: 2, t: 5, d: { v: [1.4, 1.5] } },
      { g: 1, t: 3, d: { v: [1.2] } },
      { g: 0, t: 1, d: { v: [9] } },
      { g: 3, t: 1, d: { v: ['1.2'] } },
      { g: 4, t: 1, d: { v: [] } },
      { g: 5.5, t: 1, d: { v: [1] } },
      null, 'x',
    ]
    expect(parseSpreadItems(raw)).toEqual([{ g: 1, t: 3, values: [1.2] }, { g: 2, t: 5, values: [1.4, 1.5] }])
    expect(parseSpreadItems('x')).toEqual([])
    expect(parseLineItems([{ g: 1, t: 1, d: { r: [[1, 2], [2, 4]] } }, { g: 2, t: 1, d: { r: [[1, 'a']] } }, { g: 3, t: 1, d: { r: [[1, 2, 3]] } }])).toEqual([
      { g: 1, t: 1, rows: [[1, 2], [2, 4]] },
    ])
  })
  it('班ごとの平均・標準偏差・標準誤差', () => {
    const s = groupStat({ g: 1, t: 0, values: [1.42, 1.38, 1.45, 1.4] })
    expect(s.n).toBe(4)
    expect(formatSig(s.mean, 5)).toBe('1.4125')
    expect(formatSig(s.sd!, 4)).toBe('0.02986')
    expect(formatSig(s.se!, 4)).toBe('0.01493')
    expect(groupStat({ g: 2, t: 0, values: [1.4] }).se).toBeNull()
  })
  it('全班の点を1つの表にまとめて、直線をあてはめられる', () => {
    const line: ClassConfig = { ...cfg, kind: 'line' }
    const sheet = sheetOf(line, [{ g: 1, t: 0, rows: [[1, 2], [2, 4]] }, { g: 2, t: 0, rows: [[3, 6], [1e-7, 2e-7]] }])
    const a = analyze(sheet, emptyView())
    expect(a.used.length).toBe(4)
    expect(a.fit!.a).toBeCloseTo(2, 10)
  })
})

describe('GAS のコード（Code.gs を模擬環境で動かす）', () => {
  const post = (gas: ReturnType<typeof makeGas>, o: unknown) => gas.post(JSON.stringify(o))
  it('接続の確認に答える', () => {
    expect(makeGas().get({ ping: '1' })).toEqual({ ok: true, app: 'inquiry_data_lab', v: 1 })
  })
  it('送ったデータを、部屋と種類ごとに読み出せる', () => {
    const gas = makeGas()
    expect(post(gas, { room: 'A', kind: 'spread', g: 2, d: { v: [1.4, 1.5] } }).ok).toBe(true)
    expect(post(gas, { room: 'A', kind: 'spread', g: 1, d: { v: [1.2] } }).ok).toBe(true)
    expect(post(gas, { room: 'B', kind: 'spread', g: 1, d: { v: [9] } }).ok).toBe(true)
    expect(post(gas, { room: 'A', kind: 'line', g: 1, d: { r: [[1, 2]] } }).ok).toBe(true)
    const a = gas.get({ room: 'A', kind: 'spread' })
    expect(a.ok).toBe(true)
    expect(parseSpreadItems(a.items).map((i) => [i.g, i.values])).toEqual([[1, [1.2]], [2, [1.4, 1.5]]])
    expect(parseLineItems(gas.get({ room: 'A', kind: 'line' }).items).map((i) => i.rows)).toEqual([[[1, 2]]])
    expect(gas.get({ room: 'C', kind: 'spread' })).toEqual({ ok: true, items: [] })
  })
  it('同じ番号から送り直すと、あとのデータに入れかわる', () => {
    const gas = makeGas()
    post(gas, { room: 'A', kind: 'spread', g: 3, d: { v: [1, 2, 3] } })
    post(gas, { room: 'A', kind: 'spread', g: 3, d: { v: [4, 5] } })
    expect(parseSpreadItems(gas.get({ room: 'A', kind: 'spread' }).items)).toMatchObject([{ g: 3, values: [4, 5] }])
    // 記録としては2行とも残る（見出し行＋2行）
    expect(gas.sheets.get('class_data')!.rows.length).toBe(3)
  })
  it('数や真偽値に見える部屋の名前でも取りちがえない', () => {
    const gas = makeGas()
    for (const room of ['0123', '123', 'TRUE', '1e5']) post(gas, { room, kind: 'spread', g: 1, d: { v: [room.length] } })
    for (const room of ['0123', '123', 'TRUE', '1e5']) {
      expect(parseSpreadItems(gas.get({ room, kind: 'spread' }).items)).toMatchObject([{ g: 1, values: [room.length] }])
    }
  })
  it('数値以外や大きすぎるデータは受け取らない', () => {
    const gas = makeGas()
    const bad = { ok: false, error: 'bad_request' }
    expect(post(gas, { room: 'A', kind: 'spread', g: 1, d: { v: ['1.2'] } })).toEqual(bad)
    expect(post(gas, { room: 'A', kind: 'spread', g: 1, d: { v: [] } })).toEqual(bad)
    expect(post(gas, { room: 'A', kind: 'spread', g: 1, d: { v: Array(101).fill(1) } })).toEqual(bad)
    expect(post(gas, { room: 'A', kind: 'spread', g: 0, d: { v: [1] } })).toEqual(bad)
    expect(post(gas, { room: 'A', kind: 'spread', g: 61, d: { v: [1] } })).toEqual(bad)
    expect(post(gas, { room: 'A', kind: 'spread', g: 1.5, d: { v: [1] } })).toEqual(bad)
    expect(post(gas, { room: '1年3組', kind: 'spread', g: 1, d: { v: [1] } })).toEqual(bad)
    expect(post(gas, { room: 'A', kind: 'other', g: 1, d: { v: [1] } })).toEqual(bad)
    expect(post(gas, { room: 'A', kind: 'line', g: 1, d: { r: [[1, 2, 3]] } })).toEqual(bad)
    expect(post(gas, { room: 'A', kind: 'line', g: 1, d: { r: Array(51).fill([1, 2]) } })).toEqual(bad)
    expect(gas.post('x'.repeat(20001))).toEqual(bad)
    expect(gas.post('{こわれたJSON')).toEqual({ ok: false, error: 'server_error' })
    expect(gas.post(undefined)).toEqual(bad)
    expect(gas.get({ room: 'A' })).toEqual(bad)
    expect(gas.sheets.get('class_data')).toBeUndefined()
  })
  it('数値以外の項目（名前など）が付いていても保存しない', () => {
    const gas = makeGas()
    post(gas, { room: 'A', kind: 'spread', g: 1, name: '氏名', d: { v: [1.2], memo: '氏名' } })
    const rows = gas.sheets.get('class_data')!.rows
    expect(JSON.stringify(rows)).not.toContain('氏名')
    expect(rows[1].slice(1)).toEqual(['A', 'spread', 1, '{"v":[1.2]}', 'k:spread:A'])
  })
})

describe('通信（fetch を模擬サーバーにつなぐ）', () => {
  afterEach(() => vi.unstubAllGlobals())
  /** GAS の代わりに模擬環境へつなぐ fetch。fail 回目までは失敗させる */
  const wire = (gas: ReturnType<typeof makeGas>, fail = 0) => {
    let calls = 0
    const f = vi.fn(async (input: string, init?: RequestInit) => {
      calls++
      if (calls <= fail) throw new TypeError('Failed to fetch')
      const body = init?.method === 'POST' ? gas.post(init.body) : gas.get(Object.fromEntries(new URL(input).searchParams))
      return new Response(JSON.stringify(body), { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    return f
  }
  it('確認・送信・読み出し', async () => {
    const gas = makeGas()
    const f = wire(gas)
    expect(await ping(cfg.url)).toEqual({ ok: true })
    expect((await submit(cfg, 4, { v: [1.41, 1.39] })).ok).toBe(true)
    const r = await fetchItems(cfg)
    expect(r.ok && parseSpreadItems(r.items)).toMatchObject([{ g: 4, values: [1.41, 1.39] }])
    // 事前確認なしで送れる形（text/plain）になっている
    const post = f.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(post[1]!.headers).toEqual({ 'Content-Type': 'text/plain;charset=utf-8' })
    expect(JSON.parse(String(post[1]!.body))).toEqual({ room: 'K4P2QX', kind: 'spread', g: 4, d: { v: [1.41, 1.39] } })
  })
  it('つながらないときは2回までやり直す', async () => {
    const gas = makeGas()
    const f = wire(gas, 2)
    expect((await submit(cfg, 1, { v: [1] }, () => 0)).ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(3)
    wire(gas, 3)
    expect(await submit(cfg, 1, { v: [1] }, () => 0)).toEqual({ ok: false, error: 'network' })
  })
  it('受け取ってもらえない内容は、やり直さない', async () => {
    const f = wire(makeGas())
    expect(await submit(cfg, 99, { v: [1] }, () => 0)).toEqual({ ok: false, error: 'bad_request' })
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('GAS 以外の返事（ログイン画面など）は失敗として扱う', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>ログイン</html>', { status: 200 })))
    expect(await ping(cfg.url)).toEqual({ ok: false, error: 'bad_response' })
  })
})
