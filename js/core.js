/* 纯业务逻辑：不依赖浏览器，可由 Node.js 测试。半开区间 [开始, 结束)。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StudyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ROOMS = [
    { id: 'A', name: '晨光自习室', floor: '2F', seatCount: 12 },
    { id: 'B', name: '星河自习室', floor: '3F', seatCount: 12 }
  ];
  const OPEN = 8, CLOSE = 22, WINDOW_DAYS = 7;
  function localDate(date) {
    const d = date || new Date();
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function addDays(dateString, number) {
    const [y, m, d] = dateString.split('-').map(Number);
    return localDate(new Date(y, m - 1, d + number));
  }
  function isValidDate(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }
  function validHour(n) { return Number.isInteger(n) && n >= OPEN && n <= CLOSE; }
  function validateRequest(req, today) {
    if (!req || !ROOMS.some(r => r.id === req.roomId)) return '请选择有效自习室';
    const room = ROOMS.find(r => r.id === req.roomId);
    if (!Number.isInteger(req.seat) || req.seat < 1 || req.seat > room.seatCount) return '座位编号无效';
    if (!isValidDate(req.date)) return '预约日期无效';
    if (req.date < today || req.date > addDays(today, WINDOW_DAYS)) return '只能预约今天起未来7天内的座位';
    if (!validHour(req.start) || !validHour(req.end) || req.start >= req.end) return '预约时间须在08:00—22:00之间，且至少1小时';
    return null;
  }
  function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && bStart < aEnd; }
  function conflicts(bookings, req, excludeId) {
    return bookings.some(b => b.status === 'active' && b.id !== excludeId && b.date === req.date && b.roomId === req.roomId && b.seat === req.seat && overlaps(b.start, b.end, req.start, req.end));
  }
  function hasStartedToday(req, current) {
    return req.date === localDate(current) && req.start <= current.getHours();
  }
  function canBook(bookings, req, today, now) {
    const error = validateRequest(req, today);
    if (error) return { ok: false, message: error };
    const current = now || new Date();
    if (hasStartedToday(req, current)) return { ok: false, message: '不能预约已开始或过去的时段' };
    if (conflicts(bookings, req)) return { ok: false, message: '这个座位的该时段已被预约，请更换座位或时间' };
    return { ok: true, message: '可预约' };
  }
  function isPast(booking, now) {
    const current = now || new Date();
    const currentDate = localDate(current);
    return booking.date < currentDate || (booking.date === currentDate && booking.end <= current.getHours());
  }
  function canUpdateBooking(bookings, bookingId, req, today, now) {
    const target = bookings.find(booking => booking.id === bookingId);
    if (!target) return { ok: false, message: '找不到要修改的预约' };
    if (target.status !== 'active') return { ok: false, message: '仅有效预约可以修改' };

    const current = now || new Date();
    if (isPast(target, current)) return { ok: false, message: '已结束的预约不能修改' };

    const error = validateRequest(req, today);
    if (error) return { ok: false, message: error };
    if (req.roomId !== target.roomId || req.seat !== target.seat) {
      return { ok: false, message: '修改预约时不能更换自习室或座位' };
    }
    if (hasStartedToday(req, current)) return { ok: false, message: '不能修改到已开始或过去的时段' };
    if (conflicts(bookings, req, bookingId)) {
      return { ok: false, message: '这个座位的该时段已被预约，请选择其他时间' };
    }
    return { ok: true, message: '可以修改预约' };
  }
  return {
    ROOMS, OPEN, CLOSE, WINDOW_DAYS, localDate, addDays, isValidDate, overlaps,
    validateRequest, conflicts, canBook, isPast, canUpdateBooking
  };
});
