const assert = require('node:assert/strict');
const C = require('../js/core.js');

const today = '2026-11-13';
const now = new Date(2026, 10, 13, 7, 0);
const q = { roomId:'A', seat:1, date:'2026-11-14', start:9, end:11 };
const b = [{ id:'b1', roomId:'A', seat:1, date:'2026-11-14', start:10, end:12, status:'active' }];
const target = { id:'target', roomId:'A', seat:1, date:'2026-11-14', start:9, end:11, status:'active' };
const update = (req, others = [target], refToday = today, refNow = now) =>
  C.canUpdateBooking(others, 'target', { roomId:target.roomId, seat:target.seat, ...req }, refToday, refNow);

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
  '今天已开始时段拒绝': () => assert.equal(C.canBook([],{...q,date:today,start:7,end:9},today,new Date(2026,10,13,9)).ok,false),
  '日期跨月正确': () => assert.equal(C.addDays('2026-11-30',1),'2026-12-01'),
  '同座位跨房间不冲突': () => assert.equal(C.canBook(b,{...q,roomId:'B'},today,now).ok,true),
  '重叠判断': () => {assert.equal(C.overlaps(9,10,10,11),false);assert.equal(C.overlaps(9,11,10,12),true);},
  '已经结束判断': () => {assert.equal(C.isPast({...q,date:today,start:8,end:9},new Date(2026,10,13,9)),true);assert.equal(C.isPast({...q,date:today,start:9,end:10},new Date(2026,10,13,9)),false);},

  '修改到空闲时间成功': () => assert.equal(update({date:'2026-11-15',start:10,end:12}).ok, true),
  '修改原时段不会与自身冲突': () => assert.equal(update({date:'2026-11-14',start:9,end:11}).ok, true),
  '修改后与其他有效预约重叠时失败': () => {
    const other = { id:'other', roomId:'A', seat:1, date:'2026-11-15', start:11, end:13, status:'active' };
    assert.equal(update({date:'2026-11-15',start:10,end:12}, [target, other]).ok, false);
  },
  '修改为相邻时段允许': () => {
    const other = { id:'other', roomId:'A', seat:1, date:'2026-11-15', start:11, end:13, status:'active' };
    assert.equal(update({date:'2026-11-15',start:9,end:11}, [target, other]).ok, true);
  },
  '已取消记录不构成修改冲突': () => {
    const other = { id:'other', roomId:'A', seat:1, date:'2026-11-15', start:10, end:12, status:'cancelled' };
    assert.equal(update({date:'2026-11-15',start:10,end:12}, [target, other]).ok, true);
  },
  '修改日期超出未来7天失败': () => assert.equal(update({date:'2026-11-21',start:10,end:12}).ok, false),
  '修改为非法日期失败': () => assert.equal(update({date:'2026-11-31',start:10,end:12}).ok, false),
  '修改为非法座位失败': () => assert.equal(C.canUpdateBooking([target], 'target', {...q, seat:13}, today, now).ok, false),
  '修改为倒置时间失败': () => assert.equal(update({date:'2026-11-15',start:12,end:10}).ok, false),
  '修改为营业时间外失败': () => assert.equal(update({date:'2026-11-15',start:7,end:10}).ok, false),
  '修改为今天已经开始的时段失败': () => assert.equal(
    update({date:today,start:8,end:9}, [target], today, new Date(2026,10,13,9)).ok, false
  ),
  '原预约已经开始后不能修改': () => {
    const started = {...target, date:today, start:8, end:11};
    const result = C.canUpdateBooking([started], 'target', {...q,date:'2026-11-15'}, today, new Date(2026,10,13,9));
    assert.equal(result.ok, false);
  },
  '预约编号不存在时不能修改': () => assert.equal(C.canUpdateBooking([target], 'missing', q, today, now).ok, false),
  '已取消预约不能修改': () => assert.equal(C.canUpdateBooking([{...target,status:'cancelled'}], 'target', q, today, now).ok, false),
  '已结束预约不能修改': () => {
    const ended = {...target, date:'2026-11-12'};
    assert.equal(C.canUpdateBooking([ended], 'target', q, today, now).ok, false);
  },
  '修改规则不改变原预约数据': () => {
    const before = JSON.stringify(target);
    update({date:'2026-11-15',start:10,end:12});
    assert.equal(JSON.stringify(target), before);
  }
};

let passed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); passed++; console.log('PASS', name); }
  catch (error) { console.error('FAIL', name, error.message); process.exitCode = 1; }
}
console.log(`结果：${passed}/${Object.keys(tests).length} 项通过`);
