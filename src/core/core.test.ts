import { describe, expect, it } from 'vitest'
import { autoBinWidth, formatSig, histogram, linearFit, mean, niceTicks, originFit, roundWithUnc, runningMean, sd, se } from './stats'
import { TRANSFORMS, slopeUnit, transformOf } from './transform'
import { hasHeader, parseCell, splitTable, thin } from './parse'
import { analyze, emptySheet, emptyView, type Sheet } from './model'
import { decodeLine, decodeSpread, encodeLine, encodeSpread } from './share'
import { calc } from './calc'
import { makeRng } from './rng'
import { POWERS, makeMystery, judge } from './mystery'
import { SAMPLES, sampleRows } from '../data/samples'

describe('最小二乗法（仕様書の基準値）', () => {
  const x = [1, 2, 3, 4, 5]
  const y = [2.1, 3.9, 6.2, 7.8, 10.1]
  const f = linearFit(x, y)!
  it('和・傾き・切片・標準誤差・決定係数が有効数字6桁で一致', () => {
    expect([f.sx, f.sy, f.sxy, f.sxx].map((v) => formatSig(v, 6))).toEqual(['15.0000', '30.1000', '110.200', '55.0000'])
    expect(formatSig(f.a, 6)).toBe('1.99000')
    expect(formatSig(f.b, 6)).toBe('0.0500000')
    expect(formatSig(f.sa!, 6)).toBe('0.0597216')
    expect(formatSig(f.sb!, 6)).toBe('0.198074')
    expect(formatSig(f.r2!, 6)).toBe('0.997305')
  })
  it('原点を通る直線', () => {
    const o = originFit(x, y)!
    expect(formatSig(o.a, 6)).toBe('2.00364')
    expect(formatSig(o.sa!, 6)).toBe('0.0222866')
  })
  it('表示の丸め：1.99 ± 0.06、0.05 ± 0.20', () => {
    const a = roundWithUnc(f.a, f.sa!)!
    const b = roundWithUnc(f.b, f.sb!)!
    expect(`${a.value} ± ${a.unc}`).toBe('1.99 ± 0.06')
    expect(`${b.value} ± ${b.unc}`).toBe('0.05 ± 0.20')
  })
  it('点が少ないときは標準誤差を出さない', () => {
    expect(linearFit([1, 2], [1, 3])!.sa).toBeNull()
    expect(linearFit([1], [1])).toBeNull()
    expect(linearFit([2, 2, 2], [1, 2, 3])).toBeNull()
  })
})

describe('丸めと表示', () => {
  it('不確かさは1桁（先頭が1なら2桁）', () => {
    const r = (v: number, u: number) => {
      const x = roundWithUnc(v, u)!
      return `${x.value} ± ${x.unc}`
    }
    expect(r(1.414, 0.00702)).toBe('1.414 ± 0.007')
    expect(r(9.8123, 0.14)).toBe('9.81 ± 0.14')
    expect(r(9.8123, 0.096)).toBe('9.81 ± 0.10')
    expect(r(1234.5, 23)).toBe('1230 ± 20')
    expect(r(0.5, 0.3)).toBe('0.5 ± 0.3')
    expect(roundWithUnc(1, 0)).toBeNull()
  })
  it('有効数字の表示', () => {
    expect(formatSig(9.7963, 3)).toBe('9.80')
    expect(formatSig(40520, 3)).toBe('40500')
    expect(formatSig(0.000012345, 3)).toBe('1.23×10⁻⁵')
    expect(formatSig(0, 3)).toBe('0')
    expect(formatSig(-0.0217, 3)).toBe('-0.0217')
  })
  it('平均・標準偏差・標準誤差', () => {
    const d = [1.42, 1.38, 1.45, 1.4, 1.44, 1.41, 1.39, 1.43, 1.42, 1.4]
    expect(mean(d)).toBeCloseTo(1.414, 10)
    expect(sd(d)!).toBeCloseTo(0.0222111, 6)
    expect(se(d)!).toBeCloseTo(0.0070238, 6)
    expect(sd([1])).toBeNull()
    const rm = runningMean(d)
    expect(rm.length).toBe(10)
    expect(rm[0].se).toBeNull()
    expect(rm[9].mean).toBeCloseTo(1.414, 10)
  })
  it('目盛りと階級', () => {
    const t = niceTicks(0, 9.7)
    expect(t.min).toBe(0)
    expect(t.max).toBe(10)
    expect(t.step).toBe(2)
    expect(niceTicks(3, 3).ticks.length).toBeGreaterThan(1)
    const v = [1.38, 1.39, 1.4, 1.4, 1.41, 1.42, 1.42, 1.43, 1.44, 1.45]
    const w = autoBinWidth(v)
    expect(w).toBe(0.02)
    expect(histogram(v, w).reduce((s, b) => s + b.count, 0)).toBe(10)
  })
})

