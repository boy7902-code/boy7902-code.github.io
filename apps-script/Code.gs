/**
 * 우리 집 가족 대시보드 — 실시간 동기화 API (Google Apps Script)
 *
 * · 대시보드가 보낸 '변경분(patch)'을 비공개 스프레드시트의 data 탭에 JSON 으로 보관합니다.
 * · PIN 이 맞을 때만 읽기/쓰기를 허용합니다. PIN 은 스크립트 속성(FAMILY_PIN)에만 있고,
 *   공개 저장소에는 들어가지 않습니다.
 *
 * 통신 규약
 *   GET  ?pin=XXXXXX            → { ok, rev, updatedAt, state }      (전체 상태)
 *   GET  ?pin=XXXXXX&rev=N      → { ok, unchanged:true, rev }        (바뀐 게 없을 때 가볍게)
 *   POST text/plain {pin, baseRev, patch:{values,arrays}, device} → { ok, rev, conflict, state? }
 *   POST {pin, mode:'replace', state, device} → 서버 기록을 이 기기 기록으로 통째로 바꿉니다.
 */

const DB_SHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE'; // 비공개 시트 ID — 공개 저장소에는 넣지 않습니다
const DB_TAB = 'data';
const CELL_LIMIT = 45000;
const MAX_CHARS = 4000000;

function doGet(e) { return handle_(e, 'GET'); }
function doPost(e) { return handle_(e, 'POST'); }

function handle_(e, method) {
  try {
    const params = (e && e.parameter) || {};
    let body = {};
    if (method === 'POST' && e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    const pin = String(method === 'POST' ? (body.pin || '') : (params.pin || ''));
    if (!checkPin_(pin)) return out_({ ok: false, error: 'pin' });
    if (method === 'GET') return out_(readAll_(params.rev));
    return out_(write_(body));
  } catch (err) {
    return out_({ ok: false, error: 'server', message: String((err && err.message) || err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkPin_(pin) {
  const saved = String(PropertiesService.getScriptProperties().getProperty('FAMILY_PIN') || '').trim();
  const got = String(pin || '').trim();
  if (!saved || !got || saved.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < saved.length; i++) diff |= saved.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

function dbSheet_() {
  const book = SpreadsheetApp.openById(DB_SHEET_ID);
  let sh = book.getSheetByName(DB_TAB);
  if (!sh) sh = book.insertSheet(DB_TAB);
  return sh;
}

function readMeta_(sh) {
  const rows = sh.getRange(1, 1, 4, 2).getValues();
  const map = {};
  rows.forEach(function (r) { if (r[0] !== '' && r[0] !== null) map[String(r[0])] = r[1]; });
  return {
    rev: Math.max(0, Math.round(Number(map.rev) || 0)),
    updatedAt: String(map.updatedAt || ''),
    device: String(map.device || ''),
    chunks: Math.max(0, Math.round(Number(map.chunks) || 0))
  };
}

function readAll_(revParam) {
  const sh = dbSheet_();
  const meta = readMeta_(sh);
  if (revParam !== undefined && revParam !== null && String(revParam) !== '' && Math.round(Number(revParam)) === meta.rev) {
    return { ok: true, unchanged: true, rev: meta.rev, updatedAt: meta.updatedAt };
  }
  let json = '';
  if (meta.chunks > 0) {
    const vals = sh.getRange(5, 1, Math.max(1, meta.chunks), 2).getValues();
    const map = {};
    vals.forEach(function (r) { if (r[0] !== '' && r[0] !== null) map[String(r[0])] = r[1]; });
    for (let i = 0; i < meta.chunks; i++) json += String(map['c' + i] || '');
  }
  let state = null;
  if (json) { try { state = JSON.parse(json); } catch (err) { state = null; } }
  return { ok: true, rev: meta.rev, updatedAt: meta.updatedAt, device: meta.device, empty: meta.rev === 0 || !state, state: state };
}

function write_(body) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    const sh = dbSheet_();
    const cur = readAll_();
    const baseRev = Math.max(0, Math.round(Number(body.baseRev) || 0));
    let next;
    if (body.mode === 'replace') {
      next = (body.state && typeof body.state === 'object') ? body.state : { v: 3 };
    } else {
      next = applyPatch_(cur.state, body.patch);
    }
    const json = JSON.stringify(next);
    if (json.length > MAX_CHARS) return { ok: false, error: 'too_large', size: json.length };
    const rev = cur.rev + 1;
    saveState_(sh, next, rev, body.device || '');
    const conflict = baseRev !== cur.rev;
    const res = { ok: true, rev: rev, updatedAt: new Date().toISOString(), conflict: conflict };
    if (conflict) res.state = next;
    return res;
  } finally {
    lock.releaseLock();
  }
}

function applyPatch_(state, patch) {
  const next = state ? JSON.parse(JSON.stringify(state)) : { v: 3 };
  if (!patch || typeof patch !== 'object') return next;
  const values = patch.values || {};
  Object.keys(values).forEach(function (k) { next[k] = values[k]; });
  const arrays = patch.arrays || {};
  Object.keys(arrays).forEach(function (k) {
    let arr = Array.isArray(next[k]) ? next[k] : [];
    (arrays[k] || []).forEach(function (op) {
      if (!op || !op.op) return;
      if (op.op === 'set' && op.item && op.item.id) {
        let hit = -1;
        for (let i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id === op.item.id) { hit = i; break; } }
        if (hit >= 0) arr[hit] = op.item; else arr.push(op.item);
      } else if (op.op === 'del' && op.id) {
        arr = arr.filter(function (x) { return !(x && x.id === op.id); });
      }
    });
    next[k] = arr;
  });
  return next;
}

function saveState_(sh, state, rev, device) {
  const json = JSON.stringify(state);
  const chunks = [];
  for (let i = 0; i < json.length; i += CELL_LIMIT) chunks.push(json.slice(i, i + CELL_LIMIT));
  const rows = [
    ['rev', rev],
    ['updatedAt', new Date().toISOString()],
    ['device', String(device || '').slice(0, 40)],
    ['chunks', chunks.length]
  ];
  chunks.forEach(function (c, i) { rows.push(['c' + i, c]); });
  sh.clearContents();
  const range = sh.getRange(1, 1, rows.length, 2);
  range.setNumberFormat('@');
  range.setValues(rows);
}

/** 편집기에서 setup 을 한 번 실행하면 PIN 을 만들어 스크립트 속성에 저장합니다. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let pin = props.getProperty('FAMILY_PIN');
  if (!pin) {
    pin = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty('FAMILY_PIN', pin);
  }
  const sh = dbSheet_();
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 4, 2).setNumberFormat('@').setValues([['rev', 0], ['updatedAt', ''], ['device', ''], ['chunks', 0]]);
  }
  Logger.log('FAMILY_PIN=' + pin);
  return pin;
}
