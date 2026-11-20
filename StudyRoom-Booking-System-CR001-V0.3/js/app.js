(function () {
  'use strict';
  const C = globalThis.StudyCore, S = globalThis.StudyStorage;
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const clock = h => `${pad(h)}:00`;
  const roomName = id => (C.ROOMS.find(r => r.id === id) || {}).name || id;
  const safe = val => String(val).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function toast(message, type) {
    const el = $('toast'); if (!el) return;
    el.textContent = message; el.className = `toast ${type || 'info'} visible`;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 3500);
  }

  function storageNotice() {
    const banner = $('storage-warning'); if (!banner) return;
    const status = S.checkStorage();
    if (!status.ok) { banner.hidden = false; banner.textContent = `${status.message} 当前无法可靠保存登录和预约数据。`; }
  }

  function nav() {
    const u = S.currentUser(), tag = $('user-label');
    if (tag) tag.textContent = u ? `${u.name} (${u.id})` : '未登录';
    const logout = $('logout-btn'); if (logout) {
      logout.hidden = !u;
      logout.addEventListener('click', () => {
        try { S.logout(); location.href = 'index.html'; }
        catch (error) { toast(error.message, 'error'); }
      });
    }
  }

  function requireLogin() {
    if (!S.currentUser()) { location.href = 'index.html'; return false; }
    return true;
  }

  function initHome() {
    const form = $('login-form'); if (!form) return;
    const current = S.currentUser();
    if (current) { $('login-id').value = current.id; $('login-name').value = current.name; }
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      try { S.login($('login-id').value, $('login-name').value); location.href = 'seats.html'; }
      catch (error) { toast(error.message, 'error'); }
    });
  }

  function initSeats() {
    if (!$('seat-grid') || !requireLogin()) return;
    const room = $('room'), date = $('date'), start = $('start'), end = $('end');
    for (const r of C.ROOMS) room.add(new Option(`${r.name} · ${r.floor}`, r.id));
    date.min = C.localDate(); date.max = C.addDays(C.localDate(), C.WINDOW_DAYS); date.value = C.localDate();
    for (let h = C.OPEN; h < C.CLOSE; h++) start.add(new Option(clock(h), String(h)));
    for (let h = C.OPEN + 1; h <= C.CLOSE; h++) end.add(new Option(clock(h), String(h)));
    let initial = Math.max(C.OPEN, Math.min(C.CLOSE - 1, new Date().getHours() + 1));
    if (new Date().getHours() >= C.CLOSE - 1) { date.value = C.addDays(C.localDate(), 1); initial = C.OPEN; }
    start.value = String(initial); end.value = String(initial + 1);
    let selected = null;
    const summary = $('selection');

    function render() {
      selected = null; summary.textContent = '请先选择一个可预约座位'; $('book-btn').disabled = true;
      const r = C.ROOMS.find(v => v.id === room.value);
      const req = { roomId: room.value, date: date.value, start: Number(start.value), end: Number(end.value) };
      const grid = $('seat-grid'); grid.replaceChildren();
      let bookings;
      try { bookings = S.loadBookings(); }
      catch (error) {
        const message = document.createElement('p'); message.className = 'warning'; message.textContent = error.message; grid.append(message);
        $('availability').textContent = '暂时无法读取预约数据'; $('time-hint').textContent = '请先处理本地存储问题，再继续预约。'; return;
      }
      let available = 0;
      for (let n = 1; n <= r.seatCount; n++) {
        const test = C.canBook(bookings, { ...req, seat: n }, C.localDate(), new Date());
        const button = document.createElement('button'); button.type = 'button'; button.textContent = pad(n);
        button.className = `seat ${test.ok ? 'available' : 'unavailable'}`;
        button.disabled = !test.ok; button.title = test.message;
        button.setAttribute('aria-label', `${n}号座位，${test.ok ? '可预约' : '不可预约'}`);
        if (test.ok) {
          available++;
          button.addEventListener('click', () => {
            grid.querySelectorAll('.seat').forEach(el => el.classList.remove('selected'));
            button.classList.add('selected'); selected = n; $('book-btn').disabled = false;
            summary.textContent = `${r.name} · ${pad(n)}号座位 · ${req.date} ${clock(req.start)}—${clock(req.end)}`;
          });
        }
        grid.append(button);
      }
      $('availability').textContent = `当前条件下 ${available} / ${r.seatCount} 个座位可预约`;
      const invalid = C.validateRequest({ ...req, seat: 1 }, C.localDate());
      $('time-hint').textContent = invalid || (req.date === C.localDate() && req.start <= new Date().getHours() ? '今天的该时间段已经开始，请选择更晚的时段。' : '绿色为可预约座位，灰色为已占用或时段不可选。');
    }

    [room, date, start, end].forEach(input => input.addEventListener('change', render));
    $('booking-form').addEventListener('submit', ev => {
      ev.preventDefault(); if (!selected) return toast('请先选择座位', 'error');
      try {
        const booking = S.createBooking({ roomId: room.value, seat: selected, date: date.value, start: Number(start.value), end: Number(end.value) });
        toast(`预约成功！${pad(booking.seat)}号座位`, 'success'); render();
      } catch (error) { toast(error.message, 'error'); render(); }
    });
    window.addEventListener('storage', render);
    render();
  }

  function initRecords() {
    if (!$('records') || !requireLogin()) return;

    const editDialog = $('edit-dialog');
    const editForm = $('edit-form');
    const editDate = $('edit-date');
    const editStart = $('edit-start');
    const editEnd = $('edit-end');
    const cancelDialog = $('cancel-dialog');
    let editingId = null;
    let cancellingId = null;
    let lastTrigger = null;

    function fillHours(select, first, last, selected) {
      select.replaceChildren();
      for (let hour = first; hour <= last; hour++) {
        select.add(new Option(clock(hour), String(hour)));
      }
      select.value = String(selected);
    }

    function openEdit(booking, trigger) {
      if (!C.isEditable(booking, new Date())) {
        toast('预约已经开始或结束，不能修改', 'error');
        return;
      }
      editingId = booking.id;
      lastTrigger = trigger;
      $('edit-booking-summary').textContent = `${roomName(booking.roomId)} · ${pad(booking.seat)}号座位（房间和座位不可更改）`;
      editDate.min = C.localDate();
      editDate.max = C.addDays(C.localDate(), C.WINDOW_DAYS);
      editDate.value = booking.date;
      fillHours(editStart, C.OPEN, C.CLOSE - 1, booking.start);
      fillHours(editEnd, C.OPEN + 1, C.CLOSE, booking.end);
      editDialog.showModal();
      editDate.focus();
    }

    function openCancel(booking, trigger) {
      cancellingId = booking.id;
      lastTrigger = trigger;
      $('cancel-booking-summary').textContent = `${roomName(booking.roomId)} · ${pad(booking.seat)}号座位 · ${booking.date} ${clock(booking.start)}—${clock(booking.end)}`;
      cancelDialog.showModal();
      $('cancel-dismiss').focus();
    }

    function closeDialog(dialog) {
      if (dialog && dialog.open) dialog.close();
    }

    [editDialog, cancelDialog].forEach(dialog => {
      dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener('close', () => {
        if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
        lastTrigger = null;
      });
    });

    editStart.addEventListener('change', () => {
      const startHour = Number(editStart.value);
      const currentEnd = Number(editEnd.value);
      if (currentEnd <= startHour) editEnd.value = String(Math.min(C.CLOSE, startHour + 1));
    });

    editForm.addEventListener('submit', event => {
      event.preventDefault();
      if (!editingId || !editForm.reportValidity()) return;
      const changes = {
        date: editDate.value,
        start: Number(editStart.value),
        end: Number(editEnd.value)
      };
      try {
        S.updateBooking(editingId, changes);
        closeDialog(editDialog);
        toast('预约修改成功，记录已更新', 'success');
        render();
      } catch (error) {
        toast(error.message || '预约修改失败，请检查填写内容', 'error');
      }
    });

    $('edit-cancel').addEventListener('click', () => closeDialog(editDialog));
    $('edit-close-x').addEventListener('click', () => closeDialog(editDialog));
    $('cancel-dismiss').addEventListener('click', () => closeDialog(cancelDialog));
    $('cancel-close-x').addEventListener('click', () => closeDialog(cancelDialog));
    $('cancel-confirm').addEventListener('click', () => {
      if (!cancellingId) return;
      try {
        S.cancelBooking(cancellingId);
        closeDialog(cancelDialog);
        toast('已取消预约，该时段已释放', 'success');
        render();
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    function render() {
      const user = S.currentUser(); if (!user) return;
      const root = $('records'); root.replaceChildren();
      let data;
      try { data = S.loadBookings().filter(b => b.userId === user.id).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))); }
      catch (error) {
        const p = document.createElement('p'); p.className = 'warning'; p.textContent = error.message;
        root.append(p); $('record-count').textContent = '数据读取失败'; return;
      }
      $('record-count').textContent = `共有 ${data.length} 条预约记录`;
      if (!data.length) {
        const p = document.createElement('p'); p.className = 'empty'; p.textContent = '还没有预约记录，去选一个喜欢的座位吧。';
        root.append(p); return;
      }

      for (const booking of data) {
        const row = document.createElement('article'); row.className = 'record';
        const started = C.hasStarted(booking, new Date());
        const ended = C.isPast(booking, new Date());
        const status = booking.status === 'cancelled' ? '已取消' : ended ? '已结束' : started ? '进行中' : '有效预约';
        const info = document.createElement('div');
        info.innerHTML = `<strong>${safe(roomName(booking.roomId))} · ${safe(pad(booking.seat))}号</strong><p>${safe(booking.date)} &nbsp; ${clock(booking.start)}—${clock(booking.end)}</p>`;
        if (booking.updatedAt) {
          const updated = document.createElement('p'); updated.className = 'hint record-updated';
          updated.textContent = `最近修改：${new Date(booking.updatedAt).toLocaleString()}`;
          info.append(updated);
        }
        const actions = document.createElement('div'); actions.className = 'record-actions';
        const badge = document.createElement('span');
        badge.className = `status ${booking.status === 'active' && !ended ? 'active' : ''}`;
        badge.textContent = status; actions.append(badge);

        if (C.isEditable(booking, new Date())) {
          const editButton = document.createElement('button');
          editButton.type = 'button'; editButton.className = 'button ghost small'; editButton.textContent = '修改预约';
          editButton.addEventListener('click', () => openEdit(booking, editButton));
          actions.append(editButton);
        }
        if (booking.status === 'active' && !ended) {
          const cancelButton = document.createElement('button');
          cancelButton.type = 'button'; cancelButton.className = 'button danger small'; cancelButton.textContent = '取消预约';
          cancelButton.addEventListener('click', () => openCancel(booking, cancelButton));
          actions.append(cancelButton);
        }
        row.append(info, actions);
        root.append(row);
      }
    }

    window.addEventListener('storage', render);
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    storageNotice(); nav(); initHome(); initSeats(); initRecords();
  });
})();
