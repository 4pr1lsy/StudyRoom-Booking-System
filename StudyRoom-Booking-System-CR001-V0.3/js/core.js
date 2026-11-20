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
  function canBook(bookings, req, today, now) {
    const current = now || new Date();
    const referenceDate = today || localDate(current);
    const error = validateRequest(req, referenceDate);
    if (error) return { ok: false, message: error };
    if (req.date === localDate(current) && req.start <= current.getHours()) return { ok: false, message: '不能预约已开始或过去的时段' };
    if (conflicts(bookings, req)) return { ok: false, message: '这个座位的该时段已被预约，请更换座位或时间' };
    return { ok: true, message: '可预约' };
  }
  function hasStarted(booking, now) {
    if (!booking || typeof booking.date !== 'string' || !Number.isInteger(booking.start)) return true;
    const current = now || new Date();
    const currentDate = localDate(current);
    return booking.date < currentDate || (booking.date === currentDate && booking.start <= current.getHours());
  }
  function isPast(booking, now) {
    const current = now || new Date();
    const currentDate = localDate(current);
    return booking.date < currentDate || (booking.date === currentDate && booking.end <= current.getHours());
  }
  function isEditable(booking, now) {
    return Boolean(booking && booking.status === 'active' && !hasStarted(booking, now));
  }
  function canUpdateBooking(bookings, bookingId, req, today, now) {
    if (!Array.isArray(bookings)) return { ok: false, message: '预约数据格式异常，无法修改' };
    const booking = bookings.find(item => item && item.id === bookingId);
    if (!booking) return { ok: false, message: '找不到要修改的预约' };
    if (booking.status !== 'active') return { ok: false, message: '已取消的预约不能修改' };

    const current = now || new Date();
    if (hasStarted(booking, current) || isPast(booking, current)) {
      return { ok: false, message: '已开始或已结束的预约不能修改' };
    }

    const referenceDate = today || localDate(current);
    const error = validateRequest(req, referenceDate);
    if (error) return { ok: false, message: error };
    if (req.date === localDate(current) && req.start <= current.getHours()) {
      return { ok: false, message: '不能修改为今天已经开始或过去的时段' };
    }
    if (conflicts(bookings, req, bookingId)) {
      return { ok: false, message: '修改后的时段与同一自习室、座位的其他有效预约冲突，请更换时间' };
    }
    return { ok: true, message: '预约修改校验通过' };
  }

  return {
    ROOMS, OPEN, CLOSE, WINDOW_DAYS,
    localDate, addDays, isValidDate, overlaps, validateRequest, conflicts,
    canBook, hasStarted, isPast, isEditable, canUpdateBooking
  };
});
