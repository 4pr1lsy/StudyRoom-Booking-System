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

function makeStore() {
  const local = new Map();
  return {
    local,
    getItem(k) { return local.has(k) ? local.get(k) : null; },
    setItem(k, v) { local.set(k, String(v)); },
    removeItem(k) { local.delete(k); }
  };
}

const store = makeStore();
const context = makeContext(store), C = context.StudyCore, S = context.StudyStorage;
const next = C.addDays(C.localDate(), 1);
const next2 = C.addDays(C.localDate(), 2);
assert.equal(S.checkStorage().ok, true);
assert.throws(() => S.login('!', 'A'));
const u = S.login('stu001', '测试用户'); assert.equal(u.id, 'stu001');
const data = { roomId: 'A', seat: 2, date: next, start: 10, end: 11 };
const first = S.createBooking(data); assert.equal(S.loadBookings().length, 1);
assert.throws(() => S.createBooking(data), /已被预约/);

// 自己的有效预约可以修改；身份、房间、座位、状态和创建时间保持不变。
const firstBefore = {...first};
const updated = S.updateBooking(first.id, { date: next2, start: 10, end: 11 });
assert.equal(updated.date, next2);
assert.equal(updated.start, 10);
assert.equal(updated.end, 11);
assert.equal(updated.id, firstBefore.id);
assert.equal(updated.userId, firstBefore.userId);
assert.equal(updated.userName, firstBefore.userName);
assert.equal(updated.roomId, firstBefore.roomId);
assert.equal(updated.seat, firstBefore.seat);
assert.equal(updated.status, firstBefore.status);
assert.equal(updated.createdAt, firstBefore.createdAt);
assert.ok(updated.updatedAt, '成功修改应记录 updatedAt');
assert.equal(S.loadBookings()[0].date, next2);
assert.throws(() => S.updateBooking(first.id, { date: next, start: 10 }), /完整填写/);
assert.throws(() => S.updateBooking(first.id, { date: next, start: 10, end: 11, userId: 'stu002' }), /只允许修改/);

// 其他用户不能修改该预约。
S.login('stu002', '另一用户');
assert.throws(() => S.updateBooking(first.id, { date: next, start: 10, end: 11 }), /属于你的预约/);
// 在同一座位创建相邻时段预约，为后续冲突测试提供另一条有效记录。
const second = S.createBooking({ roomId: 'A', seat: 2, date: next2, start: 11, end: 12 });
assert.notEqual(first.id, second.id);

// 与其他有效预约重叠的修改必须失败，且 localStorage 原始 JSON 不得变化。
S.login('stu001', '测试用户');
const beforeConflict = store.getItem(S.KEY);
assert.throws(() => S.updateBooking(first.id, { date: next2, start: 10, end: 12 }), /冲突/);
assert.equal(store.getItem(S.KEY), beforeConflict, '冲突失败后原始预约 JSON 必须完全不变');

// 相邻时段仍允许修改。
const movedAgain = S.updateBooking(first.id, { date: next2, start: 9, end: 10 });
assert.equal(movedAgain.start, 9);
assert.equal(movedAgain.end, 10);

// 已结束预约不能修改。
const ended = {
  id: 'ended-booking', userId: 'stu001', userName: '测试用户', roomId: 'A', seat: 3,
  date: C.addDays(C.localDate(), -1), start: 10, end: 11, status: 'active', createdAt: new Date().toISOString()
};
S.saveBookings([...S.loadBookings(), ended]);
assert.throws(() => S.updateBooking(ended.id, { date: next, start: 10, end: 11 }), /已开始或已结束/);

// 已取消预约不能修改。
S.cancelBooking(first.id);
assert.equal(S.loadBookings().find(b => b.id === first.id).status, 'cancelled');
assert.throws(() => S.updateBooking(first.id, { date: next, start: 10, end: 11 }), /已取消/);

// 原有取消、退出及登录保护仍然有效。
S.login('stu002', '另一用户');
S.cancelBooking(second.id);
assert.equal(S.loadBookings().find(b => b.id === second.id).status, 'cancelled');
S.logout(); assert.equal(S.currentUser(), null);
assert.throws(() => S.createBooking(data), /请先登录/);
assert.throws(() => S.updateBooking(first.id, { date: next, start: 10, end: 11 }), /请先登录/);

// 损坏数据不得被静默当作空数组，否则下一次保存会覆盖原始数据。
store.setItem(S.KEY, '{broken');
assert.throws(() => S.loadBookings(), /无法解析/);
assert.equal(store.getItem(S.KEY), '{broken', '损坏数据应保留，不得被静默覆盖');

// localStorage 不可用时应给出可理解的错误。
const noStore = makeContext(undefined).StudyStorage;
assert.equal(noStore.checkStorage().ok, false);
assert.throws(() => noStore.login('stu003', '用户'), /本地存储权限/);

// 写入失败时，原始 JSON 保持不变。
const failStore = makeStore();
let failBookingWrites = false;
const guardedStore = {
  getItem: k => failStore.getItem(k),
  removeItem: k => failStore.removeItem(k),
  setItem(k, v) {
    if (failBookingWrites && k === 'studyroom.v01.bookings') throw new Error('simulated write failure');
    failStore.setItem(k, v);
  }
};
const failContext = makeContext(guardedStore), FS = failContext.StudyStorage, FC = failContext.StudyCore;
FS.login('stu003', '写入测试');
const failBooking = FS.createBooking({ roomId:'A', seat:4, date:FC.addDays(FC.localDate(),1), start:14, end:15 });
const beforeWriteFailure = failStore.getItem(FS.KEY);
failBookingWrites = true;
assert.throws(() => FS.updateBooking(failBooking.id, { date:FC.addDays(FC.localDate(),2), start:14, end:15 }), /保存失败/);
assert.equal(failStore.getItem(FS.KEY), beforeWriteFailure, '保存失败后原始 JSON 必须保持不变');

console.log('PASS localStorage 登录、创建、冲突、归属检查、预约修改、字段保护、冲突回滚、取消、损坏数据保护和保存失败保护');
