const assert = require('node:assert/strict');
const C = require('../js/core.js');
const today = '2026-11-13';
const now = new Date(2026, 10, 13, 7, 0);
const q = { roomId:'A', seat:1, date:'2026-11-14', start:9, end:11 };
const b = [{ id:'b1', roomId:'A', seat:1, date:'2026-11-14', start:10, end:12, status:'active' }];
const original = b[0];
const updateRequest = { ...q, date: '2026-11-15', start: 13, end: 15 };
const otherBooking = { ...updateRequest, id: 'b2', start: 14, end: 16, status: 'active' };
const lateMorning = new Date(2026, 10, 13, 10, 30);

function checkUpdate(bookings, req = updateRequest, current = now, bookingId = original.id) {
  return C.canUpdateBooking(bookings, bookingId, req, today, current);
}

function assertRejected(result, message) {
  assert.equal(result.ok, false);
  assert.match(result.message, message);
}

const tests = {
  '空座位可约': () => assert.equal(C.canBook([],q,today,now).ok,true),
  '冲突时段拒绝': () => assert.equal(C.canBook(b,q,today,now).ok,false),
  '结束等于下个开始不冲突': () => assert.equal(C.canBook(b,{...q,start:8,end:10},today,now).ok,true),
  '另一座位不冲突': () => assert.equal(C.canBook(b,{...q,seat:2},today,now).ok,true),
  '另一日期不冲突': () => assert.equal(C.canBook(b,{...q,date:'2026-11-15'},today,now).ok,true),
  '已取消预约不冲突': () => assert.equal(C.canBook([{...b[0],status:'cancelled'}],q,today,now).ok,true),
  '倒置时间拒绝': () => assert.equal(C.canBook([],{...q,start:12,end:9},today,now).ok,false),
  '超出开放时间拒绝': () => assert.equal(C.canBook([],{...q,start:7},today,now).ok,false),
  '零时长拒绝': () => assert.equal(C.canBook([],{...q,start:10,end:10},today,now).ok,false),
  '无效座位拒绝': () => assert.equal(C.canBook([],{...q,seat:13},today,now).ok,false),
  '昨天不可约': () => assert.equal(C.canBook([],{...q,date:'2026-11-12'},today,now).ok,false),
  '第7天可约': () => assert.equal(C.canBook([],{...q,date:'2026-11-20'},today,now).ok,true),
  '第8天不可约': () => assert.equal(C.canBook([],{...q,date:'2026-11-21'},today,now).ok,false),
  '不存在的日期拒绝': () => assert.equal(C.canBook([],{...q,date:'2026-11-31'},today,now).ok,false),
  '今天已开始时段拒绝': () => {
    assertRejected(C.canBook([], { ...q, date: today, start: 10, end: 11 }, today, lateMorning), /已开始/);
  },
  '日期跨月正确': () => assert.equal(C.addDays('2026-11-30',1),'2026-12-01'),
  '同座位跨房间不冲突': () => assert.equal(C.canBook(b,{...q,roomId:'B'},today,now).ok,true),
  '重叠判断': () => {assert.equal(C.overlaps(9,10,10,11),false);assert.equal(C.overlaps(9,11,10,12),true);},
  '已经结束判断': () => {assert.equal(C.isPast({...q,date:today,start:8,end:9},new Date(2026,10,13,9)),true);assert.equal(C.isPast({...q,date:today,start:9,end:10},new Date(2026,10,13,9)),false);},

  '可修改到空闲日期和时间': () => {
    const result = checkUpdate([original]);
    assert.equal(result.ok, true);
    assert.match(result.message, /\S/);
  },
  '修改时排除原预约自身': () => {
    const req = { ...updateRequest, date: original.date, start: 11, end: 13 };
    assert.equal(checkUpdate([original], req).ok, true);
  },
  '与其他有效预约重叠时拒绝修改': () => {
    assertRejected(checkUpdate([original, otherBooking]), /已被预约/);
  },
  '与其他预约前后相邻均可修改': () => {
    const bookings = [original, otherBooking];
    assert.equal(checkUpdate(bookings, { ...updateRequest, end: otherBooking.start }).ok, true);
    assert.equal(checkUpdate(bookings, { ...updateRequest, start: otherBooking.end, end: 17 }).ok, true);
  },
  '修改时忽略已取消的重叠预约': () => {
    assert.equal(checkUpdate([original, { ...otherBooking, status: 'cancelled' }]).ok, true);
  },
  '不同房间、座位或日期的同期预约不影响修改': () => {
    const bookings = [
      original,
      { ...otherBooking, roomId: 'B' },
      { ...otherBooking, id: 'b3', seat: 2 },
      { ...otherBooking, id: 'b4', date: '2026-11-16' }
    ];
    assert.equal(checkUpdate(bookings).ok, true);
  },
  '修改请求使用无效房间时拒绝': () => {
    assertRejected(checkUpdate([original], { ...updateRequest, roomId: 'invalid' }), /有效自习室/);
  },
  '修改请求使用无效座位时拒绝': () => {
    assertRejected(checkUpdate([original], { ...updateRequest, seat: 13 }), /座位编号无效/);
  },
  '修改时不能更换房间或座位': () => {
    assertRejected(checkUpdate([original], { ...updateRequest, roomId: 'B' }), /不能更换/);
    assertRejected(checkUpdate([original], { ...updateRequest, seat: 2 }), /不能更换/);
  },
  '不能修改到不存在的日期': () => {
    assertRejected(checkUpdate([original], { ...updateRequest, date: '2026-11-31' }), /日期无效/);
  },
  '不能修改到昨天': () => {
    assertRejected(checkUpdate([original], { ...updateRequest, date: '2026-11-12' }), /未来7天/);
  },
  '允许修改到第7天并在22时结束': () => {
    const req = { ...updateRequest, date: '2026-11-20', start: 21, end: 22 };
    assert.equal(checkUpdate([original], req).ok, true);
  },
  '不能修改到第8天': () => {
    assertRejected(checkUpdate([original], { ...updateRequest, date: '2026-11-21' }), /未来7天/);
  },
  '修改后的开始时间必须早于结束时间': () => {
    assertRejected(checkUpdate([original], { ...updateRequest, start: 16 }), /至少1小时/);
    assertRejected(checkUpdate([original], { ...updateRequest, start: updateRequest.end }), /至少1小时/);
  },
  '修改后的时间必须是开放时间内的整点': () => {
    assertRejected(checkUpdate([original], { ...updateRequest, start: 7 }), /08:00—22:00/);
    assertRejected(checkUpdate([original], { ...updateRequest, end: 23 }), /08:00—22:00/);
    assertRejected(checkUpdate([original], { ...updateRequest, start: 13.5 }), /08:00—22:00/);
  },
  '不能修改到今天已经开始的整点': () => {
    const req = { ...updateRequest, date: today, start: 10, end: 11 };
    assertRejected(checkUpdate([original], req, lateMorning), /已开始或过去/);
  },
  '不能修改到今天已经过去的时段': () => {
    const req = { ...updateRequest, date: today, start: 8, end: 9 };
    assertRejected(checkUpdate([original], req, lateMorning), /已开始或过去/);
  },
  '可以修改到今天下一个尚未开始的整点': () => {
    const req = { ...updateRequest, date: today, start: 11, end: 12 };
    assert.equal(checkUpdate([original], req, lateMorning).ok, true);
  },
  '未来日期的时段可以早于当天当前小时': () => {
    const req = { ...updateRequest, start: 8, end: 9 };
    assert.equal(checkUpdate([original], req, lateMorning).ok, true);
  },
  '目标预约不存在时拒绝修改': () => {
    assertRejected(checkUpdate([original], updateRequest, now, 'missing'), /找不到/);
  },
  '目标预约已取消时拒绝修改': () => {
    assertRejected(checkUpdate([{ ...original, status: 'cancelled' }]), /有效预约/);
  },
  '目标预约日期已过去时拒绝修改': () => {
    assertRejected(checkUpdate([{ ...original, date: '2026-11-12' }]), /已结束/);
  },
  '当前时间恰好等于目标预约结束时间时拒绝修改': () => {
    const target = { ...original, date: today, start: 9, end: 10 };
    const endTime = new Date(2026, 10, 13, 10, 0);
    assertRejected(checkUpdate([target], updateRequest, endTime), /已结束/);
  },
  '目标预约已开始但尚未结束时可移到未来时段': () => {
    const target = { ...original, date: today, start: 9, end: 12 };
    const req = { ...updateRequest, date: today };
    assert.equal(checkUpdate([target], req, lateMorning).ok, true);
  },
  '校验成功或失败均不变更预约和请求': () => {
    const bookings = Object.freeze([Object.freeze({ ...original }), Object.freeze({ ...otherBooking })]);
    const allowed = Object.freeze({ ...updateRequest, end: otherBooking.start });
    const rejected = Object.freeze({ ...updateRequest });
    assert.equal(checkUpdate(bookings, allowed).ok, true);
    assertRejected(checkUpdate(bookings, rejected), /已被预约/);
    assert.deepEqual(bookings, [original, otherBooking]);
  }
};
let passed = 0;
for (const [name, fn] of Object.entries(tests)) { try {fn(); passed++; console.log('PASS',name);} catch(e){console.error('FAIL',name,e.message);process.exitCode=1;} }
console.log(`结果：${passed}/${Object.keys(tests).length} 项通过`);