describe('軸の変換', () => {
  it('変換できない値は null（例外を出さない）', () => {
    expect(transformOf('sqrt').apply(-1)).toBeNull()
    expect(transformOf('inv').apply(0)).toBeNull()
    expect(transformOf('inv2').apply(0)).toBeNull()
    expect(transformOf('log').apply(0)).toBeNull()
    expect(transformOf('log').apply(-3)).toBeNull()
    expect(transformOf('sq').apply(-3)).toBe(9)
  })
  it('記号と単位が変換に合わせて変わる', () => {
    expect(transformOf('sq').sym('T')).toBe('T²')
    expect(transformOf('sq').unit('s')).toBe('s²')
    expect(transformOf('inv').unit('mL')).toBe('1/mL')
    expect(transformOf('inv2').unit('m')).toBe('1/m²')
    expect(transformOf('sqrt').unit('N')).toBe('√N')
    expect(transformOf('sq').unit('m/s')).toBe('(m/s)²')
    expect(transformOf('log').unit('V')).toBe('')
    expect(TRANSFORMS.length).toBe(7)
  })
  it('傾きの単位', () => {
    expect(slopeUnit('s²', 'm')).toBe('s²/m')
    expect(slopeUnit('hPa', '1/mL')).toBe('hPa·mL')
    expect(slopeUnit('m', 's²')).toBe('m/s²')
    expect(slopeUnit('', 's')).toBe('1/s')
    expect(slopeUnit('A', '')).toBe('A')
  })
})

describe('入力の整形', () => {
  it('全角の数字・小数点・マイナスを読める', () => {
    expect(parseCell('１．２５')).toEqual({ kind: 'num', value: 1.25 })
    expect(parseCell('－０．５')).toEqual({ kind: 'num', value: -0.5 })
    expect(parseCell(' 3.0e-2 ')).toEqual({ kind: 'num', value: 0.03 })
    expect(parseCell('1.2×10^-3')).toEqual({ kind: 'num', value: 0.0012 })
    expect(parseCell('1,234.5')).toEqual({ kind: 'num', value: 1234.5 })
    expect(parseCell('')).toEqual({ kind: 'empty' })
    expect(parseCell('abc')).toEqual({ kind: 'bad' })
    expect(parseCell('1.2.3')).toEqual({ kind: 'bad' })
  })
  it('表計算ソフトの貼り付け（タブ区切り）とCSV', () => {
    expect(splitTable('0.2\t0.90\r\n0.3\t1.10\r\n')).toEqual([['0.2', '0.90'], ['0.3', '1.10']])
    expect(splitTable('"Time (s)","Acceleration x (m/s^2)"\n0.01,9.79\n0.02,9.81')).toEqual([
      ['Time (s)', 'Acceleration x (m/s^2)'], ['0.01', '9.79'], ['0.02', '9.81'],
    ])
    expect(splitTable('1;2\n3;4')).toEqual([['1', '2'], ['3', '4']])
    expect(splitTable('1 2\n3 4')).toEqual([['1', '2'], ['3', '4']])
    expect(hasHeader([['L', 'T'], ['1', '2']])).toBe(true)
    expect(hasHeader([['1', '2']])).toBe(false)
  })
  it('行が多いときは等間隔に間引く', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i)
    const t = thin(rows, 50)
    expect(t.length).toBe(50)
    expect(t[0]).toBe(0)
    expect(t[49]).toBe(999)
  })
})

