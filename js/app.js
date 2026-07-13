    let currentDate = new Date();
    const data = {};
    let isFlipping = false;
    const STORAGE_PREFIX = "animal-todo:";          // legacy v1, only used for migration
    const STORAGE_PREFIX_V2 = "animal-island-todolist:v2:";  // canonical from Phase 1
    const STORAGE_VERSION_KEY = "animal-island-todolist:v2:migrated";

    // ===== Phase 1: v1 → v2 localStorage migration =====
    // One-shot. Bumps every legacy `animal-todo:YYYY-M-D` key into the v2
    // namespace and backfills new optional todo fields (subject/estMinutes).
    // Runs before any render() so the app sees a single coherent schema.
    function runMigration() {
      try {
        if (localStorage.getItem(STORAGE_VERSION_KEY) === "1") return;
        const oldKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) oldKeys.push(k);
        }
        for (const oldKey of oldKeys) {
          const raw = localStorage.getItem(oldKey);
          if (raw == null) continue;
          const newKey = STORAGE_PREFIX_V2 + oldKey.slice(STORAGE_PREFIX.length);
          // Don't overwrite an existing v2 entry; user data wins over old copy.
          if (localStorage.getItem(newKey) == null) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const upgraded = parsed.map(t => ({
                  ...t,
                  subject: t.subject ?? null,
                  estMinutes: t.estMinutes ?? 0,
                }));
                localStorage.setItem(newKey, JSON.stringify(upgraded));
              } else {
                localStorage.setItem(newKey, raw);
              }
            } catch {
              localStorage.setItem(newKey, raw);
            }
          }
          localStorage.removeItem(oldKey);
        }
        localStorage.setItem(STORAGE_VERSION_KEY, "1");
      } catch (e) {
        // Migration is best-effort. Legacy keys remain for next launch to retry.
      }
    }
    runMigration();

    // ===== Pomodoro state machine =====
    // Phase 1 ships a single classic mode (25min focus). 45/10 deep mode is
    // scheduled for Phase 2 alongside the WebAudio bell.
    //
    // Design notes:
    //  - We never rely on setInterval / setTimeout for "counting". All time
    //    math derives from `endAt - Date.now()`. The tick loop only paints.
    //  - visibilitychange: when the page returns to foreground we recompute
    //    the remaining seconds; if `endAt` has passed we finalize. We do NOT
    //    proactively pause on hide — the wall clock keeps ticking even if
    //    the browser throttles us. The freeze-and-resync semantics is
    //    explicit and documented in plan §"Pomodoro 状态机".
    //  - Sessions are written to localStorage on finish so the heatmap
    //    (Phase 3) can later aggregate by day.
    const POMODORO_MODES = {
      classic: { focusMs: 25 * 60 * 1000, breakMs: 5 * 60 * 1000, label: '经典 25/5' },
    };
    let pomodoroMode = 'classic';
    const pomodoroState = {
      running: false,        // true while a focus/break session is active
      kind: 'idle',          // 'idle' | 'focus' | 'shortBreak'
      startedAt: null,       // ms timestamp when this session started
      endAt: null,           // ms timestamp when this session will end
      durationMs: 0,         // convenience copy of (endAt - startedAt)
      taskId: null,          // optional todo id we're focusing on
      uiTickHandle: null,    // setTimeout handle for the paint loop
    };

    function formatMMSS(ms) {
      const s = Math.max(0, Math.ceil(ms / 1000));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }

    function startPomodoro(taskId) {
      const mode = POMODORO_MODES[pomodoroMode];
      const focusMs = mode.focusMs;
      pomodoroState.running = true;
      pomodoroState.kind = 'focus';
      pomodoroState.startedAt = Date.now();
      pomodoroState.endAt = pomodoroState.startedAt + focusMs;
      pomodoroState.durationMs = focusMs;
      pomodoroState.taskId = taskId ?? null;
      enterFocusMode();
      scheduleTick();
    }

    function pausePomodoro() {
      pomodoroState.running = false;
      if (pomodoroState.uiTickHandle != null) {
        clearTimeout(pomodoroState.uiTickHandle);
        pomodoroState.uiTickHandle = null;
      }
    }

    function resetPomodoro() {
      pausePomodoro();
      pomodoroState.kind = 'idle';
      pomodoroState.startedAt = null;
      pomodoroState.endAt = null;
      pomodoroState.durationMs = 0;
      pomodoroState.taskId = null;
      exitFocusMode();
      paintPomodoro();
    }

    function finishPomodoro() {
      // Called either when the tick loop sees endAt <= now, or when
      // visibilitychange detects the page returned after the deadline.
      const wasFocus = pomodoroState.kind === 'focus';
      const session = {
        kind: wasFocus ? 'focus' : 'shortBreak',
        startedAt: pomodoroState.startedAt,
        finishedAt: Date.now(),
        completed: true,
      };
      persistPomodoroSession(session);
      if (wasFocus) {
        // Auto-transition to short break.
        const mode = POMODORO_MODES[pomodoroMode];
        pomodoroState.kind = 'shortBreak';
        pomodoroState.startedAt = Date.now();
        pomodoroState.endAt = pomodoroState.startedAt + mode.breakMs;
        pomodoroState.durationMs = mode.breakMs;
        pomodoroState.running = true;
        paintPomodoro();
        scheduleTick();
      } else {
        // Break ended — return to idle.
        resetPomodoro();
      }
    }

    function tickPomodoro() {
      if (!pomodoroState.running) return;
      const remaining = pomodoroState.endAt - Date.now();
      if (remaining <= 0) {
        finishPomodoro();
        return;
      }
      paintPomodoro();
      scheduleTick();
    }

    function scheduleTick() {
      // Use a 250ms cadence so we paint smoothly without burning cycles.
      // Timing source-of-truth remains (endAt - Date.now()), so cadence
      // changes are purely cosmetic.
      if (pomodoroState.uiTickHandle != null) clearTimeout(pomodoroState.uiTickHandle);
      pomodoroState.uiTickHandle = setTimeout(tickPomodoro, 250);
    }

    function paintPomodoro() {
      const ring = document.querySelector('.pomodoro-ring circle.fg');
      const time = document.getElementById('pomodoroTime');
      const subject = document.getElementById('pomodoroSubject');
      if (!ring || !time) return;
      const total = pomodoroState.durationMs || 1;
      const remaining = pomodoroState.running ? Math.max(0, pomodoroState.endAt - Date.now()) : total;
      const ratio = Math.max(0, Math.min(1, remaining / total));
      // circumference = 2πr where r=54 in our SVG. Use the actual value to
      // avoid drift if the visual ring size changes.
      const C = 2 * Math.PI * 54;
      ring.setAttribute('stroke-dasharray', String(C));
      ring.setAttribute('stroke-dashoffset', String(C * (1 - ratio)));
      time.textContent = formatMMSS(remaining);
      if (subject) {
        let title;
        if (pomodoroState.kind === 'shortBreak') {
          title = '☕ 短休息';
        } else if (pomodoroState.taskId) {
          title = getTodos().find(t => t.id === pomodoroState.taskId)?.title || '专注中';
        } else if (pomodoroState.kind === 'focus') {
          title = '自由专注';
        } else {
          title = '准备开始';
        }
        subject.textContent = title;
      }
      // Update entry button to reflect "running" state.
      const entry = document.getElementById('pomodoroEntry');
      if (entry) {
        if (pomodoroState.running) entry.classList.add('running');
        else entry.classList.remove('running');
      }
    }

    function persistPomodoroSession(session) {
      try {
        const key = STORAGE_PREFIX_V2 + 'pomodoros:' + dateKey(currentDate);
        const raw = localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        list.push(session);
        localStorage.setItem(key, JSON.stringify(list));
      } catch (e) {}
    }

    function enterFocusMode() {
      const sheet = document.getElementById('paperSheet');
      const panel = document.getElementById('pomodoroPanel');
      if (sheet) sheet.classList.add('is-focus-mode');
      document.body.classList.add('is-focus-mode');
      if (panel) panel.hidden = false;
      paintPomodoro();
    }

    function exitFocusMode() {
      const sheet = document.getElementById('paperSheet');
      const panel = document.getElementById('pomodoroPanel');
      if (sheet) sheet.classList.remove('is-focus-mode');
      document.body.classList.remove('is-focus-mode');
      if (panel) panel.hidden = true;
    }

    function togglePomodoro() {
      if (!pomodoroState.running && pomodoroState.kind === 'idle') {
        startPomodoro(null);
      } else if (pomodoroState.running) {
        pausePomodoro();
      } else {
        // Was paused mid-session — resume with same endAt.
        pomodoroState.running = true;
        scheduleTick();
        paintPomodoro();
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!pomodoroState.running) return;
      if (pomodoroState.endAt != null && Date.now() >= pomodoroState.endAt) {
        finishPomodoro();
      } else {
        paintPomodoro();
      }
    });

    // 生成日期 key，格式 2026-7-2
    function dateKey(d) {
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    // 格式化日期显示文本
    function formatDate(d) {
      const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
      return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
    }

    // 判断两个日期是否同一天
    function isSameDay(a, b) {
      return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
    }

    // ===== Task 2: localStorage 持久化 (v2 namespace) =====
    function save() {
      try {
        const key = dateKey(currentDate);
        const todos = data[key] || [];
        localStorage.setItem(STORAGE_PREFIX_V2 + key, JSON.stringify(todos));
      } catch (e) {
        // localStorage 可能不可用或已满，静默失败
      }
    }

    // 从 localStorage 读取指定 dateKey 的 todos (v2 namespace)
    function load(dateKeyStr) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX_V2 + dateKeyStr);
        if (raw !== null) return JSON.parse(raw);
      } catch (e) {}
      return null;
    }

    // 获取当前日期的 todos：先 load，没有时仅今天注入示例，非今天返回空
    function getTodos() {
      const key = dateKey(currentDate);
      if (!data[key]) {
        const loaded = load(key);
        if (loaded) {
          data[key] = loaded;
        } else if (isSameDay(currentDate, new Date())) {
          // 仅今天注入默认示例数据
          data[key] = [
            { id: Date.now() + 1, title: "去博物馆看化石展", note: "记得带上小铲子，说不定能挖到新的化石碎片。\n拍照留念一下~", done: false, expanded: true, subject: null, estMinutes: 0 },
            { id: Date.now() + 2, title: "给花园浇水", note: "黑色三色堇今天应该开了，检查一下杂交进度。", done: true, expanded: false, subject: null, estMinutes: 0 },
            { id: Date.now() + 3, title: "拜访小动物的岛", note: "带点水果当礼物，看看有没有新的 DIY 图纸。", done: false, expanded: false, subject: null, estMinutes: 0 }
          ];
        } else {
          data[key] = [];
        }
      }
      return data[key];
    }

    // 转义 HTML 特殊字符，防止注入
    function escapeHtml(text) {
      return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ===== Task 1: 重构渲染机制 =====
    // render() 仅在新增/删除/翻页时调用，输入/展开/勾选不调用
    function render() {
      document.getElementById("dateText").textContent = formatDate(currentDate);
      document.getElementById("dateBadge").textContent = currentDate.getDate();
      const list = document.getElementById("todoList");
      const todos = getTodos();
      list.innerHTML = "";

      // Task 5: 空状态视图
      if (todos.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <span class="empty-emoji">🗒️</span>
            <p class="empty-text">今天还没有待办，加一条吧～</p>
            <button class="empty-add-btn" onclick="addTodo()">＋ 新增待办</button>
          </div>
        `;
        updateProgress();
        updateBackTodayBtn();
        paintPomodoro();
        return;
      }

      todos.forEach((todo) => {
        const card = document.createElement("div");
        card.className = `todo-card ${todo.done ? "completed" : ""} ${todo.expanded ? "expanded" : ""}`;
        card.dataset.id = todo.id;
        card.innerHTML = `
          <div class="stamp">已完成</div>
          <div class="todo-main" onclick="toggleExpand(${todo.id})">
            <div class="checkbox" onclick="event.stopPropagation(); toggleDone(${todo.id})">
              <svg viewBox="0 0 24 24"><polyline points="5 12 10 17 19 6"></polyline></svg>
            </div>
            <input type="text" class="todo-title" value="${escapeHtml(todo.title)}" placeholder="写个大标题…" oninput="updateTitle(${todo.id}, this.value)" onclick="event.stopPropagation()">
            <button class="pomo-mini-btn" onclick="event.stopPropagation(); startPomodoro(${todo.id})" aria-label="开始 25 分钟专注" title="开始 25 分钟专注">🍅</button>
            <span class="expand-hint">展开笔记</span>
            <button class="delete-icon" onclick="event.stopPropagation(); confirmDelete(${todo.id})" aria-label="删除" title="删除">×</button>
          </div>
          <div class="todo-note">
            <textarea placeholder="在这里写更多内容，就像一张纸上的小笔记…" oninput="updateNote(${todo.id}, this.value)">${escapeHtml(todo.note)}</textarea>
          </div>
        `;
        list.appendChild(card);
      });

      updateProgress();
      updateBackTodayBtn();
      paintPomodoro();
    }

    // 进度条更新：独立函数，不依赖 render()
    function updateProgress() {
      const todos = getTodos();
      const completed = todos.filter(t => t.done).length;
      const total = todos.length;
      const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
      document.getElementById("progressText").textContent = `今日完成 ${completed} / ${total}`;
      document.getElementById("progressPercent").textContent = `${percent}%`;
      document.getElementById("progressFill").style.width = `${percent}%`;
    }

    // ===== Task 4: 回到今天按钮显隐 =====
    function updateBackTodayBtn() {
      const btn = document.getElementById("backTodayBtn");
      if (!btn) return;
      btn.style.display = isSameDay(currentDate, new Date()) ? "none" : "inline-block";
    }

    // 新增待办（需要重建列表）
    function addTodo() {
      const todos = getTodos();
      todos.push({
        id: Date.now(),
        title: "",
        note: "",
        done: false,
        expanded: true,
        subject: null,
        estMinutes: 0,
      });
      save();
      render();
      // 聚焦新卡片的标题输入框
      const inputs = document.querySelectorAll(".todo-title");
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }

    // 展开收起：只切换 class，不调用 render()
    function toggleExpand(id) {
      const todo = getTodos().find(t => t.id === id);
      if (!todo) return;
      todo.expanded = !todo.expanded;
      const card = document.querySelector(`.todo-card[data-id="${id}"]`);
      if (card) card.classList.toggle("expanded", todo.expanded);
    }

    // 勾选完成：只切 class + 更新进度 + 保存，不调用 render()
    function toggleDone(id) {
      const todo = getTodos().find(t => t.id === id);
      if (!todo) return;
      todo.done = !todo.done;
      const card = document.querySelector(`.todo-card[data-id="${id}"]`);
      if (card) card.classList.toggle("completed", todo.done);
      updateProgress();
      save();
    }

    // 更新标题：只更新数据 + 保存，不调用 render()
    function updateTitle(id, value) {
      const todo = getTodos().find(t => t.id === id);
      if (todo) {
        todo.title = value;
        save();
      }
    }

    // 更新笔记：只更新数据 + 保存，不调用 render()
    function updateNote(id, value) {
      const todo = getTodos().find(t => t.id === id);
      if (todo) {
        todo.note = value;
        save();
      }
    }

    // ===== Task 3: 内联删除确认 =====
    // 显示内联删除确认条
    function confirmDelete(id) {
      const card = document.querySelector(`.todo-card[data-id="${id}"]`);
      if (!card) return;
      if (card.querySelector(".delete-confirm")) return; // 已存在则跳过
      const bar = document.createElement("div");
      bar.className = "delete-confirm";
      bar.innerHTML = `
        <span>确认删除这条待办？</span>
        <button class="confirm-yes" onclick="event.stopPropagation(); deleteTodo(${id})">确认</button>
        <button class="confirm-no" onclick="event.stopPropagation(); cancelDelete(${id})">取消</button>
      `;
      card.appendChild(bar);
    }

    // 取消删除：移除确认条
    function cancelDelete(id) {
      const card = document.querySelector(`.todo-card[data-id="${id}"]`);
      if (card) {
        const bar = card.querySelector(".delete-confirm");
        if (bar) bar.remove();
      }
    }

    // 确认删除：从数据和 DOM 移除
    function deleteTodo(id) {
      const todos = getTodos();
      const idx = todos.findIndex(t => t.id === id);
      if (idx === -1) return;
      todos.splice(idx, 1);
      const card = document.querySelector(`.todo-card[data-id="${id}"]`);
      if (card) card.remove();
      save();
      updateProgress();
      // 删完后若列表为空，渲染空状态
      if (todos.length === 0) {
        render();
      }
    }

    // ===== Task 4: 回到今天 =====
    function backToToday() {
      if (isFlipping) return;
      const today = new Date();
      // 以零点为准计算天数差
      const a = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
      const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const delta = Math.round((b - a) / 86400000);
      if (delta !== 0) {
        changeDay(delta);
      }
    }

    // ===== Task 7: 撕页动画 =====
    // 翻页：动画播放到一半时切换数据，避免闪烁
    function changeDay(delta) {
      if (isFlipping) return;
      isFlipping = true;
      const sheet = document.getElementById("paperSheet");
      const direction = delta > 0 ? "flip-next" : "flip-prev";
      sheet.classList.add(direction);

      // 动画播放到一半时切换数据，此时纸张不可见，避免闪烁
      setTimeout(() => {
        currentDate.setDate(currentDate.getDate() + delta);
        render();
      }, 350);

      // 动画结束后清理状态并更新回到今天按钮
      setTimeout(() => {
        sheet.classList.remove(direction);
        isFlipping = false;
        updateBackTodayBtn();
      }, 710);
    }

    // 触摸滑动翻页
    let touchStartX = 0;
    let touchStartY = 0;
    const swipeThreshold = 50;

    document.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener("touchend", (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
        changeDay(deltaX < 0 ? 1 : -1);
      }
    }, { passive: true });

    // 鼠标拖拽翻页（只在纸张区域，且不在输入框/按钮内触发）
    let mouseStartX = 0;
    let isMouseDown = false;
    const paperSheet = document.getElementById("paperSheet");

    paperSheet.addEventListener("mousedown", (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (["input", "textarea", "button"].includes(tag)) return;
      isMouseDown = true;
      mouseStartX = e.clientX;
    });

    paperSheet.addEventListener("mouseup", (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      const deltaX = e.clientX - mouseStartX;
      if (Math.abs(deltaX) > swipeThreshold) {
        changeDay(deltaX < 0 ? 1 : -1);
      }
    });

    // 初始渲染
    render();
