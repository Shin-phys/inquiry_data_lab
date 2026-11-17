/**
 * 探究データラボ クラス集計用（Google Apps Script）
 *
 * 使い方
 *  1. Google スプレッドシートを新しく作る
 *  2. 「拡張機能」→「Apps Script」を開き、最初から入っているコードを消して、このコードを貼り付けて保存する
 *  3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *       次のユーザーとして実行：自分
 *       アクセスできるユーザー：全員
 *  4. 表示された「ウェブアプリ」のURL（…/exec）を、探究データラボの「クラスで集める」に貼る
 *
 * 受け取るのは「部屋の名前・種類・班の番号・数値」だけ。氏名などは受け取らない。
 * 受け取ったデータは、このスプレッドシートの「class_data」シートに1行ずつ追記する。
 * 同じ部屋・同じ番号から送り直されたときは、あとから届いたものを使う。
 */

var SHEET_NAME = 'class_data';
var VERSION = 1;
var MAX_BODY = 20000; // 1回に受け取る文字数の上限
var MAX_GROUP = 60; // 班の番号の上限
var MAX_VALUES = 100; // ばらつきラボ：1回に受け取る値の数
var MAX_ROWS = 50; // 直線化ラボ：1回に受け取る行数

/** 集計の読み出し：?room=部屋&kind=spread|line　／　接続の確認：?ping=1 */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.ping) return json_({ ok: true, app: 'inquiry_data_lab', v: VERSION });
    var room = cleanRoom_(p.room);
    var kind = cleanKind_(p.kind);
    if (!room || !kind) return json_({ ok: false, error: 'bad_request' });
    return json_({ ok: true, items: readItems_(room, kind) });
  } catch (err) {
    return json_({ ok: false, error: 'server_error' });
  }
}

/** データの受け取り：本文は JSON の文字列 {room, kind, g, d} */
function doPost(e) {
  var lock = null;
  try {
    var body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || body.length === 0 || body.length > MAX_BODY) {
      return json_({ ok: false, error: 'bad_request' });
    }
    var req = JSON.parse(body);
    var room = cleanRoom_(req.room);
    var kind = cleanKind_(req.kind);
    var g = Number(req.g);
    var d = cleanData_(kind, req.d);
    if (!room || !kind || !d || g !== Math.floor(g) || g < 1 || g > MAX_GROUP) {
      return json_({ ok: false, error: 'bad_request' });
    }
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var now = new Date();
    sheet_().appendRow([now, room, kind, g, JSON.stringify(d), key_(room, kind)]);
    return json_({ ok: true, t: now.getTime() });
  } catch (err) {
    return json_({ ok: false, error: 'server_error' });
  } finally {
    if (lock) {
      try {
        lock.releaseLock();
      } catch (err2) {
        // 何もしない
      }
    }
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 部屋の名前：半角の英数字・ハイフン・下線で1〜32文字 */
function cleanRoom_(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(v) ? v : '';
}

function cleanKind_(v) {
  return v === 'spread' || v === 'line' ? v : '';
}

function isNum_(v) {
  return typeof v === 'number' && isFinite(v);
}

/** 数値だけを取り出して作り直す（余計な項目は捨てる）。形が違えば null */
function cleanData_(kind, d) {
  if (!d || typeof d !== 'object') return null;
  var i;
  if (kind === 'spread') {
    if (!Array.isArray(d.v) || d.v.length < 1 || d.v.length > MAX_VALUES) return null;
    for (i = 0; i < d.v.length; i++) if (!isNum_(d.v[i])) return null;
    return { v: d.v.slice() };
  }
  if (kind === 'line') {
    if (!Array.isArray(d.r) || d.r.length < 1 || d.r.length > MAX_ROWS) return null;
    var rows = [];
    for (i = 0; i < d.r.length; i++) {
      var r = d.r[i];
      if (!Array.isArray(r) || r.length !== 2 || !isNum_(r[0]) || !isNum_(r[1])) return null;
      rows.push([r[0], r[1]]);
    }
    return { r: rows };
  }
  return null;
}

/** 照合用の文字列。スプレッドシートが数値や日付に読みかえない形にしておく */
function key_(room, kind) {
  return 'k:' + kind + ':' + room;
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['時刻', '部屋', '種類', '番号', 'データ', '照合用']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 部屋と種類が合う行を読み、番号ごとに最後に届いたものだけを返す */
function readItems_(room, kind) {
  var values = sheet_().getDataRange().getValues();
  var key = key_(room, kind);
  var latest = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[5]) !== key) continue;
    var g = Number(row[3]);
    if (g !== Math.floor(g) || g < 1 || g > MAX_GROUP) continue;
    var d;
    try {
      d = cleanData_(kind, JSON.parse(String(row[4])));
    } catch (err) {
      d = null;
    }
    if (!d) continue;
    var t = row[0] instanceof Date ? row[0].getTime() : 0;
    latest[g] = { g: g, t: t, d: d };
  }
  var items = [];
  for (var k in latest) items.push(latest[k]);
  items.sort(function (a, b) {
    return a.g - b.g;
  });
  return items;
}
