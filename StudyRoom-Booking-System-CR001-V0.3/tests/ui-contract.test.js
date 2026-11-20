const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const records = fs.readFileSync(path.join(root, 'records.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'js/storage.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js/core.js'), 'utf8');

test('CR-001 页面包含预约编辑与取消弹窗所需结构', () => {
  for (const id of [
    'records', 'edit-dialog', 'edit-form', 'edit-date', 'edit-start', 'edit-end',
    'edit-cancel', 'cancel-dialog', 'cancel-dismiss', 'cancel-confirm'
  ]) assert.match(records, new RegExp(`id=["']${id}["']`), `records.html 缺少 ${id}`);
  const ids = [...records.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'records.html 中不应存在重复 id');
});

test('前端通过存储接口修改预约，不直接写 localStorage', () => {
  assert.match(app, /S\.updateBooking\(editingId, changes\)/);
  assert.match(storage, /function updateBooking\(id, changes\)/);
  assert.match(core, /function canUpdateBooking\(bookings, bookingId, req, today, now\)/);
  assert.doesNotMatch(app, /localStorage\s*\./, '前端页面不得直接操作 localStorage');
});

test('取消预约使用自定义 dialog，不调用浏览器原生 confirm', () => {
  assert.match(app, /cancelDialog\.showModal\(\)/);
  assert.match(app, /S\.cancelBooking\(cancellingId\)/);
  assert.doesNotMatch(app, /\b(?:window\.)?confirm\s*\(/, '不得调用原生 confirm()');
  assert.match(records, /<dialog\s+id="cancel-dialog"/);
});
