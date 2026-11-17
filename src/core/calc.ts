// 「傾きから求める」用の小さな電卓。使える文字は a（傾き）、b（切片）、pi。
// 使える記号: + - * / ^ ( ) sqrt()

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) i++
    else if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      out.push({ k: 'num', v: Number(src.slice(i, j)) })
      i = j
    } else if (/[A-Za-zπ]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-zπ]/.test(src[j])) j++
      out.push({ k: 'id', v: src.slice(i, j) })
      i = j
    } else if ('+-*/^()×÷'.includes(c)) {
      out.push({ k: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c })
      i++
    } else throw new Error(`使えない文字: ${c}`)
  }
  return out
}

/** 式を計算する。式が正しくなければ null */
export function calc(src: string, vars: Record<string, number>): number | null {
  try {
    const toks = tokenize(src.replace(/[－−]/g, '-').replace(/＊/g, '*').replace(/／/g, '/'))
    if (!toks.length) return null
    let p = 0
    const isOp = (v: string) => toks[p]?.k === 'op' && toks[p].v === v
    const expr = (): number => {
      let n = term()
      while (isOp('+') || isOp('-')) n = toks[p++].v === '+' ? n + term() : n - term()
      return n
    }
    const term = (): number => {
      let n = unary()
      while (isOp('*') || isOp('/')) n = toks[p++].v === '*' ? n * unary() : n / unary()
      return n
    }
    const unary = (): number => {
      if (isOp('-')) {
        p++
        return -unary()
      }
      const base = primary()
      if (isOp('^')) {
        p++
        return Math.pow(base, unary())
      }
      return base
    }
    const primary = (): number => {
      const t = toks[p]
      if (!t) throw new Error('式が途中で終わっています')
      if (t.k === 'num') {
        p++
        return t.v
      }
      if (t.k === 'id') {
        p++
        if (t.v === 'sqrt') {
          if (!isOp('(')) throw new Error('( が必要')
          p++
          const v = expr()
          if (!isOp(')')) throw new Error(') が必要')
          p++
          return Math.sqrt(v)
        }
        if (t.v === 'pi' || t.v === 'π') return Math.PI
        if (t.v in vars) return vars[t.v]
        throw new Error(`使えない文字: ${t.v}`)
      }
      if (isOp('(')) {
        p++
        const v = expr()
        if (!isOp(')')) throw new Error(') が必要')
        p++
        return v
      }
      throw new Error('式が正しくありません')
    }
    const v = expr()
    if (p !== toks.length) return null
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}
