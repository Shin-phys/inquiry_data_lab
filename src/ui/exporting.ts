// 画像・CSV の書き出しと、QRコード
import qrcode from 'qrcode-generator'

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** CSV を保存する（Excel で文字化けしないよう BOM をつける） */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = rows.map((r) => r.map(esc).join(',')).join('\r\n')
  downloadBlob(name, new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
}

/** 画面上の SVG を、横 width ピクセルの PNG（白背景）にする。つまみなど操作用の部品は取り除く */
export async function svgToPng(svg: SVGSVGElement, width = 1600): Promise<Blob> {
  const vb = svg.viewBox.baseVal
  const height = Math.round((width * vb.height) / vb.width)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-ui]').forEach((el) => el.remove())
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const xml = new XMLSerializer().serializeToString(clone)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('画像に変換できませんでした'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像に変換できませんでした')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像に変換できませんでした'))), 'image/png'),
  )
}

/** QRコードを SVG のパスにする。n は1辺のマス数 */
export function qrPath(text: string): { n: number; d: string } | null {
  try {
    const qr = qrcode(0, 'L')
    qr.addData(text, 'Byte')
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { n, d }
  } catch {
    return null
  }
}

/** ファイル名に使えない文字を取り除く */
export const safeName = (s: string, fallback: string) => (s.trim().replace(/[\\/:*?"<>|\s]+/g, '_') || fallback)
