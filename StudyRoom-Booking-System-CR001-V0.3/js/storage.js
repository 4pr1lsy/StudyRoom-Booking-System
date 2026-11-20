/* 本地数据层：仅使用浏览器 localStorage；不提供真实身份认证或跨设备同步。 */
(function (root) {
  'use strict';
  // 保持 V0.1 的键名，升级到 V0.2 / V0.3 时不会丢失已有演示数据。
  const KEY = 'studyroom.v01.bookings', USER = 'studyroom.v01.currentUser';

  function storage() {
    try {
      const store = root.localStorage;
      if (!store) throw new Error('浏览器未提供 localStorage');
      return store;
    } catch (_) {
      throw new Error('浏览器本地存储不可用。请启用浏览器站点数据权限，或使用 Chrome / Edge 的普通窗口运行。');
    }
  }

  function checkStorage() {
    try {
      const store = storage();
      const probe = '__studyroom_storage_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return { ok: true, message: '本地存储可用' };
    } catch (error) {
      return { ok: false, message: error.message || '本地存储不可用' };
    }
  }

  function loadBookings() {
    const store = storage();
    let raw;
    try { raw = store.getItem(KEY); }
    catch (_) { throw new Error('读取预约记录失败，请检查浏览器本地存储权限。'); }
    if (raw === null) return [];
    let data;
    try { data = JSON.parse(raw); }
    catch (_) { throw new Error('预约数据无法解析。为避免覆盖原数据，系统已停止读写，请先备份或重置演示数据。'); }
    if (!Array.isArray(data)) throw new Error('预约数据格式异常。为避免覆盖原数据，系统已停止读写。');
    return data;
  }

  function saveBookings(items) {
    try { storage().setItem(KEY, JSON.stringify(items)); }
    catch (error) {
      if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        throw new Error('浏览器本地存储空间不足，预约未保存。请清理演示数据后重试。');
      }
      throw new Error('预约保存失败，请检查浏览器本地存储权限。');
    }
  }

  function currentUser() {
    let raw;
    try { raw = storage().getItem(USER); }
    catch (_) { return null; }
    if (!raw) return null;
    try {
      const u = JSON.parse(raw);
      return u && typeof u.id === 'string' && typeof u.name === 'string' ? u : null;
    } catch (_) { return null; }
  }

  function login(id, name) {
    id = String(id || '').trim(); name = String(name || '').trim();
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(id)) throw new Error('学号须为3—20位英文字母、数字、下划线或连字符');
    if (name.length < 1 || name.length > 20) throw new Error('昵称须为1—20个字符');
    try { storage().setItem(USER, JSON.stringify({ id, name })); }
    catch (_) { throw new Error('无法保存演示登录信息，请检查浏览器本地存储权限。'); }
    return { id, name };
  }

  function logout() {
    try { storage().removeItem(USER); }
    catch (_) { throw new Error('退出失败：浏览器本地存储不可用。'); }
  }

  function createBooking(req) {
    const user = currentUser(); if (!user) throw new Error('请先登录');
    const bookings = loadBookings();
    const check = root.StudyCore.canBook(bookings, req, root.StudyCore.localDate(), new Date());
    if (!check.ok) throw new Error(check.message);
    const booking = {
      id: (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: user.id, userName: user.name, roomId: req.roomId, seat: req.seat,
      date: req.date, start: req.start, end: req.end, status: 'active', createdAt: new Date().toISOString()
    };
    bookings.push(booking); saveBookings(bookings); return booking;
  }

  function updateBooking(id, changes) {
    const user = currentUser(); if (!user) throw new Error('请先登录');
    if (!id || typeof id !== 'string') throw new Error('预约编号无效');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('预约修改内容无效');

    const allowed = ['date', 'start', 'end'];
    const keys = Object.keys(changes);
    if (keys.some(key => !allowed.includes(key))) throw new Error('本次只允许修改预约日期、开始时间和结束时间');
    if (!allowed.every(key => Object.prototype.hasOwnProperty.call(changes, key))) throw new Error('请完整填写预约日期、开始时间和结束时间');

    const bookings = loadBookings();
    const index = bookings.findIndex(item => item && item.id === id);
    if (index < 0 || bookings[index].userId !== user.id) throw new Error('找不到属于你的预约');
    const original = bookings[index];
    if (original.status !== 'active') throw new Error('已取消的预约不能修改');

    // 房间、座位和预约身份始终来自原记录；前端传入的 changes 不能覆盖这些字段。
    const request = {
      roomId: original.roomId,
      seat: original.seat,
      date: changes.date,
      start: changes.start,
      end: changes.end
    };
    const check = root.StudyCore.canUpdateBooking(bookings, id, request, root.StudyCore.localDate(), new Date());
    if (!check.ok) throw new Error(check.message);

    // 先完成全部校验，再构造新记录；失败时不修改原数组，也不写入 localStorage。
    const updated = {
      ...original,
      date: changes.date,
      start: changes.start,
      end: changes.end,
      updatedAt: new Date().toISOString()
    };
    const nextBookings = bookings.slice();
    nextBookings[index] = updated;
    saveBookings(nextBookings);
    return updated;
  }

  function cancelBooking(id) {
    const user = currentUser(); if (!user) throw new Error('请先登录');
    const bookings = loadBookings();
    const record = bookings.find(b => b.id === id);
    if (!record || record.userId !== user.id) throw new Error('找不到属于你的预约');
    if (record.status !== 'active') throw new Error('此预约已取消');
    if (root.StudyCore.isPast(record)) throw new Error('已结束的预约不能取消');
    record.status = 'cancelled'; record.cancelledAt = new Date().toISOString();
    saveBookings(bookings); return record;
  }

  root.StudyStorage = {
    KEY, USER, checkStorage, loadBookings, saveBookings, currentUser,
    login, logout, createBooking, updateBooking, cancelBooking
  };
})(globalThis);
