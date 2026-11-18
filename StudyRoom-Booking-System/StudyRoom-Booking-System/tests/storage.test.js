const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function makeContext(localStorage) {
  const context = vm.createContext({ localStorage, Date, Math, JSON, globalThis: null });
  context.globalThis = context;
  for (const file of ['core.js', 'storage.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  return context;
}

const local = new Map();
const store = {
  getItem(k) { return local.has(k) ? local.get(k) : null; },
  setItem(k, v) { local.set(k, String(v)); },
  removeItem(k) { local.delete(k); }
};
const context = makeContext(store), C = context.StudyCore, S = context.StudyStorage;
const next = C.addDays(C.localDate(), 1);
assert.equal(S.checkStorage().ok, true);
assert.throws(() => S.login('!', 'A'));
const u = S.login('stu001', '测试用户'); assert.equal(u.id, 'stu001');
const data = { roomId: 'A', seat: 2, date: next, start: 10, end: 11 };
const first = S.createBooking(data); assert.equal(S.loadBookings().length, 1);
assert.throws(() => S.createBooking(data), /已被预约/);
S.login('stu002', '另一用户'); assert.throws(() => S.cancelBooking(first.id), /属于你的预约/);
S.login('stu001', '测试用户'); S.cancelBooking(first.id);
assert.equal(S.loadBookings()[0].status, 'cancelled');
const second = S.createBooking(data); assert.notEqual(first.id, second.id);
S.logout(); assert.equal(S.currentUser(), null);
assert.throws(() => S.createBooking(data), /请先登录/);

// 损坏数据不得被静默当作空数组，否则下一次保存会覆盖原始数据。
store.setItem(S.KEY, '{broken');
assert.throws(() => S.loadBookings(), /无法解析/);
assert.equal(store.getItem(S.KEY), '{broken', '损坏数据应保留，不得被静默覆盖');

// localStorage 不可用时应给出可理解的错误。
const noStore = makeContext(undefined).StudyStorage;
assert.equal(noStore.checkStorage().ok, false);
assert.throws(() => noStore.login('stu003', '用户'), /本地存储权限/);
console.log('PASS localStorage 登录、创建、冲突、归属检查、取消、释放、退出、损坏数据保护和不可用提示');
