import { useEffect, useMemo, useState } from 'react'
import { decodeLine, decodeSpread, type SpreadShare } from '../core/share'
import { sampleById } from '../data/samples'
import { Home } from './Home'
import { LineLab, sampleInit, type LineInit } from './LineLab'
import { Mystery } from './Mystery'
import { SpreadLab } from './SpreadLab'

type Screen =
  | { name: 'home' }
  | { name: 'line'; init: LineInit | null; key: number }
  | { name: 'spread'; init: SpreadShare | null; key: number }
  | { name: 'mystery'; key: number }

/**
 * URL：?lab=line|spread|mystery　&sample=pendulum など　&seed=数字　&big=1
 * 共有データは # 以降（#d=… 直線化ラボ、#s=… ばらつきラボ）
 */
function readUrl(): { screen: Screen; seed: number | null; big: boolean; badShare: boolean } {
  const p = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  const seedNum = Number(p.get('seed'))
  const seed = p.get('seed') !== null && Number.isFinite(seedNum) ? seedNum : null
  const big = p.get('big') === '1'
  const lab = p.get('lab')
  let badShare = false
  let screen: Screen = { name: 'home' }
  const d = hash.get('d')
  const s = hash.get('s')
  const sample = sampleById(p.get('sample'))
  if (d) {
    const dec = decodeLine(d)
    if (dec) screen = { name: 'line', init: dec, key: 0 }
    else badShare = true
  } else if (s) {
    const dec = decodeSpread(s)
    if (dec) screen = { name: 'spread', init: dec, key: 0 }
    else badShare = true
  } else if (sample) screen = { name: 'line', init: sampleInit(sample, seed ?? undefined), key: 0 }
  else if (lab === 'line') screen = { name: 'line', init: null, key: 0 }
  else if (lab === 'spread') screen = { name: 'spread', init: null, key: 0 }
  else if (lab === 'mystery') screen = { name: 'mystery', key: 0 }
  return { screen, seed, big, badShare }
}

export default function App() {
  const init = useMemo(readUrl, [])
  const [screen, setScreen] = useState<Screen>(init.screen)

  useEffect(() => {
    document.documentElement.classList.toggle('big', init.big)
  }, [init.big])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  const home = () => {
    // 共有URLから開いたあとにトップへ戻ったら、URLのデータ部分を消す
    try {
      history.replaceState(null, '', location.pathname + (init.big ? '?big=1' : ''))
    } catch {
      // 何もしない
    }
    setScreen({ name: 'home' })
  }
  const key = Date.now()

  if (screen.name === 'line') return <LineLab key={screen.key} init={screen.init} onHome={home} />
  if (screen.name === 'spread') return <SpreadLab key={screen.key} init={screen.init} onHome={home} />
  if (screen.name === 'mystery') return <Mystery key={screen.key} seed={init.seed} onHome={home} />
  return (
    <>
      {init.badShare && <p className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">共有URLのデータを読み取れませんでした。</p>}
      <Home
        onLine={() => setScreen({ name: 'line', init: null, key })}
        onSample={(id) => {
          const s = sampleById(id)
          if (s) setScreen({ name: 'line', init: sampleInit(s, init.seed ?? undefined), key })
        }}
        onSpread={() => setScreen({ name: 'spread', init: null, key })}
        onMystery={() => setScreen({ name: 'mystery', key })}
      />
    </>
  )
}