describe('直線化ラボの計算', () => {
  const sheet = (): Sheet => ({
    ...emptySheet(),
    x: { name: '糸の長さ', symbol: 'L', unit: 'm' },
    y: { name: '周期', symbol: 'T', unit: 's' },
    rows: [
      { x: '0.2', ys: ['0.90'] }, { x: '0.4', ys: ['1.27'] }, { x: 'abc', ys: ['1.0'] },
      { x: '0.8', ys: ['1.79'], off: true }, { x: '', ys: [''] }, { x: '1.0', ys: ['2.01'] },
    ],
  })
  it('読めないセルを除き、除外した点は計算に使わない', () => {
    const a = analyze(sheet(), { ...emptyView(), ty: 'sq' })
    expect([...a.bad]).toEqual(['2:x'])
    expect(a.pts.length).toBe(4)
    expect(a.used.length).toBe(3)
    expect(a.yLabel).toBe('T²〔s²〕')
    expect(a.slopeUnit).toBe('s²/m')
    expect(a.fit!.a).toBeCloseTo(4.04, 1)
  })
  it('変換できない値を含んでも例外が出ず、その行だけ除かれる', () => {
    const s = sheet()
    s.rows = [{ x: '-1', ys: ['2'] }, { x: '0', ys: ['3'] }, { x: '4', ys: ['-5'] }, { x: '9', ys: ['6'] }]
    for (const t of TRANSFORMS) for (const u of TRANSFORMS) {
      expect(() => analyze(s, { ...emptyView(), tx: t.id, ty: u.id })).not.toThrow()
    }
    expect(analyze(s, { ...emptyView(), tx: 'sqrt' }).dropped).toBe(1)
    expect(analyze(s, { ...emptyView(), tx: 'inv' }).dropped).toBe(1)
    expect(analyze(s, { ...emptyView(), ty: 'log' }).dropped).toBe(1)
  })
  it('くり返し測定は平均を使い、誤差棒を出す', () => {
    const s = sheet()
    s.yCols = 3
    s.rows = [{ x: '1', ys: ['2.0', '2.2', '2.4'] }, { x: '2', ys: ['4.1', '', '4.3'] }]
    const a = analyze(s, emptyView())
    expect(a.pts[0].y).toBeCloseTo(2.2, 10)
    expect(a.pts[0].hi! - a.pts[0].lo!).toBeCloseTo(2 * 0.11547, 4)
    expect(a.pts[1].y).toBeCloseTo(4.2, 10)
  })
})

describe('共有URL', () => {
  it('往復してもデータ・列名・単位・変換・直線が変わらない', () => {
    const s: Sheet = {
      title: '単振り子', x: { name: '糸の長さ', symbol: 'L', unit: 'm' }, y: { name: '周期', symbol: 'T', unit: 's' }, yCols: 2,
      rows: [{ x: '0.2', ys: ['0.90', '0.91'] }, { x: '０．４', ys: ['1.27', ''], off: true }, { x: '1.0', ys: ['2.01', '2.00'] }],
    }
    const v = { ...emptyView(), ty: 'sq' as const, through: true, lsq: true, line: { x1: 0, y1: 0, x2: 1, y2: 4.03 }, touched: true }
    const back = decodeLine(encodeLine(s, v))!
    expect(back.sheet).toEqual(s)
    expect(back.view.tx).toBe('id')
    expect(back.view.ty).toBe('sq')
    expect(back.view.through).toBe(true)
    expect(back.view.lsq).toBe(true)
    expect(back.view.line).toEqual(v.line)
  })
  it('50行のデータでも2000文字以内', () => {
    const rng = makeRng(5)
    const s = emptySheet()
    s.x = { name: '時間', symbol: 't', unit: 's' }
    s.y = { name: '落下距離', symbol: 'y', unit: 'm' }
    s.rows = Array.from({ length: 50 }, (_, i) => ({ x: (0.02 * (i + 1)).toFixed(2), ys: [(4.9 * (0.02 * (i + 1)) ** 2 * (1 + 0.02 * rng())).toPrecision(4)] }))
    const code = encodeLine(s, emptyView())
    const url = `https://shin-phys.github.io/inquiry_data_lab/?lab=line#d=${code}`
    expect(url.length).toBeLessThanOrEqual(2000)
    expect(decodeLine(code)!.sheet.rows.length).toBe(50)
  })
  it('こわれたデータは null を返す', () => {
    expect(decodeLine('xxxx')).toBeNull()
    expect(decodeLine('')).toBeNull()
    expect(decodeSpread('zzz')).toBeNull()
  })
  it('ばらつきラボの往復', () => {
    const d = { name: '周期', unit: 's', groups: [{ label: '1周期', text: '1.42\n1.38', off: [1] }] }
    expect(decodeSpread(encodeSpread(d))).toEqual(d)
  })
})

