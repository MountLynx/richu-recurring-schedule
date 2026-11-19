(() => {
  'use strict';

  const API_BASE = '/api/tasks';
  const MAX_MONTH_EVENTS = 3;

  const COLORS = {
    moss: { color: '#59755e', soft: '#e9efe7', ink: '#3f5947', name: '苔绿' },
    clay: { color: '#c66d4b', soft: '#f6e9e3', ink: '#8a4f38', name: '陶土' },
    ocean: { color: '#4c7383', soft: '#e7eef1', ink: '#3c5f6d', name: '雾蓝' },
    plum: { color: '#8a6173', soft: '#f0e7eb', ink: '#6f4b5c', name: '梅子' },
    ochre: { color: '#b18b45', soft: '#f3ecdd', ink: '#7b6234', name: '赭黄' }
  };
  const COLOR_KEYS = Object.keys(COLORS);
  const WEEKDAYS_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const WEEKDAYS_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const MONTH_WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  const els = {
    brandHome: document.getElementById('brandHome'),
    headerTodayBtn: document.getElementById('headerTodayBtn'),
    todayBtn: document.getElementById('todayBtn'),
    newTaskBtn: document.getElementById('newTaskBtn'),
    sideNewTaskBtn: document.getElementById('sideNewTaskBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    periodKicker: document.getElementById('periodKicker'),
    periodTitle: document.getElementById('periodTitle'),
    periodSubtitle: document.getElementById('periodSubtitle'),
    viewTabs: Array.from(document.querySelectorAll('.view-tab')),
    monthView: document.getElementById('monthView'),
    weekView: document.getElementById('weekView'),
    dayView: document.getElementById('dayView'),
    monthGrid: document.getElementById('monthGrid'),
    weekList: document.getElementById('weekList'),
    dayViewContent: document.getElementById('dayViewContent'),
    taskList: document.getElementById('taskList'),
    taskCount: document.getElementById('taskCount'),
    nextCard: document.getElementById('nextCard'),
    nextCardContent: document.getElementById('nextCardContent'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalKicker: document.getElementById('modalKicker'),
    modalTitle: document.getElementById('modalTitle'),
    taskForm: document.getElementById('taskForm'),
    taskId: document.getElementById('taskId'),
    taskTypeSwitch: document.getElementById('taskTypeSwitch'),
    taskTypeField: document.getElementById('taskTypeField'),
    windowModeField: document.getElementById('windowModeField'),
    windowModeOptions: document.getElementById('windowModeOptions'),
    startDateLabel: document.getElementById('startDateLabel'),
    intervalField: document.getElementById('intervalField'),
    intervalLabel: document.getElementById('intervalLabel'),
    taskTitle: document.getElementById('taskTitle'),
    taskStartDate: document.getElementById('taskStartDate'),
    taskInterval: document.getElementById('taskInterval'),
    taskNote: document.getElementById('taskNote'),
    titleError: document.getElementById('titleError'),
    intervalError: document.getElementById('intervalError'),
    quickIntervals: document.getElementById('quickIntervals'),
    colorOptions: document.getElementById('colorOptions'),
    previewDot: document.getElementById('previewDot'),
    rhythmPreview: document.getElementById('rhythmPreview'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    deleteTaskBtn: document.getElementById('deleteTaskBtn'),
    timePointModalBackdrop: document.getElementById('timePointModalBackdrop'),
    timePointModalCloseBtn: document.getElementById('timePointModalCloseBtn'),
    timePointForm: document.getElementById('timePointForm'),
    timePointList: document.getElementById('timePointList'),
    addTimePointBtn: document.getElementById('addTimePointBtn'),
    timePointError: document.getElementById('timePointError'),
    timePointCancelBtn: document.getElementById('timePointCancelBtn'),
    timePointSubmitBtn: document.getElementById('timePointSubmitBtn'),
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    authScreen: document.getElementById('authScreen'),
    authLoading: document.getElementById('authLoading'),
    authContent: document.getElementById('authContent'),
    authServerError: document.getElementById('authServerError'),
    authServerErrorText: document.getElementById('authServerErrorText'),
    authRetryBtn: document.getElementById('authRetryBtn'),
    authTabs: Array.from(document.querySelectorAll('[data-auth-mode]')),
    authTitle: document.getElementById('authTitle'),
    authSubtitle: document.getElementById('authSubtitle'),
    authForm: document.getElementById('authForm'),
    authUsername: document.getElementById('authUsername'),
    authPassword: document.getElementById('authPassword'),
    authConfirmField: document.getElementById('authConfirmField'),
    authConfirmPassword: document.getElementById('authConfirmPassword'),
    authPasswordHint: document.getElementById('authPasswordHint'),
    authError: document.getElementById('authError'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),
    userChip: document.getElementById('userChip'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    logoutBtn: document.getElementById('logoutBtn')
  };

  const today = startOfDay(new Date());

  const state = {
    view: 'month',
    focusDate: today,
    selectedDate: toISO(today),
    returnView: 'month',
    editingId: null,
    draftColor: 'moss',
    draftType: 'fixed',
    draftWindowMode: 'continuous',
    draftOneOff: false,
    currentUser: null,
    authMode: 'login',
    toastTimer: null
  };

  let tasks = [];
  let timePoints = [];
  let isSaving = false;
  let timePointSaving = false;
  let authBusy = false;
  let draggingTaskId = null;
  const pendingCompletionIds = new Set();

  init();

  async function init() {
    bindEvents();
    showLoadingState();
    await restoreSession();
  }

  async function restoreSession() {
    els.authLoading.hidden = false;
    els.authContent.hidden = true;
    els.authServerError.hidden = true;

    try {
      const data = await apiRequest('/api/auth/me');
      await enterApp(data.user);
    } catch (error) {
      if (error.status === 401) {
        showAuthScreen('login');
      } else {
        showAuthServerError(error.message || '无法连接服务器');
      }
    }
  }

  async function enterApp(user) {
    state.currentUser = user;
    els.authScreen.hidden = true;
    els.userChip.hidden = false;
    els.userName.textContent = user.username;
    els.userAvatar.textContent = Array.from(user.username)[0].toUpperCase();
    document.body.classList.remove('auth-locked');
    showLoadingState();

    try {
      const [loadedTasks, loadedTimePoints] = await Promise.all([
        fetchTasks(),
        fetchTimePoints()
      ]);
      tasks = loadedTasks;
      timePoints = loadedTimePoints;
      renderAll();
    } catch (error) {
      if (error.status === 401) {
        showAuthScreen('login', '登录已过期，请重新登录');
        return;
      }
      renderLoadError(error);
    }
  }

  function showAuthScreen(mode = 'login', message = '') {
    state.currentUser = null;
    tasks = [];
    timePoints = [];
    els.authScreen.hidden = false;
    els.authLoading.hidden = true;
    els.authServerError.hidden = true;
    els.authContent.hidden = false;
    els.userChip.hidden = true;
    document.body.classList.add('auth-locked');
    setAuthMode(mode);
    if (!els.modalBackdrop.hidden) closeTaskModal();
    if (!els.timePointModalBackdrop.hidden) closeTimePointModal();

    if (message) {
      showAuthError(message);
    } else {
      hideAuthError();
    }
  }

  function showAuthServerError(message) {
    els.authScreen.hidden = false;
    els.authLoading.hidden = true;
    els.authContent.hidden = true;
    els.authServerError.hidden = false;
    els.authServerErrorText.textContent = message;
    els.userChip.hidden = true;
    document.body.classList.add('auth-locked');
  }

  function setAuthMode(mode) {
    state.authMode = mode === 'register' ? 'register' : 'login';
    const isRegister = state.authMode === 'register';
    els.authTabs.forEach((tab) => {
      const active = tab.dataset.authMode === state.authMode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    els.authTitle.textContent = isRegister ? '创建你的日程空间' : '欢迎回来';
    els.authSubtitle.textContent = isRegister
      ? '注册后，你的周期事项将独立保存在自己的账户中。'
      : '登录后继续查看你的周期日程。';
    els.authConfirmField.hidden = !isRegister;
    els.authPasswordHint.hidden = !isRegister;
    els.authSubmitBtn.textContent = isRegister ? '注册并登录' : '登录';
    els.authPassword.setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
    els.authConfirmPassword.value = '';
    hideAuthError();
  }

  function showAuthError(message) {
    els.authError.textContent = message;
    els.authError.hidden = false;
  }

  function hideAuthError() {
    els.authError.hidden = true;
    els.authError.textContent = '';
  }

  function setAuthBusy(busy) {
    authBusy = busy;
    els.authSubmitBtn.disabled = busy;
    els.authSubmitBtn.textContent = busy
      ? '请稍候…'
      : (state.authMode === 'register' ? '注册并登录' : '登录');
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (authBusy) return;
    hideAuthError();

    const username = els.authUsername.value.trim();
    const password = els.authPassword.value;
    const isRegister = state.authMode === 'register';

    if (!username) {
      showAuthError('请输入用户名');
      els.authUsername.focus();
      return;
    }
    if (username.length < 3 || username.length > 24) {
      showAuthError('用户名需为 3–24 个字符');
      els.authUsername.focus();
      return;
    }
    if (!password) {
      showAuthError('请输入密码');
      els.authPassword.focus();
      return;
    }
    if (isRegister && password.length < 8) {
      showAuthError('密码至少需要 8 个字符');
      els.authPassword.focus();
      return;
    }
    if (isRegister && password !== els.authConfirmPassword.value) {
      showAuthError('两次输入的密码不一致');
      els.authConfirmPassword.focus();
      return;
    }

    setAuthBusy(true);
    try {
      const data = await apiRequest(`/api/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      await enterApp(data.user);
      els.authForm.reset();
    } catch (error) {
      showAuthError(error.message || '操作失败，请稍后重试');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    if (!window.confirm('确定退出当前账户吗？')) return;
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      // Even if the request fails, return to the local login screen.
    }
    state.currentUser = null;
    tasks = [];
    els.authForm.reset();
    showAuthScreen('login');
  }

  /* ---------------------------------- Data --------------------------------- */

  async function apiRequest(path, options = {}) {
    const config = {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    };

    let response;
    try {
      response = await fetch(path, config);
    } catch (error) {
      throw new Error('无法连接后端服务，请使用 npm start 启动服务');
    }

    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { error: text } : {};
    }

    if (!response.ok) {
      const error = new Error((data && data.error) || `请求失败（${response.status}）`);
      error.status = response.status;
      if (response.status === 401 && !path.startsWith('/api/auth/')) {
        showAuthScreen('login', '登录已过期，请重新登录');
      }
      throw error;
    }
    return data;
  }

  async function fetchTasks() {
    const data = await apiRequest(API_BASE);
    if (!data || !Array.isArray(data.tasks)) {
      throw new Error('后端返回的数据格式不正确');
    }
    return data.tasks.map(normalizeTask).filter(Boolean);
  }

  async function createTaskOnServer(payload) {
    const data = await apiRequest(API_BASE, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const task = normalizeTask(data.task);
    if (!task) throw new Error('后端返回的事项数据无效');
    return task;
  }

  async function updateTaskOnServer(id, payload) {
    const data = await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    const task = normalizeTask(data.task);
    if (!task) throw new Error('后端返回的事项数据无效');
    return task;
  }

  async function deleteTaskOnServer(id) {
    await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function setTaskCompletionOnServer(id, date, completed) {
    return apiRequest(`${API_BASE}/${encodeURIComponent(id)}/completion`, {
      method: 'PUT',
      body: JSON.stringify({ date, completed })
    });
  }

  async function fetchTimePoints() {
    const data = await apiRequest('/api/time-points');
    if (!data || !Array.isArray(data.timePoints)) {
      throw new Error('后端返回的时间点数据格式不正确');
    }
    return data.timePoints
      .filter((point) => point && typeof point.time === 'string')
      .map((point) => ({ id: String(point.id), time: point.time }));
  }

  async function saveTimePointsOnServer(timeValues) {
    const data = await apiRequest('/api/time-points', {
      method: 'PUT',
      body: JSON.stringify({ timePoints: timeValues })
    });
    if (!data || !Array.isArray(data.timePoints)) {
      throw new Error('后端返回的时间点数据格式不正确');
    }
    return data.timePoints.map((point) => ({ id: String(point.id), time: point.time }));
  }

  async function moveTaskSlotOnServer(id, slot) {
    return apiRequest(`${API_BASE}/${encodeURIComponent(id)}/slot`, {
      method: 'PUT',
      body: JSON.stringify({ slot })
    });
  }

  function normalizeTask(task) {
    if (!task || typeof task !== 'object') return null;
    const title = typeof task.title === 'string' ? task.title.trim() : '';
    const startDate = typeof task.startDate === 'string' ? task.startDate : '';
    const interval = Number(task.interval);
    if (!title || !isISODate(startDate) || !Number.isInteger(interval) || interval < 1 || interval > 365) {
      return null;
    }
    const type = task.type === 'window'
      ? 'window'
      : (task.type === 'once' ? 'once' : 'fixed');
    const completions = Array.isArray(task.completions)
      ? task.completions
          .filter((item) => item && typeof item.occurrenceKey === 'string')
          .map((item) => ({
            occurrenceKey: item.occurrenceKey,
            completedDate: typeof item.completedDate === 'string' ? item.completedDate : item.occurrenceKey,
            completedAt: Number(item.completedAt) || 0
          }))
      : [];
    return {
      id: String(task.id || createId()),
      title: title.slice(0, 40),
      startDate,
      interval,
      color: COLORS[task.color] ? task.color : 'moss',
      note: typeof task.note === 'string' ? task.note.slice(0, 120) : '',
      type,
      windowMode: type === 'window'
        ? (task.windowMode === 'continuous' ? 'continuous' : 'flexible')
        : null,
      timeSlot: Number.isInteger(Number(task.timeSlot)) && Number(task.timeSlot) >= 0
        ? Number(task.timeSlot)
        : 0,
      completions,
      createdAt: Number(task.createdAt) || Date.now()
    };
  }

  function showLoadingState() {
    els.monthGrid.innerHTML = `
      <div class="status-panel">
        <span class="status-spinner" aria-hidden="true"></span>
        <p>正在从 SQLite 载入日程…</p>
      </div>
    `;
    els.taskList.innerHTML = '<div class="task-empty">正在载入…</div>';
    els.taskCount.textContent = '—';
    els.nextCardContent.innerHTML = `
      <div class="next-card__content">
        <p class="next-card__label">正在载入</p>
        <p class="next-card__empty-title">读取日程中…</p>
      </div>
    `;
  }

  function renderLoadError(error) {
    const message = error && error.message ? error.message : '无法载入日程';
    els.periodKicker.textContent = 'BACKEND OFFLINE';
    els.periodTitle.textContent = '无法载入日程';
    els.periodSubtitle.textContent = '请确认后端服务已启动';
    els.monthGrid.innerHTML = `
      <div class="status-panel status-panel--error">
        <span class="status-panel__mark" aria-hidden="true">!</span>
        <h3>没有连接到后端</h3>
        <p>${escapeHtml(message)}</p>
        <code>npm start</code>
      </div>
    `;
    els.weekList.innerHTML = '';
    els.dayViewContent.innerHTML = '';
    els.taskCount.textContent = '0';
    els.taskList.innerHTML = '<div class="task-empty">连接后端后，事项会显示在这里。</div>';
    els.nextCardContent.innerHTML = `
      <div class="next-card__content">
        <p class="next-card__label">离线状态</p>
        <p class="next-card__empty-title">日程暂时不可用。</p>
        <p class="next-card__empty-copy">运行 npm start 启动内置 SQLite 后端。</p>
      </div>
      <div class="next-card__count">未来 7 天 <strong>—</strong> 次安排</div>
    `;
    showToast(message);
  }

  /* --------------------------------- State --------------------------------- */

  function switchView(nextView) {
    if (nextView === state.view) return;
    if (nextView === 'day' && state.view !== 'day') {
      state.returnView = state.view;
    }
    state.view = nextView;
    if (nextView === 'day') {
      state.focusDate = parseISO(state.selectedDate);
    }
    renderAll();
  }

  function openDay(dateStr) {
    if (state.view !== 'day') {
      state.returnView = state.view;
    }
    state.selectedDate = dateStr;
    state.focusDate = parseISO(dateStr);
    state.view = 'day';
    renderAll();
  }

  function goBackFromDay() {
    switchView(state.returnView === 'week' ? 'week' : 'month');
  }

  function goToday() {
    state.focusDate = today;
    state.selectedDate = toISO(today);
    renderAll();
  }

  function navigate(step) {
    if (state.view === 'month') {
      const current = state.focusDate;
      state.focusDate = new Date(current.getFullYear(), current.getMonth() + step, 1);
    } else if (state.view === 'week') {
      state.focusDate = addDays(state.focusDate, step * 7);
    } else {
      state.focusDate = addDays(parseISO(state.selectedDate), step);
      state.selectedDate = toISO(state.focusDate);
    }
    renderAll();
  }

  /* --------------------------------- Render -------------------------------- */

  function renderAll() {
    renderPeriodHeader();
    renderViewVisibility();
    renderMonth();
    renderWeek();
    renderDay();
    renderSidebar();
    renderTodayOverview();
  }

  function renderPeriodHeader() {
    if (state.view === 'month') {
      const monthStart = startOfMonth(state.focusDate);
      const monthEnd = endOfMonth(state.focusDate);
      const count = countOccurrences(monthStart, monthEnd);
      const activeTasks = new Set();
      eachDate(monthStart, monthEnd, (date) => {
        getTasksForDate(toISO(date)).forEach((task) => activeTasks.add(task.id));
      });
      els.periodKicker.textContent = 'MONTHLY VIEW';
      els.periodTitle.textContent = `${monthStart.getFullYear()}年${monthStart.getMonth() + 1}月`;
      els.periodSubtitle.textContent = `${activeTasks.size} 个事项 · ${count} 次安排`;
      els.prevBtn.setAttribute('aria-label', '上一月');
      els.nextBtn.setAttribute('aria-label', '下一月');
      return;
    }

    if (state.view === 'week') {
      const weekStart = startOfWeek(state.focusDate);
      const weekEnd = addDays(weekStart, 6);
      const count = countOccurrences(weekStart, weekEnd);
      els.periodKicker.textContent = 'WEEKLY VIEW';
      els.periodTitle.textContent = formatWeekTitle(weekStart, weekEnd);
      els.periodSubtitle.textContent = `第 ${getISOWeekNumber(weekStart)} 周 · ${count} 次安排`;
      els.prevBtn.setAttribute('aria-label', '上一周');
      els.nextBtn.setAttribute('aria-label', '下一周');
      return;
    }

    const selected = parseISO(state.selectedDate);
    const count = getTasksForDate(state.selectedDate).length;
    els.periodKicker.textContent = 'DAILY VIEW';
    els.periodTitle.textContent = `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日`;
    els.periodSubtitle.textContent = `${WEEKDAYS_FULL[selected.getDay()]} · ${count} 项安排`;
    els.prevBtn.setAttribute('aria-label', '前一天');
    els.nextBtn.setAttribute('aria-label', '后一天');
  }

  function renderViewVisibility() {
    els.monthView.hidden = state.view !== 'month';
    els.weekView.hidden = state.view !== 'week';
    els.dayView.hidden = state.view !== 'day';

    els.viewTabs.forEach((tab) => {
      const active = tab.dataset.view === state.view;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  }

  function renderMonth() {
    const monthStart = startOfMonth(state.focusDate);
    const gridStart = startOfWeek(monthStart);
    const todayStr = toISO(today);
    const cells = [];

    for (let index = 0; index < 42; index += 1) {
      const date = addDays(gridStart, index);
      const dateStr = toISO(date);
      const dayTasks = getTasksForDate(dateStr);
      const outside = date.getMonth() !== monthStart.getMonth();
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === state.selectedDate;
      const visibleTasks = dayTasks.slice(0, MAX_MONTH_EVENTS);
      const extraCount = dayTasks.length - visibleTasks.length;
      const firstOfMonthLabel = date.getDate() === 1
        ? `<span class="day-cell__month-label">${date.getMonth() + 1}月</span>`
        : '';

      const eventMarkup = visibleTasks.length
        ? `<div class="day-events">${visibleTasks.map((task) => {
            const completed = isTaskCompletedOn(task, dateStr);
            return `
              <span
                class="event-pill${isWindowTask(task) ? ' event-pill--window' : (task.type === 'once' ? ' event-pill--once' : '')}${completed ? ' is-completed' : ''}"
                data-color="${escapeHtml(task.color)}"
                data-kind="${escapeHtml(task.type || 'fixed')}"
                style="${colorVars(task.color)}"
                title="${escapeHtml(task.title)}${isWindowTask(task) ? '（区间完成）' : ''}${completed ? '（已完成）' : ''}"
              >
                <span>${escapeHtml(task.title)}</span>
                ${completed ? '<span class="event-pill__check" aria-hidden="true">✓</span>' : ''}
              </span>
            `;
          }).join('')}${extraCount > 0 ? `<span class="more-events">还有 ${extraCount} 项</span>` : ''}</div>`
        : '';

      cells.push(`
        <div
          class="day-cell${outside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}"
          data-date="${dateStr}"
          role="button"
          tabindex="0"
          aria-label="${date.getMonth() + 1}月${date.getDate()}日，${dayTasks.length} 项安排"
        >
          <div class="day-cell__head">
            <span class="day-number">${date.getDate()}</span>
            ${firstOfMonthLabel}
          </div>
          ${eventMarkup}
        </div>
      `);
    }

    els.monthGrid.innerHTML = cells.join('');
  }

  function renderWeek() {
    const weekStart = startOfWeek(state.focusDate);
    const weekEnd = addDays(weekStart, 6);
    const todayStr = toISO(today);
    const { segments, laneCount } = getWeekSegments(weekStart);

    const dayHeads = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const dateStr = toISO(date);
      const isToday = dateStr === todayStr;
      const dayTasks = getTasksForDate(dateStr);
      return `
        <button
          class="week-day-head${isToday ? ' is-today' : ''}"
          type="button"
          data-open-day="${dateStr}"
          aria-label="打开${date.getMonth() + 1}月${date.getDate()}日"
        >
          <span class="week-day-head__weekday">${WEEKDAYS_SHORT[date.getDay()]}</span>
          <span class="week-day-head__number">${date.getDate()}</span>
          <span class="week-day-head__count">${dayTasks.length || ''}</span>
        </button>
      `;
    }).join('');

    const chipMarkup = segments.map((segment) => {
      const task = segment.task;
      const isWindow = segment.kind === 'window';
      const modeClass = isWindow
        ? ` week-chip--${task.windowMode === 'continuous' ? 'continuous' : 'flexible'}`
        : (task.type === 'once' ? ' week-chip--once' : ' week-chip--fixed');
      const clipClass = `${segment.clippedStart ? ' is-clipped-left' : ''}${segment.clippedEnd ? ' is-clipped-right' : ''}`;
      const span = segment.endIndex - segment.startIndex + 1;
      const kindLabel = isWindow
        ? (task.windowMode === 'continuous' ? '连续进行' : '灵活完成')
        : (task.type === 'once' ? '单日事项' : '固定间隔');
      const rangeLabel = isWindow
        ? `${formatCompactDate(parseISO(segment.occurrenceStart))}–${formatCompactDate(parseISO(segment.occurrenceEnd))}`
        : '';
      const completionKey = isWindow ? segment.occurrenceStart : segment.visibleStart;
      const completed = isTaskCompletedForKey(task, completionKey);
      const titleText = isWindow
        ? `${task.title} · ${kindLabel} · ${rangeLabel}${completed ? ' · 已完成' : ''}`
        : `${task.title} · ${kindLabel}${completed ? ' · 已完成' : ''}`;
      const style = `${colorVars(task.color)};grid-column:${segment.startIndex + 1} / ${segment.endIndex + 2};grid-row:${segment.lane + 1}`;

      return `
        <button
          class="week-chip${isWindow ? ' week-chip--window' : ''}${modeClass}${clipClass}${span > 1 ? ' is-spanning' : ''}${completed ? ' is-completed' : ''}"
          type="button"
          data-open-day="${segment.visibleStart}"
          style="${style}"
          title="${escapeHtml(titleText)}"
          aria-label="${escapeHtml(titleText)}，点击查看当天日程"
        >
          <span class="week-chip__dot" aria-hidden="true"></span>
          <span class="week-chip__title">${escapeHtml(task.title)}</span>
          ${completed ? '<span class="week-chip__check" aria-hidden="true">✓</span>' : ''}
          <span class="week-chip__meta">${isWindow ? `${kindLabel} · ${rangeLabel}` : kindLabel}</span>
          ${isWindow ? `<span class="week-chip__range" aria-hidden="true"></span>` : ''}
        </button>
      `;
    }).join('');

    const emptyMarkup = segments.length
      ? ''
      : `<div class="week-board__empty">这一周还没有安排，点击日期可进入单日视图。</div>`;

    els.weekList.innerHTML = `
      <div class="week-board">
        <div class="week-board__days">${dayHeads}</div>
        <div class="week-board__body">
          <div class="week-board__grid" aria-hidden="true">
            ${Array.from({ length: 7 }, () => '<span></span>').join('')}
          </div>
          <div class="week-board__lanes" style="--week-lanes:${Math.max(laneCount, 1)}">
            ${chipMarkup}
            ${emptyMarkup}
          </div>
        </div>
        <div class="week-board__legend">
          <span><i class="legend-swatch legend-swatch--fixed"></i>固定间隔</span>
          <span><i class="legend-swatch legend-swatch--once"></i>单日事项</span>
          <span><i class="legend-swatch legend-swatch--continuous"></i>区间 · 连续进行</span>
          <span><i class="legend-swatch legend-swatch--flexible"></i>区间 · 灵活完成</span>
        </div>
      </div>
    `;
  }

  function renderDay() {
    const date = parseISO(state.selectedDate);
    const dayTasks = getTasksForDate(state.selectedDate);
    const isToday = state.selectedDate === toISO(today);
    const returnLabel = state.returnView === 'week' ? '周视图' : '月视图';

    els.dayViewContent.innerHTML = `
      <div class="day-view__crumbs">
        <button class="back-btn" type="button" data-back>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          返回${returnLabel}
        </button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">${WEEKDAYS_FULL[date.getDay()]}</span>
      </div>

      <div class="day-view__hero">
        <div class="day-view__date">
          <span class="day-view__big-number">${date.getDate()}</span>
          <span class="day-view__date-copy">
            <span class="day-view__weekday">${WEEKDAYS_FULL[date.getDay()]}</span>
            <span class="day-view__full-date">${date.getFullYear()}年${date.getMonth() + 1}月 · ${isToday ? '今天' : getRelativeDayLabel(state.selectedDate)}</span>
          </span>
        </div>
        <div class="day-view__hero-side">
          <button class="btn btn--soft day-timepoints-btn" type="button" data-configure-timepoints>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>
            时间点
          </button>
          <button class="btn btn--soft day-oneoff-btn" type="button" data-new-oneoff="${state.selectedDate}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
            单日事项
          </button>
          <div class="day-view__summary">
            <strong>${dayTasks.length}</strong>
            项安排
          </div>
        </div>
      </div>
      ${renderDayTimeline(dayTasks)}
    `;
  }

  function renderDayTimeline(dayTasks) {
    const slotCount = Math.max(1, timePoints.length + 1);
    const slots = Array.from({ length: slotCount }, () => []);

    dayTasks.forEach((task) => {
      const slot = clampTimeSlot(task.timeSlot || 0);
      slots[slot].push(task);
    });

    let timelineMarkup = '';
    for (let slot = 0; slot < slotCount; slot += 1) {
      const rangeLabel = getTimeSlotRangeLabel(slot);
      const tasksMarkup = slots[slot].length
        ? slots[slot].map((task) => renderDayTaskCard(task)).join('')
        : '<div class="day-slot__empty">拖动事项到此区间</div>';

      timelineMarkup += `
        <section class="day-slot" data-slot="${slot}" aria-label="${escapeHtml(rangeLabel)}">
          <div class="day-slot__range">${escapeHtml(rangeLabel)}</div>
          <div class="day-slot__items">${tasksMarkup}</div>
        </section>
      `;

      if (slot < timePoints.length) {
        const timeValue = timePoints[slot].time;
        timelineMarkup += `
          <div class="day-time-divider" data-time="${escapeHtml(timeValue)}" aria-hidden="true">
            <span class="day-time-divider__line"></span>
            <span class="day-time-divider__time">${escapeHtml(timeValue)}</span>
            <span class="day-time-divider__line"></span>
          </div>
        `;
      }
    }

    return `<div class="day-timeline" data-slot-count="${slotCount}">${timelineMarkup}</div>`;
  }

  function renderDayTaskCard(task) {
    const windowInfo = isWindowTask(task) ? getWindowForDate(task, state.selectedDate) : null;
    const completed = isTaskCompletedOn(task, state.selectedDate);
    const modeLabel = windowInfo
      ? (task.windowMode === 'continuous' ? '连续进行' : '灵活完成')
      : '固定间隔';
    const completionMeta = completed
      ? `<span class="type-badge type-badge--done">已完成</span><span class="meta-dot" aria-hidden="true"></span>`
      : '';
    const scheduleMeta = windowInfo
      ? `${completionMeta}<span class="type-badge type-badge--window">区间第 ${windowInfo.dayNumber}/${windowInfo.length} 天</span>
         <span class="meta-dot" aria-hidden="true"></span>
         <span>${formatShortDate(parseISO(windowInfo.startDate))}–${formatShortDate(parseISO(windowInfo.endDate))}</span>
         <span class="meta-dot" aria-hidden="true"></span>
         <span>${modeLabel}</span>`
      : (task.type === 'once'
        ? `${completionMeta}<span class="type-badge type-badge--once">单日事项</span>
           <span class="meta-dot" aria-hidden="true"></span>
           <span>${formatFullDate(parseISO(task.startDate))} · 不重复</span>`
        : `${completionMeta}<span>${intervalLabel(task.interval)}</span>
           <span class="meta-dot" aria-hidden="true"></span>
           <span>固定间隔 · 自 ${formatShortDate(parseISO(task.startDate))} 起</span>`);
    const completionLabel = completed ? '取消完成' : '标记完成';

    return `
      <article
        class="day-task day-task--draggable${windowInfo ? ' day-task--window' : ''}${task.type === 'once' ? ' day-task--once' : ''}${completed ? ' day-task--completed' : ''}"
        data-color="${escapeHtml(task.color)}"
        data-task-id="${escapeHtml(task.id)}"
        style="${colorVars(task.color)}"
        draggable="true"
        title="拖动到其他时间区间"
      >
        <button
          class="day-task__toggle${completed ? ' is-completed' : ''}"
          type="button"
          role="checkbox"
          aria-checked="${completed}"
          aria-label="${completionLabel}：${escapeHtml(task.title)}"
          data-complete-id="${escapeHtml(task.id)}"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
        </button>
        <span class="day-task__stripe" aria-hidden="true"></span>
        <div class="day-task__copy">
          <h3 class="day-task__title">${escapeHtml(task.title)}</h3>
          <div class="day-task__meta">${scheduleMeta}</div>
          ${task.note ? `<p class="day-task__note">${escapeHtml(task.note)}</p>` : ''}
        </div>
        <span class="day-task__grip" aria-hidden="true"></span>
        <div class="day-task__actions">
          <button class="edit-task-btn" type="button" data-edit-id="${escapeHtml(task.id)}" aria-label="编辑${escapeHtml(task.title)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            <span>编辑</span>
          </button>
        </div>
      </article>
    `;
  }

  function clampTimeSlot(slot) {
    const numeric = Number(slot);
    if (!Number.isInteger(numeric) || numeric < 0) return 0;
    return Math.min(numeric, timePoints.length);
  }

  function getTimeSlotRangeLabel(slot) {
    if (!timePoints.length) return '全天';
    const index = clampTimeSlot(slot);
    if (index === 0) return `${timePoints[0].time} 前`;
    if (index === timePoints.length) return `${timePoints[timePoints.length - 1].time} 后`;
    return `${timePoints[index - 1].time} – ${timePoints[index].time}`;
  }

  function renderSidebar() {
    els.taskCount.textContent = String(tasks.length);

    if (!tasks.length) {
      els.taskList.innerHTML = '<div class="task-empty">还没有事项。可以从日视图添加单日事项，或新建周期事项。</div>';
      return;
    }

    els.taskList.innerHTML = tasks.map((task) => {
      const dateMeta = task.type === 'once'
        ? formatCompactDate(parseISO(task.startDate))
        : `自 ${formatCompactDate(parseISO(task.startDate))} 起`;
      return `
      <div
        class="task-row"
        style="${colorVars(task.color)}"
        data-edit-id="${escapeHtml(task.id)}"
        role="button"
        tabindex="0"
        aria-label="编辑${escapeHtml(task.title)}"
      >
        <span class="task-row__dot" aria-hidden="true"></span>
        <div class="task-row__main">
          <div class="task-row__title">${escapeHtml(task.title)}</div>
          <div class="task-row__meta">${scheduleSummary(task)} · ${dateMeta}</div>
        </div>
        <button class="task-row__edit" type="button" data-edit-id="${escapeHtml(task.id)}" aria-label="编辑${escapeHtml(task.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
      </div>
    `;
    }).join('');
  }

  function renderTodayOverview() {
    const dateStr = toISO(today);
    const dayTasks = getTasksForDate(dateStr);
    const completedTasks = dayTasks.filter((task) => isTaskCompletedOn(task, dateStr));
    const pendingTasks = dayTasks.filter((task) => !isTaskCompletedOn(task, dateStr));
    const total = dayTasks.length;
    const completedCount = completedTasks.length;
    const pendingCount = pendingTasks.length;
    const progress = total ? Math.round((completedCount / total) * 100) : 0;
    const orderedTasks = [...pendingTasks, ...completedTasks];
    const previewTasks = orderedTasks.slice(0, 3);
    const remainingCount = Math.max(0, total - previewTasks.length);

    let summaryTitle = '今天还没有安排';
    if (total > 0 && pendingCount > 0) summaryTitle = `今天还有 ${pendingCount} 件事`;
    if (total > 0 && pendingCount === 0) summaryTitle = '今天的安排已完成';

    const previewMarkup = previewTasks.length
      ? previewTasks.map((task) => {
          const completed = isTaskCompletedOn(task, dateStr);
          let meta = intervalLabel(task.interval);

          if (completed) {
            meta = '已完成';
          } else if (isWindowTask(task)) {
            const windowInfo = getWindowForDate(task, dateStr);
            const daysLeft = windowInfo ? diffDays(today, parseISO(windowInfo.endDate)) : 0;
            meta = daysLeft <= 0 ? '今天截止' : `区间剩 ${daysLeft} 天`;
          } else if (task.type === 'once') {
            meta = '单日事项';
          }

          return `
            <div class="today-task${completed ? ' is-completed' : ''}">
              <span class="today-task__status" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>
              </span>
              <span class="today-task__title">${escapeHtml(task.title)}</span>
              <span class="today-task__meta">${escapeHtml(meta)}</span>
            </div>
          `;
        }).join('')
      : `<p class="today-overview__empty">从日视图添加单日事项，或新建一个周期事项。</p>`;

    els.nextCardContent.innerHTML = `
      <div class="today-overview">
        <div class="today-overview__head">
          <div class="today-overview__heading">
            <p class="today-overview__date">${formatFullDate(today)} · ${WEEKDAYS_SHORT[today.getDay()]}</p>
            <h2 class="today-overview__title">${summaryTitle}</h2>
          </div>
          <div class="today-progress" style="--progress:${progress}" aria-label="今日已完成 ${completedCount} 项，共 ${total} 项">
            <span class="today-progress__value"><strong>${completedCount}</strong><small>/${total}</small></span>
          </div>
        </div>

        <div class="today-overview__bar" aria-hidden="true">
          <span style="width:${progress}%"></span>
        </div>

        <div class="today-overview__list">
          ${previewMarkup}
        </div>

        ${remainingCount > 0 ? `<p class="today-overview__more">还有 ${remainingCount} 项安排</p>` : ''}

        <button class="today-overview__link" type="button" data-open-today>
          查看今日
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
    `;
  }

  /* -------------------------------- Occurrences ---------------------------- */

  function isWindowTask(task) {
    return task.type === 'window';
  }

  function occursOn(task, dateStr) {
    if (dateStr < task.startDate) return false;
    if (task.type === 'once') return dateStr === task.startDate;
    if (isWindowTask(task)) return Boolean(getWindowForDate(task, dateStr));
    const distance = diffDays(parseISO(task.startDate), parseISO(dateStr));
    return distance >= 0 && distance % task.interval === 0;
  }

  function getWindowForDate(task, dateStr) {
    if (!isWindowTask(task) || dateStr < task.startDate) return null;
    const start = parseISO(task.startDate);
    const date = parseISO(dateStr);
    const distance = diffDays(start, date);
    if (distance < 0) return null;

    const cycleIndex = Math.floor(distance / task.interval);
    const windowStart = addDays(start, cycleIndex * task.interval);
    const windowEnd = addDays(windowStart, task.interval - 1);
    return {
      startDate: toISO(windowStart),
      endDate: toISO(windowEnd),
      dayNumber: distance - cycleIndex * task.interval + 1,
      length: task.interval,
      cycleIndex
    };
  }

  function getOccurrenceKey(task, dateStr) {
    if (isWindowTask(task)) {
      const windowInfo = getWindowForDate(task, dateStr);
      return windowInfo ? windowInfo.startDate : null;
    }
    return occursOn(task, dateStr) ? dateStr : null;
  }

  function isTaskCompletedForKey(task, occurrenceKey) {
    if (!occurrenceKey) return false;
    return (task.completions || []).some((completion) => completion.occurrenceKey === occurrenceKey);
  }

  function isTaskCompletedOn(task, dateStr) {
    return isTaskCompletedForKey(task, getOccurrenceKey(task, dateStr));
  }

  function getWindowsOverlapping(task, rangeStart, rangeEnd) {
    if (!isWindowTask(task)) return [];
    const firstStart = parseISO(task.startDate);
    const rangeStartDay = startOfDay(rangeStart);
    const rangeEndDay = startOfDay(rangeEnd);
    if (firstStart > rangeEndDay) return [];

    const distance = diffDays(firstStart, rangeStartDay);
    let cycleIndex = distance < 0 ? 0 : Math.max(0, Math.floor(distance / task.interval) - 1);
  let cursor = addDays(firstStart, cycleIndex * task.interval);
    const windows = [];

    while (cursor <= rangeEndDay) {
      const windowEnd = addDays(cursor, task.interval - 1);
      if (windowEnd >= rangeStartDay) {
        windows.push({
          startDate: toISO(cursor),
          endDate: toISO(windowEnd),
          cycleIndex
        });
      }
      cycleIndex += 1;
      cursor = addDays(firstStart, cycleIndex * task.interval);
    }

    return windows;
  }

  function getTasksForDate(dateStr) {
    return tasks.filter((task) => occursOn(task, dateStr));
  }

  function countOccurrences(rangeStart, rangeEnd) {
    let count = 0;
    tasks.forEach((task) => {
      if (isWindowTask(task)) {
        count += getWindowsOverlapping(task, rangeStart, rangeEnd).length;
        return;
      }
      eachDate(rangeStart, rangeEnd, (date) => {
        if (occursOn(task, toISO(date))) count += 1;
      });
    });
    return count;
  }

  function getWeekSegments(weekStart) {
    const weekEnd = addDays(weekStart, 6);
    const segments = [];

    tasks.forEach((task) => {
      if (isWindowTask(task)) {
        getWindowsOverlapping(task, weekStart, weekEnd).forEach((occurrence) => {
          const occurrenceStart = parseISO(occurrence.startDate);
          const occurrenceEnd = parseISO(occurrence.endDate);
          const visibleStart = occurrenceStart < weekStart ? weekStart : occurrenceStart;
          const visibleEnd = occurrenceEnd > weekEnd ? weekEnd : occurrenceEnd;
          segments.push({
            task,
            kind: 'window',
            startIndex: diffDays(weekStart, visibleStart),
            endIndex: diffDays(weekStart, visibleEnd),
            visibleStart: toISO(visibleStart),
            visibleEnd: toISO(visibleEnd),
            occurrenceStart: occurrence.startDate,
            occurrenceEnd: occurrence.endDate,
            clippedStart: occurrenceStart < weekStart,
            clippedEnd: occurrenceEnd > weekEnd
          });
        });
        return;
      }

      eachDate(weekStart, weekEnd, (date) => {
        const dateStr = toISO(date);
        if (!occursOn(task, dateStr)) return;
        const index = diffDays(weekStart, date);
        segments.push({
          task,
          kind: 'fixed',
          startIndex: index,
          endIndex: index,
          visibleStart: dateStr,
          visibleEnd: dateStr,
          clippedStart: false,
          clippedEnd: false
        });
      });
    });

    segments.sort((a, b) => {
      if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
      if (a.endIndex !== b.endIndex) return b.endIndex - a.endIndex;
      return a.task.createdAt - b.task.createdAt;
    });

    const laneEnds = [];
    segments.forEach((segment) => {
      let lane = laneEnds.findIndex((lastIndex) => segment.startIndex > lastIndex);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(segment.endIndex);
      } else {
        laneEnds[lane] = segment.endIndex;
      }
      segment.lane = lane;
    });

    return { segments, laneCount: laneEnds.length };
  }

  function eachDate(rangeStart, rangeEnd, callback) {
    let cursor = startOfDay(rangeStart);
    const end = startOfDay(rangeEnd);
    while (cursor <= end) {
      callback(cursor);
      cursor = addDays(cursor, 1);
    }
  }

  /* --------------------------------- Events -------------------------------- */

  function bindEvents() {
    els.brandHome.addEventListener('click', (event) => {
      event.preventDefault();
      state.selectedDate = toISO(today);
      state.focusDate = today;
      state.view = 'month';
      state.returnView = 'month';
      renderAll();
    });

    els.headerTodayBtn.addEventListener('click', goToday);
    els.todayBtn.addEventListener('click', goToday);
    els.prevBtn.addEventListener('click', () => navigate(-1));
    els.nextBtn.addEventListener('click', () => navigate(1));

    els.viewTabs.forEach((tab) => {
      tab.addEventListener('click', () => switchView(tab.dataset.view));
    });

    els.monthGrid.addEventListener('click', (event) => {
      const cell = event.target.closest('[data-date]');
      if (cell) openDay(cell.dataset.date);
    });

    els.monthGrid.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const cell = event.target.closest('[data-date]');
      if (!cell) return;
      event.preventDefault();
      openDay(cell.dataset.date);
    });

    els.weekList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-open-day]');
      if (row) openDay(row.dataset.openDay);
    });

    els.weekList.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-open-day]');
      if (!row) return;
      event.preventDefault();
      openDay(row.dataset.openDay);
    });

    els.dayViewContent.addEventListener('click', (event) => {
      if (event.target.closest('[data-back]')) {
        goBackFromDay();
        return;
      }

      const timePointButton = event.target.closest('[data-configure-timepoints]');
      if (timePointButton) {
        openTimePointModal();
        return;
      }

      const completionButton = event.target.closest('[data-complete-id]');
      if (completionButton) {
        toggleTaskCompletion(completionButton.dataset.completeId);
        return;
      }

      const editButton = event.target.closest('[data-edit-id]');
      if (editButton) {
        openTaskModal(findTask(editButton.dataset.editId));
        return;
      }

      const oneOffButton = event.target.closest('[data-new-oneoff]');
      if (oneOffButton) {
        openTaskModal(null, { startDate: oneOffButton.dataset.newOneoff, oneOff: true });
        return;
      }

      const newButton = event.target.closest('[data-new-date]');
      if (newButton) {
        openTaskModal(null, { startDate: newButton.dataset.newDate });
      }
    });

    els.taskList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-edit-id]');
      if (row) openTaskModal(findTask(row.dataset.editId));
    });

    els.taskList.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('button')) return;
      const row = event.target.closest('[data-edit-id]');
      if (!row) return;
      event.preventDefault();
      openTaskModal(findTask(row.dataset.editId));
    });

    els.newTaskBtn.addEventListener('click', () => openTaskModal());
    els.sideNewTaskBtn.addEventListener('click', () => openTaskModal());

    els.modalCloseBtn.addEventListener('click', closeTaskModal);
    els.cancelBtn.addEventListener('click', closeTaskModal);
    els.modalBackdrop.addEventListener('click', (event) => {
      if (event.target === els.modalBackdrop) closeTaskModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!els.modalBackdrop.hidden) {
        closeTaskModal();
      } else if (!els.timePointModalBackdrop.hidden) {
        closeTimePointModal();
      }
    });

    els.taskForm.addEventListener('submit', handleTaskSubmit);
    els.deleteTaskBtn.addEventListener('click', handleDeleteTask);

    els.taskTitle.addEventListener('input', () => {
      if (els.taskTitle.value.trim()) {
        els.titleError.hidden = true;
        els.taskTitle.removeAttribute('aria-invalid');
      }
    });

    els.taskInterval.addEventListener('input', () => {
      clearIntervalError();
      updateQuickIntervalState();
      updateRhythmPreview();
    });

    els.taskStartDate.addEventListener('input', updateRhythmPreview);

    els.quickIntervals.addEventListener('click', (event) => {
      const button = event.target.closest('[data-interval]');
      if (!button) return;
      els.taskInterval.value = button.dataset.interval;
      clearIntervalError();
      updateQuickIntervalState();
      updateRhythmPreview();
    });

    els.taskTypeSwitch.addEventListener('click', (event) => {
      const option = event.target.closest('[data-task-type]');
      if (!option) return;
      state.draftType = option.dataset.taskType;
      updateTaskTypeUI();
    });

    els.windowModeOptions.addEventListener('click', (event) => {
      const option = event.target.closest('[data-window-mode]');
      if (!option) return;
      state.draftWindowMode = option.dataset.windowMode;
      updateWindowModeUI();
      updateRhythmPreview();
    });

    els.colorOptions.addEventListener('click', (event) => {
      const swatch = event.target.closest('[data-color]');
      if (!swatch) return;
      state.draftColor = swatch.dataset.color;
      selectDraftColor();
    });

    els.nextCard.addEventListener('click', (event) => {
      const link = event.target.closest('[data-open-today]');
      if (link) openDay(toISO(today));
    });

    els.dayViewContent.addEventListener('dragstart', handleDayDragStart);
    els.dayViewContent.addEventListener('dragend', handleDayDragEnd);
    els.dayViewContent.addEventListener('dragover', handleDayDragOver);
    els.dayViewContent.addEventListener('dragleave', handleDayDragLeave);
    els.dayViewContent.addEventListener('drop', handleDayDrop);

    els.timePointModalCloseBtn.addEventListener('click', closeTimePointModal);
    els.timePointCancelBtn.addEventListener('click', closeTimePointModal);
    els.timePointModalBackdrop.addEventListener('click', (event) => {
      if (event.target === els.timePointModalBackdrop) closeTimePointModal();
    });
    els.addTimePointBtn.addEventListener('click', addTimePointRow);
    els.timePointList.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-time]');
      if (!removeButton) return;
      removeButton.closest('[data-time-row]').remove();
      refreshTimePointNumbers();
      hideTimePointError();
    });
    els.timePointForm.addEventListener('submit', handleTimePointSubmit);
    els.timePointList.addEventListener('input', hideTimePointError);

    els.authTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        if (authBusy) return;
        setAuthMode(tab.dataset.authMode);
        els.authUsername.focus();
      });
    });

    els.authForm.addEventListener('submit', handleAuthSubmit);
    els.authRetryBtn.addEventListener('click', restoreSession);
    els.logoutBtn.addEventListener('click', handleLogout);
    els.authUsername.addEventListener('input', hideAuthError);
    els.authPassword.addEventListener('input', hideAuthError);
    els.authConfirmPassword.addEventListener('input', hideAuthError);
  }

  /* ------------------------------ Time slots ------------------------------- */

  function handleDayDragStart(event) {
    const card = event.target.closest('.day-task--draggable');
    if (!card) return;
    draggingTaskId = card.dataset.taskId;
    card.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggingTaskId);
    }
  }

  function handleDayDragEnd(event) {
    const card = event.target.closest('.day-task--draggable');
    if (card) card.classList.remove('is-dragging');
    clearDropTargets();
    draggingTaskId = null;
  }

  function handleDayDragOver(event) {
    if (!draggingTaskId) return;
    const slot = event.target.closest('.day-slot');
    if (!slot) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    Array.from(els.dayViewContent.querySelectorAll('.day-slot.is-drop-target'))
      .filter((target) => target !== slot)
      .forEach((target) => target.classList.remove('is-drop-target'));
    slot.classList.add('is-drop-target');
  }

  function handleDayDragLeave(event) {
    const slot = event.target.closest('.day-slot');
    if (!slot) return;
    if (!event.relatedTarget || !slot.contains(event.relatedTarget)) {
      slot.classList.remove('is-drop-target');
    }
  }

  function handleDayDrop(event) {
    if (!draggingTaskId) return;
    const slot = event.target.closest('.day-slot');
    if (!slot) return;
    event.preventDefault();

    const taskId = draggingTaskId;
    const slotIndex = Number(slot.dataset.slot);
    clearDropTargets();
    draggingTaskId = null;
    moveTaskToSlot(taskId, slotIndex);
  }

  function clearDropTargets() {
    els.dayViewContent.querySelectorAll('.day-slot.is-drop-target')
      .forEach((slot) => slot.classList.remove('is-drop-target'));
    els.dayViewContent.querySelectorAll('.day-task.is-dragging')
      .forEach((card) => card.classList.remove('is-dragging'));
  }

  async function moveTaskToSlot(taskId, slot) {
    const task = findTask(taskId);
    if (!task) return;
    const targetSlot = clampTimeSlot(slot);
    const previousSlot = task.timeSlot;
    if (clampTimeSlot(previousSlot) === targetSlot) return;

    task.timeSlot = targetSlot;
    renderAll();

    try {
      await moveTaskSlotOnServer(task.id, targetSlot);
      showToast(`已移动「${task.title}」到 ${getTimeSlotRangeLabel(targetSlot)}`);
    } catch (error) {
      task.timeSlot = previousSlot;
      renderAll();
      showToast(error.message || '移动事项失败');
    }
  }

  /* ---------------------------- Time point modal --------------------------- */

  function openTimePointModal() {
    const times = timePoints.length
      ? timePoints.map((point) => point.time)
      : ['09:00'];

    renderTimePointRows(times);
    hideTimePointError();
    els.timePointModalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      const firstInput = els.timePointList.querySelector('input[type="time"]');
      if (firstInput) firstInput.focus();
    }, 50);
  }

  function closeTimePointModal() {
    els.timePointModalBackdrop.hidden = true;
    document.body.style.overflow = '';
    hideTimePointError();
  }

  function renderTimePointRows(times) {
    const sorted = [...times].sort();
    els.timePointList.innerHTML = sorted.map((timeValue, index) => `
      <div class="time-point-row" data-time-row>
        <span class="time-point-row__index">${String(index + 1).padStart(2, '0')}</span>
        <input
          class="text-input time-point-input"
          type="time"
          value="${escapeHtml(timeValue)}"
          aria-label="时间点 ${index + 1}"
        >
        <button class="time-point-remove" type="button" data-remove-time aria-label="删除时间点 ${index + 1}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');
  }

  function refreshTimePointNumbers() {
    Array.from(els.timePointList.querySelectorAll('[data-time-row]')).forEach((row, index) => {
      const number = row.querySelector('.time-point-row__index');
      const input = row.querySelector('input[type="time"]');
      const remove = row.querySelector('[data-remove-time]');
      if (number) number.textContent = String(index + 1).padStart(2, '0');
      if (input) input.setAttribute('aria-label', `时间点 ${index + 1}`);
      if (remove) remove.setAttribute('aria-label', `删除时间点 ${index + 1}`);
    });
  }

  function addTimePointRow() {
    const current = getTimePointInputValues();
    if (current.length >= 12) {
      showTimePointError('最多支持 12 个时间点');
      return;
    }
    const nextTime = findNextAvailableTime(current);
    renderTimePointRows([...current, nextTime]);
    hideTimePointError();
    const inputs = els.timePointList.querySelectorAll('input[type="time"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function getTimePointInputValues() {
    return Array.from(els.timePointList.querySelectorAll('input[type="time"]'))
      .map((input) => input.value.trim())
      .filter(Boolean);
  }

  function findNextAvailableTime(existing) {
    const preferred = ['09:00', '12:00', '18:00', '21:00', '08:00', '10:00', '14:00', '16:00', '20:00', '22:00'];
    const used = new Set(existing);
    const preferredMatch = preferred.find((timeValue) => !used.has(timeValue));
    if (preferredMatch) return preferredMatch;

    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        if (!used.has(timeValue)) return timeValue;
      }
    }
    return '23:59';
  }

  function showTimePointError(message) {
    els.timePointError.textContent = message;
    els.timePointError.hidden = false;
  }

  function hideTimePointError() {
    els.timePointError.hidden = true;
    els.timePointError.textContent = '';
  }

  async function handleTimePointSubmit(event) {
    event.preventDefault();
    if (timePointSaving) return;
    hideTimePointError();

    const values = Array.from(els.timePointList.querySelectorAll('input[type="time"]'))
      .map((input) => input.value.trim());

    if (values.length < 1) {
      showTimePointError('至少需要保留一个时间点');
      return;
    }
    if (values.length > 12) {
      showTimePointError('最多支持 12 个时间点');
      return;
    }
    if (values.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
      showTimePointError('请填写完整的时间点');
      return;
    }
    if (new Set(values).size !== values.length) {
      showTimePointError('时间点不能重复');
      return;
    }

    setTimePointSaving(true);
    try {
      timePoints = await saveTimePointsOnServer([...values].sort());
      tasks.forEach((task) => {
        if (task.timeSlot > timePoints.length) task.timeSlot = timePoints.length;
      });
      closeTimePointModal();
      renderAll();
      showToast('时间点已更新');
    } catch (error) {
      showTimePointError(error.message || '保存时间点失败');
    } finally {
      setTimePointSaving(false);
    }
  }

  function setTimePointSaving(saving) {
    timePointSaving = saving;
    els.timePointSubmitBtn.disabled = saving;
    els.timePointSubmitBtn.textContent = saving ? '保存中…' : '保存时间点';
  }

  /* ------------------------------- Completion ------------------------------ */

  async function toggleTaskCompletion(taskId) {
    const task = findTask(taskId);
    if (!task || pendingCompletionIds.has(taskId)) return;

    const wasCompleted = isTaskCompletedOn(task, state.selectedDate);
    pendingCompletionIds.add(taskId);

    Array.from(els.dayViewContent.querySelectorAll('[data-complete-id]'))
      .filter((button) => button.dataset.completeId === taskId)
      .forEach((button) => { button.disabled = true; });

    try {
      const data = await setTaskCompletionOnServer(taskId, state.selectedDate, !wasCompleted);

      if (!wasCompleted && data.completion) {
        const key = data.completion.occurrenceKey;
        task.completions = (task.completions || []).filter((item) => item.occurrenceKey !== key);
        task.completions.push(data.completion);
      } else if (wasCompleted) {
        const key = data.occurrenceKey;
        task.completions = (task.completions || []).filter((item) => item.occurrenceKey !== key);
      }

      renderAll();
      showToast(wasCompleted ? `已取消完成「${task.title}」` : `已完成「${task.title}」`);
    } catch (error) {
      showToast(error.message || '更新完成状态失败');
      renderAll();
    } finally {
      pendingCompletionIds.delete(taskId);
    }
  }

  /* --------------------------------- Modal --------------------------------- */

  function openTaskModal(task = null, options = {}) {
    const isEditing = Boolean(task);
    const oneOff = Boolean(options.oneOff) || (task && task.type === 'once');
    state.editingId = task ? task.id : null;
    state.draftColor = task ? task.color : pickNextColor();
    state.draftOneOff = oneOff;
    state.draftType = task && task.type !== 'once' ? task.type : 'fixed';
    state.draftWindowMode = task && task.windowMode ? task.windowMode : 'continuous';

    els.modalKicker.textContent = oneOff
      ? (isEditing ? 'EDIT ONE-OFF' : 'NEW ONE-OFF')
      : (isEditing ? 'EDIT RHYTHM' : 'NEW RHYTHM');
    els.modalTitle.textContent = oneOff
      ? (isEditing ? '编辑单日事项' : '新建单日事项')
      : (isEditing ? '编辑周期事项' : '新建周期事项');
    els.deleteTaskBtn.hidden = !isEditing;
    els.taskId.value = task ? task.id : '';
    els.taskTitle.value = task ? task.title : '';
    els.taskStartDate.value = task
      ? task.startDate
      : (options.startDate || (state.view === 'day' ? state.selectedDate : toISO(today)));
    els.taskInterval.value = task ? String(task.interval) : '1';
    els.taskNote.value = task ? task.note : '';

    els.titleError.hidden = true;
    clearIntervalError();
    els.taskTitle.removeAttribute('aria-invalid');
    els.taskInterval.removeAttribute('aria-invalid');

    selectDraftColor();
    updateTaskTypeUI();
    updateWindowModeUI();
    updateQuickIntervalState();
    updateRhythmPreview();

    setFormSaving(false);
    els.modalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => els.taskTitle.focus(), 50);
  }

  function closeTaskModal() {
    els.modalBackdrop.hidden = true;
    document.body.style.overflow = '';
    state.editingId = null;
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    if (isSaving) return;

    clearIntervalError();
    els.titleError.hidden = true;
    els.taskTitle.removeAttribute('aria-invalid');
    els.taskInterval.removeAttribute('aria-invalid');

    const title = els.taskTitle.value.trim();
    const interval = Number(els.taskInterval.value);
    const startDate = els.taskStartDate.value;
    let valid = true;

    if (!title) {
      els.titleError.hidden = false;
      els.taskTitle.setAttribute('aria-invalid', 'true');
      els.taskTitle.focus();
      valid = false;
    }

    if (!state.draftOneOff && (!Number.isInteger(interval) || interval < 1 || interval > 365)) {
      els.intervalError.hidden = false;
      els.taskInterval.setAttribute('aria-invalid', 'true');
      if (valid) els.taskInterval.focus();
      valid = false;
    }

    if (!isISODate(startDate)) {
      showToast(state.draftOneOff ? '请选择事项日期' : '请选择开始日期');
      if (valid) els.taskStartDate.focus();
      valid = false;
    }

    if (!valid) return;

    const existingIndex = state.editingId
      ? tasks.findIndex((task) => task.id === state.editingId)
      : -1;
    const wasEditing = existingIndex >= 0;

    if (state.editingId && !wasEditing) {
      showToast('要编辑的事项已不存在，请刷新后重试');
      return;
    }

    const taskType = state.draftOneOff ? 'once' : state.draftType;
    const payload = {
      title: title.slice(0, 40),
      startDate,
      interval: state.draftOneOff ? 1 : interval,
      color: state.draftColor,
      note: els.taskNote.value.trim().slice(0, 120),
      type: taskType,
      windowMode: taskType === 'window' ? state.draftWindowMode : null
    };

    setFormSaving(true);
    try {
      const savedTask = wasEditing
        ? await updateTaskOnServer(tasks[existingIndex].id, payload)
        : await createTaskOnServer(payload);

      if (wasEditing) {
        tasks[existingIndex] = savedTask;
      } else {
        tasks.push(savedTask);
      }

      closeTaskModal();
      renderAll();
      showToast(wasEditing ? `已更新「${savedTask.title}」` : `已创建「${savedTask.title}」`);
    } catch (error) {
      showToast(error.message || '保存失败，请稍后重试');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDeleteTask() {
    if (!state.editingId || isSaving) return;
    const task = findTask(state.editingId);
    if (!task) return;

    const confirmed = window.confirm(`确定删除「${task.title}」吗？此操作无法撤销。`);
    if (!confirmed) return;

    setFormSaving(true);
    try {
      await deleteTaskOnServer(task.id);
      tasks = tasks.filter((item) => item.id !== task.id);
      closeTaskModal();
      renderAll();
      showToast(`已删除「${task.title}」`);
    } catch (error) {
      showToast(error.message || '删除失败，请稍后重试');
    } finally {
      setFormSaving(false);
    }
  }

  function setFormSaving(saving) {
    isSaving = saving;
    const submitButton = els.taskForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = saving;
      submitButton.textContent = saving ? '保存中…' : '保存事项';
    }
    els.deleteTaskBtn.disabled = saving;
  }

  function selectDraftColor() {
    Array.from(els.colorOptions.querySelectorAll('[data-color]')).forEach((swatch) => {
      const selected = swatch.dataset.color === state.draftColor;
      swatch.classList.toggle('is-selected', selected);
      swatch.setAttribute('aria-checked', String(selected));
    });
    els.previewDot.style.background = COLORS[state.draftColor].color;
  }

  function updateQuickIntervalState() {
    const value = String(Number(els.taskInterval.value));
    Array.from(els.quickIntervals.querySelectorAll('[data-interval]')).forEach((button) => {
      button.classList.toggle('is-active', button.dataset.interval === value);
    });
  }

  function updateRhythmPreview() {
    const interval = Number(els.taskInterval.value);
    const safeInterval = Number.isInteger(interval) && interval > 0 ? interval : 1;
    const startDate = isISODate(els.taskStartDate.value)
      ? parseISO(els.taskStartDate.value)
      : null;

    if (state.draftOneOff) {
      els.rhythmPreview.textContent = startDate
        ? `仅在 ${formatFullDate(startDate)} 出现一次，不重复`
        : '选择一个日期，添加只在当天出现的事项';
      return;
    }

    const startCopy = startDate ? `从 ${formatFullDate(startDate)} 起` : '从所选日期起';

    if (state.draftType === 'window') {
      const modeCopy = state.draftWindowMode === 'continuous'
        ? '连续进行，区间会跨天展示'
        : '可在区间内任意一天完成';
      els.rhythmPreview.textContent = `${startCopy}，每 ${safeInterval} 天为一个完成区间；${modeCopy}`;
      return;
    }

    const rhythmCopy = safeInterval === 1 ? '每天出现一次' : `每 ${safeInterval} 天出现一次`;
    els.rhythmPreview.textContent = `${startCopy}，${rhythmCopy}`;
  }

  function updateTaskTypeUI() {
    const oneOff = state.draftOneOff;
    Array.from(els.taskTypeSwitch.querySelectorAll('[data-task-type]')).forEach((option) => {
      const selected = option.dataset.taskType === state.draftType;
      option.classList.toggle('is-active', selected);
      option.setAttribute('aria-checked', String(selected));
    });
    els.taskTypeField.hidden = oneOff;
    els.intervalField.hidden = oneOff;
    els.quickIntervals.hidden = oneOff;
    els.startDateLabel.textContent = oneOff ? '日期' : '开始日期';
    els.windowModeField.hidden = oneOff || state.draftType !== 'window';
    els.intervalLabel.textContent = state.draftType === 'window' ? '完成区间长度' : '重复间隔';
    els.taskForm.classList.toggle('is-one-off', oneOff);
    updateRhythmPreview();
  }

  function updateWindowModeUI() {
    Array.from(els.windowModeOptions.querySelectorAll('[data-window-mode]')).forEach((option) => {
      const selected = option.dataset.windowMode === state.draftWindowMode;
      option.classList.toggle('is-active', selected);
      option.setAttribute('aria-checked', String(selected));
    });
  }

  function clearIntervalError() {
    els.intervalError.hidden = true;
    els.taskInterval.removeAttribute('aria-invalid');
  }

  function pickNextColor() {
    return COLOR_KEYS[tasks.length % COLOR_KEYS.length];
  }

  /* --------------------------------- Toast --------------------------------- */

  function showToast(message) {
    els.toastText.textContent = message;
    els.toast.hidden = false;
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 2800);
  }

  /* --------------------------------- Utils --------------------------------- */

  function findTask(id) {
    return tasks.find((task) => task.id === id) || null;
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function colorVars(colorKey) {
    const color = COLORS[colorKey] || COLORS.moss;
    return `--event-color:${color.color};--event-soft:${color.soft};--event-ink:${color.ink}`;
  }

  function intervalLabel(interval) {
    return interval === 1 ? '每日' : `每 ${interval} 日`;
  }

  function scheduleSummary(task) {
    if (isWindowTask(task)) {
      const mode = task.windowMode === 'continuous' ? '连续进行' : '灵活完成';
      return `每 ${task.interval} 日区间 · ${mode}`;
    }
    if (task.type === 'once') return '单日事项 · 不重复';
    return `${intervalLabel(task.interval)} · 固定间隔`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  function startOfWeek(date) {
    const dayIndex = (date.getDay() + 6) % 7;
    return addDays(startOfDay(date), -dayIndex);
  }

  function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
  }

  function diffDays(startDate, endDate) {
    const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.round((end - start) / 86400000);
  }

  function toISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseISO(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function isISODate(dateStr) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const parsed = parseISO(dateStr);
    return !Number.isNaN(parsed.getTime()) && toISO(parsed) === dateStr;
  }

  function formatShortDate(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatCompactDate(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatFullDate(date) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatWeekTitle(weekStart, weekEnd) {
    if (weekStart.getFullYear() !== weekEnd.getFullYear()) {
      return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 — ${weekEnd.getFullYear()}年${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;
    }
    if (weekStart.getMonth() !== weekEnd.getMonth()) {
      return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 — ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;
    }
    return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 — ${weekEnd.getDate()}日`;
  }

  function getRelativeDayLabel(dateStr) {
    const difference = diffDays(today, parseISO(dateStr));
    if (difference === 0) return '今天';
    if (difference === 1) return '明天';
    if (difference === 2) return '后天';
    if (difference === -1) return '昨天';
    if (difference > 2) return `${difference} 天后`;
    return `${Math.abs(difference)} 天前`;
  }

  function getISOWeekNumber(date) {
    const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNumber = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
    return Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[character]));
  }
})();
