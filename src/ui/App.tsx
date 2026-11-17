import { useEffect, useMemo, useState } from 'react'
import { decodeClass, type ClassConfig } from '../core/classroom'
import { decodeLine, decodeSpread, type SpreadShare } from '../core/share'
import { sampleById } from '../data/samples'
import { ClassResults } from './ClassResults'
import { ClassSetup } from './ClassSetup'
import { Home } from './Home'
import { LineLab, sampleInit, type LineInit } from './LineLab'
import { Mystery } from './Mystery'
import { SpreadLab } from './SpreadLab'
import { IS_LOCAL } from './common'

type Screen =
  | { name: 'home' }
  | { name: 'line'; init: LineInit | null; key: number }
  | { name: 'spread'; init: SpreadShare | null; key: number }
  | { name: 'mystery'; key: number }
  | { name: 'setup' }
  | { name: 'class'; cfg: ClassConfig; back: Screen }

/**
 * URL：?lab=line|spread|mystery　&sample=pendulum など　&seed=数字　&big=1
 * 共有データは # 以降（#d=… 直線化ラボ、#s=… ばらつきラボ）
 * クラス集計は #k=…（先生が配るリンク）。?view=class を付けると結果画面を開く
 */
function readUrl(): { screen: Screen; seed: number | null; big: boolean; badShare: boolean; cls: ClassConfig | null } {
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
  const k = hash.get('k')
  const cls = k ? decodeClass(k, IS_LOCAL) : null
  const sample = sampleById(p.get('sample'))
  if (k) {
    if (!cls) badShare = true
    else if (p.get('view') === 'class') screen = { name: 'class', cfg: cls, back: { name: 'home' } }
    else screen = cls.kind === 'line' ? { name: 'line', init: null, key: 0 } : { name: 'spread', init: null, key: 0 }
  } else if (d) {
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
  return { screen, seed, big, badShare, cls }
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
    // 共有URLから開いたあとにトップへ戻ったら、URLのデータ部分を消す。
    // クラス集計のリンクは、読みこみ直しても参加したままにするため残す
    if (!cls) {
      try {
        history.replaceState(null, '', location.pathname + (init.big ? '?big=1' : ''))
      } catch {
        // 何もしない
      }
    }
    setScreen({ name: 'home' })
  }
  const key = Date.now()
  const cls = init.cls
  const results = (cfg: ClassConfig, back: Screen) => setScreen({ name: 'class', cfg, back })

  if (screen.name === 'line') {
    const c = cls?.kind === 'line' && !screen.init ? cls : null
    return <LineLab key={screen.key} init={screen.init} onHome={home} cls={c} onResults={() => c && results(c, screen)} />
  }
  if (screen.name === 'spread') {
    const c = cls?.kind === 'spread' && !screen.init ? cls : null
    return <SpreadLab key={screen.key} init={screen.init} onHome={home} cls={c} onResults={() => c && results(c, screen)} />
  }
  if (screen.name === 'mystery') return <Mystery key={screen.key} seed={init.seed} onHome={home} />
  if (screen.name === 'setup') return <ClassSetup onBack={home} onOpen={(cfg) => results(cfg, screen)} />
  if (screen.name === 'class') return <ClassResults cfg={screen.cfg} onBack={() => (screen.back.name === 'home' ? home() : setScreen(screen.back))} />
  return (
    <>
      {init.badShare && <p className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">共有URLのデータを読み取れませんでした。</p>}
      <Home
        cls={cls}
        onClassLab={() => cls && setScreen(cls.kind === 'line' ? { name: 'line', init: null, key } : { name: 'spread', init: null, key })}
        onClassResults={() => cls && results(cls, { name: 'home' })}
        onSetup={() => setScreen({ name: 'setup' })}
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