describe('電卓', () => {
  it('傾きから求める', () => {
    expect(calc('4*pi^2/a', { a: 4.03, b: 0 })!).toBeCloseTo(9.796, 3)
    expect(calc('2 × a', { a: 4.9, b: 0 })).toBeCloseTo(9.8, 10)
    expect(calc('sqrt(1/(a*0.5^2*4))', { a: 1, b: 0 })).toBeCloseTo(1, 10)
    expect(calc('-1/(a*2.30)', { a: -0.0217, b: 0 })!).toBeCloseTo(20.04, 1)
    expect(calc('a +', { a: 1, b: 0 })).toBeNull()
    expect(calc('c*2', { a: 1, b: 0 })).toBeNull()
    expect(calc('', { a: 1, b: 0 })).toBeNull()
  })
})

describe('練習用データ', () => {
  it('直線になる組を選ぶと、傾きが理論値の ±3% 以内', () => {
    expect(SAMPLES.length).toBe(9)
    for (const s of SAMPLES) {
      const sheet: Sheet = { ...emptySheet(), x: s.x, y: s.y, rows: sampleRows(s) }
      const a = analyze(sheet, { ...emptyView(), tx: s.best.tx, ty: s.best.ty })
      expect(a.used.length, s.id).toBe(s.fixed ? s.fixed.length : s.xs.length)
      expect(Math.abs(a.fit!.a - s.slope) / Math.abs(s.slope), `${s.id}: ${a.fit!.a} vs ${s.slope}`).toBeLessThan(0.03)
      expect(a.fit!.r2!, s.id).toBeGreaterThan(0.99)
    }
  })
  it('種を変えると別のデータになる', () => {
    const s = SAMPLES[1]
    expect(sampleRows(s, 1)).not.toEqual(sampleRows(s, 2))
    expect(sampleRows(s)).toEqual(sampleRows(s))
  })
})

describe('ミステリーデータ', () => {
  it('1万組すべてで、正しい変換の決定係数が最大で、原点を通る直線の傾きが k の ±5% 以内', () => {
    const rng = makeRng(77)
    for (let i = 0; i < 10000; i++) {
      const q = makeMystery(rng)
      let best = POWERS[0]
      let bestR2 = -Infinity
      for (const p of POWERS) {
        const X = q.xs.map((x) => transformOf(p.tx).apply(x)!)
        const r2 = linearFit(X, q.ys)!.r2!
        if (r2 > bestR2) {
          bestR2 = r2
          best = p
        }
      }
      expect(best.n, `n=${q.n} k=${q.k}`).toBe(q.n)
      const X = q.xs.map((x) => transformOf(POWERS.find((p) => p.n === q.n)!.tx).apply(x)!)
      const k = originFit(X, q.ys)!.a
      expect(judge(q, q.n, k)).toEqual({ nOk: true, kOk: true })
    }
  })
  it('判定', () => {
    const q = { n: 2, k: 4, xs: [], ys: [] }
    expect(judge(q, 2, 4.19)).toEqual({ nOk: true, kOk: true })
    expect(judge(q, 2, 4.3)).toEqual({ nOk: true, kOk: false })
    expect(judge(q, 1, 4)).toEqual({ nOk: false, kOk: true })
    expect(judge(q, null, null)).toEqual({ nOk: false, kOk: false })
  })
})
