// 開発用：Code.gs を手元の Node で動かす模擬サーバー。
// GAS を用意しなくても、クラス集計の画面を試せる（データはメモリの中だけ）。
//   node gas/mock-server.mjs [ポート番号]
//   → http://localhost:8787/exec を「クラスで集める」のURL欄に入れる
//     （localhost のURLは、アプリ自体を localhost で開いているときだけ受け付ける）
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const code = readFileSync(fileURLToPath(new URL('./Code.gs', import.meta.url)), 'utf8')

/** Code.gs が使う Google のサービスを、最小限だけまねる */
export function makeGas(source = code) {
  const sheets = new Map()
  const makeSheet = () => {
    const rows = []
    // スプレッドシートと同じように、数や真偽値に見える文字列は読みかえて保存する
    const coerce = (v) => {
      if (typeof v !== 'string') return v
      if (/^[-+]?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v)) return Number(v)
      if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true'
      return v
    }
    return {
      rows,
      appendRow: (r) => void rows.push(r.map(coerce)),
      setFrozenRows: () => {},
      getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    }
  }
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets.get(n) ?? null,
      insertSheet: (n) => {
        const s = makeSheet()
        sheets.set(n, s)
        return s
      },
    }),
  }
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (text) => ({ text, setMimeType() { return this } }),
  }
  const LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) }
  const api = new Function('SpreadsheetApp', 'ContentService', 'LockService', `${source}\nreturn { doGet: doGet, doPost: doPost };`)(
    SpreadsheetApp, ContentService, LockService,
  )
  return {
    sheets,
    get: (parameter) => JSON.parse(api.doGet({ parameter }).text),
    post: (contents) => JSON.parse(api.doPost({ postData: { contents } }).text),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gas = makeGas()
  const port = Number(process.argv[2]) || 8787
  createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify(obj))
    }
    if (req.method === 'GET') return send(gas.get(Object.fromEntries(url.searchParams)))
    if (req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => send(gas.post(body)))
      return
    }
    res.writeHead(405)
    res.end()
  }).listen(port, () => console.log(`mock GAS: http://localhost:${port}/exec`))
}
