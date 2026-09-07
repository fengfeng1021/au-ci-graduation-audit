/* =====================================================================
   畢業審查工具 · 邏輯與動效
   ---------------------------------------------------------------------
   設計原則（呼應 impeccable Operate 模式）：
   - 回饋要快；只保留一個「作者級」主場景 = 畢業結論的達標時刻。
   - 每個「物件型別」的動效寫成一個可重用函式（meter / number /
     check / accordion / celebrate），全站以 class 統一套用，不逐一調。
   - 動效遵循 GSAP 官方規範：matchMedia 管 prefers-reduced-motion、
     defaults 統一節奏、quickTo 處理高頻更新、timeline 編排多步、
     只動 transform 不動 width。
   - 內容預設可見；就算 GSAP 載入失敗，資料與計算仍可運作。

   本檔不含任何個人資料；勾選狀態只寫入本機 localStorage。
   ===================================================================== */
(function () {
  'use strict';

  /* =====================================================================
     全域錯誤可視化：任何本機例外直接紅字浮現 + 狀態列同步
     ===================================================================== */
  function reportErrorToUI(msg) {
    try {
      if (typeof window.__showFatal === 'function') window.__showFatal(msg);
      else {
        var bar = document.getElementById('fatal-error-bar');
        if (bar) {
          bar.classList.add('is-show');
          bar.textContent = '⚠ 網頁發生錯誤：' + msg;
        }
      }
    } catch (_) {}
    try {
      if (typeof showUploadStatus === 'function') {
        showUploadStatus('發生錯誤', String(msg), 'error');
      }
    } catch (_) {}
  }
  window.addEventListener('error', function (e) {
    if (!e) return;
    if (e.target && e.target !== window && (e.target.tagName === 'LINK' || e.target.tagName === 'IMG')) return;
    reportErrorToUI((e.message || '未知錯誤') + (e.filename ? ' @ ' + String(e.filename).split('/').pop() + ':' + (e.lineno || '?') : ''));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    reportErrorToUI(r ? (r.message || String(r)) : '非同步錯誤');
  });

  /* =====================================================================
     課綱：內建 + 使用者匯入，可切換
     ===================================================================== */
  const REG_KEY = 'au-audit-curricula-v1';   // 使用者匯入的課綱
  const SEL_KEY = 'au-audit-selected-v1';    // 目前選用的課綱 id

  function readJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  const userCurriculaRaw = readJSON(REG_KEY, {});
  const userCurricula = (userCurriculaRaw && typeof userCurriculaRaw === 'object' && !Array.isArray(userCurriculaRaw)) ? userCurriculaRaw : {};
  const registry = Object.assign({}, window.CURRICULA || {}, userCurricula);

  function pickCurriculum() {
    let want = null;
    try { want = localStorage.getItem(SEL_KEY); } catch (_) { want = null; }
    if (want && registry[want]) return registry[want];
    return window.CURRICULUM || registry[Object.keys(registry)[0]];
  }

  const C = pickCurriculum();
  if (!C) {
    // 沒有課綱也要讓頁面有紅字說明，而不是靜靜壞掉
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => reportErrorToUI('找不到可用課綱資料（curriculum.js 可能載入失敗）'));
    } else {
      reportErrorToUI('找不到可用課綱資料（curriculum.js 可能載入失敗）');
    }
    return; // 沒有任何課綱可用
  }

  /* 舊格式（collegeCore / deptCore / major / general / free）自動轉成 groups */
  function toGroups(cur) {
    if (Array.isArray(cur.groups)) return cur.groups;
    const legacy = [cur.collegeCore, cur.deptCore, cur.major, cur.general, cur.free].filter(Boolean);
    return legacy.map((g) => {
      if (g.kind === 'choice' && g.options && !Array.isArray(g.options)) {
        return Object.assign({}, g, {
          options: Object.keys(g.options).map((k) => Object.assign({ id: k }, g.options[k])),
          offsetNote: (g.offset && g.offset.note) || '',
        });
      }
      return g;
    });
  }

  const GROUPS = toGroups(C);
  const THRESHOLDS = C.thresholds || [];
  const TOTAL = (C.meta && C.meta.totalRequired) || GROUPS.reduce((s, g) => s + (g.required || 0), 0);
  const CUR_ID = (C.meta && C.meta.id) || 'default';
  // 舊版使用者的資料存在 au-ci-audit-v1，沿用以免紀錄消失
  const STORE_KEY = CUR_ID === 'au-ci-112' ? 'au-ci-audit-v1' : 'au-audit-state::' + CUR_ID;

  const hasGSAP = typeof window.gsap !== 'undefined';

  /* 動效開關由 gsap.matchMedia() 管理（官方建議的 prefers-reduced-motion 作法）：
     條件不再吻合時，該次建立的動畫會自動還原，不必手動拆。 */
  let motionOn = false;
  let mm = null;
  const prefersReduced = () =>
    !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- 小工具 ---------- */
  const clamp = (min, max, v) => Math.max(min, Math.min(max, v));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function')
          n.addEventListener(k.slice(2).toLowerCase(), v);
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    kids.flat().forEach((kid) => {
      if (kid == null || kid === false) return;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
    return n;
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  function icon(id, cls) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', cls || 'icon');
    const u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#' + id);
    s.append(u);
    return s;
  }

  /* 課程唯一鍵：清單 id + 名稱（代碼可能為空，故不用代碼當鍵） */
  const ckey = (listId, course) => listId + '::' + course.name;
  const optListId = (g, opt) => g.id + '-' + opt.id;
  const selectedOption = (g) =>
    g.options.find((o) => o.id === state.choice[g.id]) || g.options[0];

  /* =====================================================================
     狀態（存 localStorage；只在本機）
     ===================================================================== */
  const state = migrate(readJSON(STORE_KEY, null));

  function isObj(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  function migrate(saved) {
    const base = { checked: {}, choice: {}, offset: {}, credits: {}, thresholds: {}, offsetCount: 2, passedCourses: [], student: null };
    const s = Object.assign(base, saved || {});
    // 舊版或損毀的本機資料可能把物件欄位存成 boolean / 字串 / 數字；
    // `x || {}` 擋不住 truthy 的 primitive，strict mode 下寫屬性會直接爆炸
    //（Cannot create property 'major' on boolean 'true' 導致整頁白屏），故嚴格檢查。
    // 注意：舊欄位搬移一律讀原始 saved，不受下方清理影響。
    if (!isObj(s.checked)) s.checked = {};
    if (!isObj(s.thresholds)) s.thresholds = {};
    if (!isObj(s.choice)) s.choice = {};
    if (!isObj(s.offset)) s.offset = {};
    if (!isObj(s.credits)) s.credits = {};
    if (!isObj(s.reassign)) s.reassign = {}; // 課程手動改列：passedCourseKey -> groupId
    if (typeof s.offsetCount !== 'number' || !(s.offsetCount >= 0)) s.offsetCount = 2;
    s.passedCourses = Array.isArray(s.passedCourses) ? s.passedCourses : [];
    if (s.student != null && !isObj(s.student)) s.student = null;
    else if (s.student == null) s.student = null;

    // 跨課綱共享學生身分與已修課程
    const shared = readJSON('au-audit-shared-student-v1', null);
    if (shared && shared.student) {
      if (!s.student) s.student = shared.student;
      if ((!s.passedCourses || !s.passedCourses.length) && Array.isArray(shared.passedCourses)) {
        s.passedCourses = shared.passedCourses;
      }
    }

    if (saved) {
      // 舊版單一 major / offset / general / free 的資料搬過來
      if (typeof saved.major === 'string') s.choice.major = saved.major;
      if (typeof saved.offset === 'boolean') s.offset.major = saved.offset;
      if (typeof saved.general === 'number') s.credits.general = saved.general;
      if (typeof saved.free === 'number') s.credits.free = saved.free;
    }
    seedDefaults(s);
    return s;
  }
  function seedDefaults(s) {
    GROUPS.forEach((g) => {
      if (g.kind === 'choice') {
        if (!s.choice[g.id]) s.choice[g.id] = g.options[0].id;
        if (typeof s.offset[g.id] !== 'boolean') s.offset[g.id] = true;
      } else if (g.kind === 'credits') {
        if (typeof s.credits[g.id] !== 'number') s.credits[g.id] = 0;
      }
    });
  }

  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { writeJSON(STORE_KEY, state); }, 120);
  }

  /* =====================================================================
     可重用動效函式（每個物件型別一個）
     ===================================================================== */
  const motionNodes = [];   // 用過 quickTo 快取的節點；切換動效模式時清掉重建

  /* 進度條：以 scaleX 取代 width，避免每次更新觸發 layout（GSAP 效能規範） */
  function meterSetter(fill) {
    if (!fill._qx) {
      fill._qx = gsap.quickTo(fill, 'scaleX', { duration: 0.7, ease: 'power3.out' });
      motionNodes.push(fill);
    }
    return fill._qx;
  }
  function animMeter(fill, pct) {
    if (!fill) return;
    const v = clamp(0, 100, pct) / 100;
    if (!motionOn) {
      if (hasGSAP) gsap.set(fill, { scaleX: v });
      else fill.style.transform = 'scaleX(' + v + ')';
      return;
    }
    meterSetter(fill)(v);
  }

  /* 學分讀數：高頻更新（每次勾選都變），用 quickTo 重用單一 tween */
  function numSetter(node) {
    if (!node._qn) {
      const proxy = { v: parseFloat(node.dataset.val || '0') };
      node._qnProxy = proxy;
      node._qn = gsap.quickTo(proxy, 'v', {
        duration: 0.6, ease: 'power2.out',
        onUpdate: () => { node.textContent = String(Math.round(proxy.v)); },
      });
      motionNodes.push(node);
    }
    return node._qn;
  }
  function animNumber(node, to) {
    if (!node) return;
    node.dataset.val = String(to);
    if (!motionOn) {
      node.textContent = String(to);
      if (node._qnProxy) node._qnProxy.v = to; // 保持同步，恢復動效時不會從舊值跑
      return;
    }
    numSetter(node)(to);
  }

  function animCheck(box, on) {
    if (!motionOn || !on || !box) return;
    const path = box.querySelector('path');
    const tl = gsap.timeline();
    if (path && path.getTotalLength) {
      const len = path.getTotalLength();
      tl.fromTo(path, { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 0.35 }, 0);
    }
    tl.fromTo(box, { scale: 0.82 }, { scale: 1, duration: 0.3, ease: 'back.out(2.2)' }, 0);
    return tl;
  }

  /* 折疊：height 無法用 transform 取代，動畫期間才掛 will-change，結束即卸下 */
  function animAccordion(card, open) {
    const body = $('.card__body, .import__body', card);
    if (!body) return;
    if (!motionOn) { body.style.height = open ? 'auto' : '0px'; return; }
    if (open) {
      gsap.set(body, { height: 'auto' });
      const h = body.offsetHeight;
      gsap.fromTo(body, { height: 0, willChange: 'height' }, {
        height: h, duration: 0.4, ease: 'power3.out',
        onComplete: () => { body.style.height = 'auto'; body.style.willChange = ''; },
      });
    } else {
      gsap.to(body, {
        height: 0, duration: 0.32, ease: 'power3.inOut', willChange: 'height',
        onComplete: () => { body.style.willChange = ''; },
      });
    }
  }

  /* 作者級主場景：達標的那一刻只演一次，用 timeline 編排而非疊 delay */
  let wasGo = false;
  function celebrate(stateEl) {
    if (!motionOn || !stateEl) return;
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.addLabel('pop', 0)
      .fromTo(stateEl, { scale: 0.9 }, { scale: 1, duration: 0.55, ease: 'back.out(1.7)' }, 'pop');
    const p = stateEl.querySelector('path');
    if (p && p.getTotalLength) {
      const l = p.getTotalLength();
      tl.fromTo(p, { strokeDasharray: l, strokeDashoffset: l },
        { strokeDashoffset: 0, duration: 0.5 }, 'pop+=0.06');
    }
    return tl;
  }

  function entrance() {
    return gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from('.verdict', { y: 16, autoAlpha: 0, duration: 0.6 })
      .from('#sections .section', {
        y: 14, autoAlpha: 0, duration: 0.5,
        stagger: { each: 0.06, from: 'start' },
      }, '<0.08');
  }

  /* 動效模式：由 gsap.matchMedia() 依 prefers-reduced-motion 建立與還原 */
  let inited = false;
  function setupMotion() {
    if (!hasGSAP) { motionOn = false; return; }
    gsap.defaults({ duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
    mm = gsap.matchMedia();
    mm.add({
      full: '(prefers-reduced-motion: no-preference)',
      reduced: '(prefers-reduced-motion: reduce)',
    }, (ctx) => {
      motionOn = !!ctx.conditions.full;
      if (motionOn) entrance();          // 在 matchMedia 內建立 → 條件改變時自動還原
      else if (inited) update();         // 中途改成減少動態：直接畫上最終狀態
      return () => {
        motionNodes.forEach((n) => { delete n._qx; delete n._qn; delete n._qnProxy; });
        motionNodes.length = 0;
      };
    });
  }

  /* =====================================================================
     元件建構（每型別一次；重複使用）
     ===================================================================== */
  function courseRow(listId, course) {
    const key = ckey(listId, course);
    const checked = !!state.checked[key];
    const input = el('input', { type: 'checkbox', 'aria-label': course.name });
    input.checked = checked;
    const box = el('span', { class: 'check__box' }, icon('i-check'));
    input.addEventListener('change', () => {
      if (input.checked) state.checked[key] = true; else delete state.checked[key];
      row.setAttribute('data-checked', String(input.checked));
      animCheck(box, input.checked);
      save(); update();
    });
    const row = el('label', { class: 'course-row', 'data-checked': String(checked), 'data-key': key },
      el('span', { class: 'check' }, input, box),
      el('div', { class: 'course-row__main' },
        el('div', { class: 'course-row__name' }, course.name),
        course.code ? el('div', { class: 'course-row__code' }, course.code) : null),
      el('div', { class: 'course-row__cr tnum' }, el('b', {}, String(course.cr)), ' 學分'));
    return row;
  }

  function courseList(listId, courses) {
    return el('div', { class: 'course-list' }, courses.map((c) => courseRow(listId, c)));
  }

  /* 一鍵全選 / 清空一個清單（省下逐一點擊，行為與動效與單列一致） */
  function bulkToggle(listId, courses) {
    const setAll = (on) => {
      courses.forEach((c) => {
        const k = ckey(listId, c);
        if (on) state.checked[k] = true; else delete state.checked[k];
      });
      syncChecks(); save(); update();
    };
    return el('div', { class: 'bulk' },
      el('button', { class: 'bulk__btn', type: 'button', onClick: () => setAll(true) },
        icon('i-check'), '全部勾選'),
      el('button', { class: 'bulk__btn bulk__btn--quiet', type: 'button', onClick: () => setAll(false) },
        '清空本區'));
  }

  function checklistBody(listId, courses) {
    return el('div', {}, bulkToggle(listId, courses), courseList(listId, courses));
  }

  function stepper(get, set, min, max, id) {
    const inputAttrs = { type: 'number', min: String(min), max: String(max), value: String(get()) };
    if (id) inputAttrs['data-credit-id'] = id;
    const input = el('input', inputAttrs);
    const commit = () => { set(clamp(min, max, parseInt(input.value, 10) || 0)); };
    const dec = el('button', { type: 'button', 'aria-label': '減少一學分', onClick: () => { input.value = String(clamp(min, max, (parseInt(input.value, 10) || 0) - 1)); commit(); } }, icon('i-minus'));
    const inc = el('button', { type: 'button', 'aria-label': '增加一學分', onClick: () => { input.value = String(clamp(min, max, (parseInt(input.value, 10) || 0) + 1)); commit(); } }, icon('i-plus'));
    input.addEventListener('input', commit);
    return el('div', { class: 'stepper' }, dec, input, inc);
  }

  /* 一張分類卡（可折疊），body 由呼叫者提供 */
  function card(id, title, note, bodyNode) {
    const chevron = icon('i-chevron', 'icon card__chevron');
    const countEl = el('div', { class: 'card__count', 'data-count': id });
    const meterEl = el('div', { class: 'sub-meter__fill', 'data-meter': id });
    const head = el('button', {
      class: 'card__head', type: 'button', 'aria-expanded': 'true', 'aria-controls': id + '-body',
    },
      el('div', { class: 'card__titles' },
        el('div', { class: 'card__title' }, title,
          el('span', { class: 'card__done' }, icon('i-check'), '達標')),
        el('div', { class: 'card__sub' }, note)),
      el('div', { class: 'card__progress' }, countEl,
        el('div', { class: 'sub-meter', 'aria-hidden': 'true' }, meterEl)),
      chevron);

    const body = el('div', { class: 'card__body', id: id + '-body' },
      el('div', { class: 'card__body-inner' }, bodyNode));

    const wrap = el('section', { class: 'section' },
      el('div', { class: 'card', 'data-open': 'true', 'data-cat': id }, head, body));

    head.addEventListener('click', () => {
      const c = $('.card', wrap);
      const open = c.getAttribute('data-open') !== 'true';
      c.setAttribute('data-open', String(open));
      head.setAttribute('aria-expanded', String(open));
      animAccordion(c, open);
    });
    return wrap;
  }

  /* 學程擇一卡：分段控制 + 折抵開關 + 動態清單 */
  function choiceCard(g) {
    const bodyMount = el('div');
    const seg = el('div', { class: 'segmented', role: 'group', 'aria-label': g.title },
      g.options.map((o) => {
        const b = el('button', {
          class: 'segmented__btn', type: 'button',
          'aria-pressed': String(state.choice[g.id] === o.id),
          onClick: () => {
            if (state.choice[g.id] === o.id) return;
            state.choice[g.id] = o.id;
            $$('.segmented__btn', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            renderChoiceBody(g, bodyMount);
            save(); update();
          },
        }, o.label);
        return b;
      }));

    const bodyNode = el('div', {}, el('div', { class: 'major-controls' }, seg), bodyMount);
    const wrap = card(g.id, g.title, g.note, bodyNode);
    renderChoiceBody(g, bodyMount);
    return wrap;
  }

  function renderChoiceBody(g, mount) {
    mount.innerHTML = '';
    const sel = selectedOption(g);
    const others = g.options.filter((o) => o.id !== sel.id);

    // 主修學程本身的課
    mount.append(
      bulkToggle(optListId(g, sel), sel.courses),
      courseList(optListId(g, sel), sel.courses));

    if (!others.length) return;

    // 折抵：其他學程的課可計入主修（方向跟著主修走）
    const sw = el('input', { type: 'checkbox' });
    sw.checked = !!state.offset[g.id];
    sw.addEventListener('change', () => {
      state.offset[g.id] = sw.checked;
      offsetList.hidden = !sw.checked;
      save(); update();
    });
    const maxOffset = state.offsetCount != null ? state.offsetCount : 2;
    const offsetLimitTip = maxOffset > 0 ? `（可抵免上限 ${maxOffset} 門課）` : `（未啟用跨學程抵免）`;
    const label = others.length === 1
      ? '用「' + others[0].label + '」的課折抵主修 ' + offsetLimitTip
      : '用其他學程的課折抵主修 ' + offsetLimitTip;
    const offsetRow = el('label', { class: 'offset-row switch' },
      el('span', { class: 'switch' }, sw,
        el('span', { class: 'switch__track' }, el('span', { class: 'switch__thumb' }))),
      el('span', {},
        el('span', { class: 'switch__label' }, label),
        el('span', { class: 'offset-note' }, g.offsetNote || '折抵認定請以系辦為準。')));

    const offsetList = el('div', {});
    others.forEach((o) => {
      offsetList.append(
        el('div', { class: 'card__note', style: 'border-top:none;padding-bottom:.25rem' },
          '以下是「' + o.label + '」的課程，勾選你修過的即可折抵主修學分：'),
        bulkToggle(optListId(g, o), o.courses),
        courseList(optListId(g, o), o.courses));
    });
    offsetList.hidden = !state.offset[g.id];

    mount.append(el('div', { class: 'card__note' }, offsetRow), offsetList);
  }

  /* 學分數輸入卡：上方是學分輸入（試算依據），下方是成績單逐門明細（全部列出、沒有隱藏） */
  function creditsCard(g) {
    const breakdownMount = el('div', { class: 'credit-breakdown', 'data-breakdown': g.id });
    const body = el('div', {},
      el('div', { class: 'credit-input' },
        el('label', { for: g.id + '-num' }, '已通過學分'),
        stepper(() => state.credits[g.id] || 0,
          (v) => { state.credits[g.id] = v; save(); update(); }, 0, 200, g.id)),
      g.hints
        ? el('div', { class: 'credit-hints' }, '通常包含：',
            el('ul', {}, g.hints.map((h) => el('li', {}, h))))
        : null,
      breakdownMount);
    return card(g.id, g.title, g.note, body);
  }

  /* =====================================================================
     課程手動改列：課綱改版常改課名，對不上的課會被丟進自由選修；
     這裡讓使用者逐門把它搬到正確分類（院核心 / 系核心 / 主修學程 / 通識 / 自由）。
     state.reassign = { passedCourseKey: 目標 groupId }，只有使用者動手才會有值。
     ===================================================================== */
  function passedCourseKey(c) {
    return ((c.code || '').toUpperCase() + '||' + norm(c.name || ''));
  }
  function genedGroupId() {
    const g = GROUPS.find((x) => x.id === 'gened' || /博雅/.test(x.title || ''));
    return g ? g.id : '';
  }
  function generalGroupId() {
    // 注意：「博雅通識」標題也含「通識」二字，必須排除，否則會搶走 gened 的課
    const g = GROUPS.find((x) => x.id === 'general' || /校定/.test(x.title || '') ||
      (/通識/.test(x.title || '') && !/博雅/.test(x.title || '')));
    return g ? g.id : '';
  }
  function freeGroupId() {
    const g = GROUPS.find((x) => x.id === 'free' || /自由/.test(x.title || ''));
    return g ? g.id : '';
  }
  /* 該筆成績「依規則」本來屬於哪個學分桶（改列前的歸屬）。
     有博雅桶的課綱才把博雅分流出去；舊課綱無此桶時走原本規則，行為完全不變。 */
  function autoBucketId(c) {
    const gened = genedGroupId();
    if (gened && isGenedCourseRecord(c)) return gened;
    if (isGeneralCourseRecord(c)) return generalGroupId();
    return freeGroupId();
  }
  /* 未對應必修/學程的及格科目，依「有效歸屬」分桶加總（校定/博雅/自由）。
     回傳 { sums: {gid: 學分}, lists: {gid: [課程]} } */
  function bucketSums(passedList) {
    const idx = allCourses();
    const sums = {}, lists = {};
    (passedList || []).forEach((c) => {
      if (!c || !c.name) return;
      const nline = ((c.code || '') + ' ' + (c.name || '')).toLowerCase();
      if (matchCourse(nline, idx)) return;
      const b = autoBucketId(c);
      if (!b) return;
      sums[b] = (sums[b] || 0) + (c.cr || 0);
      (lists[b] = lists[b] || []).push(c);
    });
    return { sums, lists };
  }
  /* 已知學分桶全量重算寫回（含 0 歸零，語意等同重新匯入） */
  function writeBucketCredits(sums) {
    [genedGroupId(), generalGroupId(), freeGroupId()].forEach((bid) => {
      if (!bid) return;
      const g = GROUPS.find((x) => x.id === bid);
      if (g && g.kind === 'credits') state.credits[g.id] = Math.round(sums[bid] || 0);
    });
  }
  function isCreditsGroupId(gid) {
    const g = GROUPS.find((x) => x.id === gid);
    return !!g && g.kind === 'credits';
  }
  /* 有效的手動目標（目標分類不存在 → 視為自動，避免舊課綱殘留搞亂試算） */
  function reassignTargetOf(c) {
    if (!c || !isObj(state.reassign)) return '';
    const t = state.reassign[passedCourseKey(c)];
    if (!t || typeof t !== 'string') return '';
    if (!GROUPS.some((g) => g.id === t)) return '';
    return t;
  }
  /* 該筆成績「顯示」在哪個學分桶：搬到另一學分桶就顯示在那邊；
     搬到必修/學程則留在原桶（掛 badge），學分從桶子扣除。 */
  function effectiveBucketId(c) {
    const t = reassignTargetOf(c);
    if (t && isCreditsGroupId(t)) return t;
    return autoBucketId(c);
  }
  /* 該筆是否已透過勾選計過分（避免改列與勾選重複計分：勾選優先，改列自動讓位） */
  function isCountedViaChecked(c) {
    if (!c || !c.name) return false;
    for (const k in state.checked) {
      if (!state.checked[k]) continue;
      const nm = k.split('::').slice(1).join('::');
      if (nm && matchName(nm, c.name)) return true;
    }
    return false;
  }
  function groupShortLabel(g) {
    if (!g) return '';
    if (g.kind === 'choice') {
      const sel = selectedOption(g);
      return g.title + '（目前：' + (sel ? sel.label : '') + '）';
    }
    return g.title;
  }
  function groupTitleOf(gid) {
    const g = GROUPS.find((x) => x.id === gid);
    return g ? g.title : '';
  }

  /* 已匯入及格科目中、未對應到任何必修/學程清單者，依「有效歸屬」分桶。
     必修/學程已在各自卡片逐門顯示，這裡只列「藏在學分數字裡」的那些。 */
  function breakdownLists() {
    const idx = allCourses();
    const byBucket = {};
    (state.passedCourses || []).forEach((c) => {
      if (!c || !c.name) return;
      const nline = ((c.code || '') + ' ' + (c.name || '')).toLowerCase();
      if (matchCourse(nline, idx)) return;
      const b = effectiveBucketId(c);
      if (!b) return;
      (byBucket[b] = byBucket[b] || []).push(c);
    });
    return byBucket;
  }

  /* 學分卡屬於哪個明細桶（校定 / 他系 / 自由；未知自訂分類不列明細） */
  function bucketKeyOfGroup(g) {
    if (!g || g.kind !== 'credits') return '';
    const title = g.title || '';
    if (g.id === 'external' || /他系|跨領域/.test(title)) return 'external';
    if (g.id === 'general' || /校定/.test(title) ||
      (/通識/.test(title) && !/博雅/.test(title))) return 'general';
    if (g.id === 'free' || /自由/.test(title)) return 'free';
    return '';
  }

  /* 某一筆成績的「改列到…」選單（原生 select，各分類動態產生） */
  function moveSelectFor(c) {
    const key = passedCourseKey(c);
    const cur = (isObj(state.reassign) && state.reassign[key]) || '';
    const autoGid = autoBucketId(c);
    const sel = el('select', {
      class: 'move-select', title: '將「' + c.name + '」改列到別的分類',
      'aria-label': '將「' + c.name + '」改列到別的分類',
      onChange: (e) => {
        const v = e.target.value;
        if (!isObj(state.reassign)) state.reassign = {};
        if (!v) delete state.reassign[key]; else state.reassign[key] = v;
        save(); update();
      },
    });
    const autoG = GROUPS.find((x) => x.id === autoGid);
    sel.append(el('option', { value: '', selected: !cur }, '自動：' + (autoG ? autoG.title : '依規則')));
    GROUPS.forEach((g) => {
      if (g.id === autoGid) return; // 自動即此類，不重複列
      sel.append(el('option', { value: g.id, selected: cur === g.id }, groupShortLabel(g)));
    });
    return sel;
  }

  /* 重繪所有學分卡的逐門明細（含改列選單；除 select 外無輸入框，每次 update 都可安全重建） */
  function refreshCreditBreakdowns() {
    const mounts = $$('[data-breakdown]');
    if (!mounts.length) return;
    const byBucket = breakdownLists();
    const hasImport = (state.passedCourses || []).length > 0;
    mounts.forEach((mount) => {
      const gid = mount.getAttribute('data-breakdown');
      const g = GROUPS.find((x) => x.id === gid);
      mount.innerHTML = '';
      if (!bucketKeyOfGroup(g)) return;
      const list = byBucket[gid] || [];
      const entered = state.credits[gid] || 0;

      if (!hasImport) {
        mount.append(el('div', { class: 'credit-empty' },
          '尚未匯入成績單。用上方「選擇成績單 Excel」匯入後，這裡會逐門列出每一門課（名稱、學分、成績、學期）；也可以直接在上方手動填入已通過學分。'));
        return;
      }
      if (!list.length) {
        mount.append(el('div', { class: 'credit-empty' },
          '匯入的成績中沒有歸到這一類的課程' + (entered ? '（上方 ' + entered + ' 學分為手動填入或舊資料，請自行核對）' : '') + '。'));
        return;
      }
      // 本類實際採計 = 留在桶內的學分（已改列到必修/學程的不計入此類，改列到別桶的顯示在那邊）
      const counted = list.filter((c) => {
        const t = reassignTargetOf(c);
        return !t || isCreditsGroupId(t);
      });
      const countedSum = Math.round(counted.reduce((t, c) => t + (c.cr || 0), 0));
      mount.append(el('div', { class: 'credit-breakdown__title tnum' },
        '逐門明細（共 ' + list.length + ' 門，本類採計 ' + countedSum + ' 學分）：'));
      const box = el('div', { class: 'credit-breakdown__list' });
      list.forEach((c) => {
        const meta = [c.code || '', (c.cr != null ? c.cr + ' 學分' : ''), c.score || '', c.sem ? (c.sem + ' 學期') : '']
          .filter((x) => x).join(' · ');
        const t = reassignTargetOf(c);
        const auto = autoBucketId(c);
        let badge = null;
        if (t && !isCreditsGroupId(t)) {
          badge = el('span', { class: 'move-badge move-badge--out' }, '已改列【' + groupTitleOf(t) + '】（不計入此類）');
        } else if (t && auto && auto !== gid) {
          badge = el('span', { class: 'move-badge' }, '由【' + groupTitleOf(auto) + '】改列');
        }
        box.append(el('div', { class: 'credit-course' },
          el('div', { class: 'credit-course__main' },
            el('div', { class: 'credit-course__namerow' },
              el('span', { class: 'credit-course__name' }, c.name),
              badge),
            meta ? el('span', { class: 'credit-course__meta tnum' }, meta) : null),
          el('div', { class: 'credit-course__side' }, moveSelectFor(c))));
      });
      mount.append(box);
      if (entered !== countedSum) {
        mount.append(el('div', { class: 'credit-diff tnum' },
          '上方填 ' + entered + ' 學分，本類實際採計 ' + countedSum + ' 學分（差異來自下方的手動改列；試算以實際採計為準）。'));
      }
    });
  }

  /* 必修/學程卡的「手動改列搬入」區：讓被搬進來的課在目標分類也看得見 */
  function renderAssignedBlocks() {
    GROUPS.forEach((g) => {
      if (!g || g.kind === 'credits') return;
      const cardEl = document.querySelector('.card[data-cat="' + g.id + '"]');
      if (!cardEl) return;
      const inner = cardEl.querySelector('.card__body-inner');
      if (!inner) return;
      const inbound = (state.passedCourses || []).filter(
        (c) => c && c.name && reassignTargetOf(c) === g.id && !isCountedViaChecked(c));
      let mount = inner.querySelector('div[data-assigned]');
      if (!inbound.length) {
        if (mount) mount.remove();
        return;
      }
      if (!mount) {
        mount = el('div', { class: 'assigned-in' });
        mount.setAttribute('data-assigned', g.id);
        inner.append(mount);
      }
      mount.innerHTML = '';
      const sum = inbound.reduce((t, c) => t + (c.cr || 0), 0);
      mount.append(el('div', { class: 'assigned-in__title tnum' },
        '手動改列搬入（共 ' + inbound.length + ' 門，' + sum + ' 學分）：'));
      inbound.forEach((c) => {
        const meta = [c.code || '', (c.cr != null ? c.cr + ' 學分' : ''), c.score || '', c.sem ? (c.sem + ' 學期') : '']
          .filter((x) => x).join(' · ');
        mount.append(el('div', { class: 'assigned-course' },
          el('span', { class: 'assigned-course__name' }, c.name),
          meta ? el('span', { class: 'assigned-course__meta tnum' }, meta) : null));
      });
      mount.append(el('div', { class: 'assigned-in__note' }, '實際認定以系辦為準；若該課已在上方勾選，此處自動讓位、不重複計分。'));
    });
  }

  function groupCard(g) {
    if (g.kind === 'choice') return choiceCard(g);
    if (g.kind === 'credits') return creditsCard(g);
    return card(g.id, g.title, g.note, checklistBody(g.id, g.courses || []));
  }

  /* 門檻檢定 */
  function thresholdCard(t) {
    const input = el('input', { type: 'checkbox', 'aria-label': t.label });
    input.checked = !!state.thresholds[t.id];
    const row = el('label', { class: 'threshold', 'data-pass': String(input.checked), 'data-threshold': t.id },
      el('span', { class: 'check' }, input, el('span', { class: 'check__box' }, icon('i-check'))),
      el('span', { class: 'threshold__label' }, t.label,
        t.note ? el('span', { class: 'threshold__note' }, t.note) : null));
    input.addEventListener('change', () => {
      if (input.checked) state.thresholds[t.id] = true; else delete state.thresholds[t.id];
      row.setAttribute('data-pass', String(input.checked));
      animCheck(row.querySelector('.check__box'), input.checked);
      save(); update();
    });
    return row;
  }

  /* =====================================================================
     計算與更新
     ===================================================================== */
  function sumChecked(listId, courses) {
    return (courses || []).reduce((s, c) => s + (state.checked[ckey(listId, c)] ? c.cr : 0), 0);
  }

  function groupCredits(g) {
    if (g.kind === 'credits') {
      // 上方輸入是匯入快照；手動改列會在此加減（搬出扣、搬入加），試算以實際採計為準
      let v = state.credits[g.id] || 0;
      if (bucketKeyOfGroup(g)) {
        (state.passedCourses || []).forEach((c) => {
          if (!c || !c.name) return;
          const auto = autoBucketId(c);
          const t = reassignTargetOf(c);
          if (!t || t === auto) return;
          if (t === g.id && auto !== g.id) v += (c.cr || 0); // 搬入
          else if (auto === g.id) v -= (c.cr || 0);           // 搬出（含搬到必修/學程）
        });
      }
      return Math.max(0, v);
    }
    if (g.kind === 'choice') {
      const sel = selectedOption(g);
      const main = sumChecked(optListId(g, sel), sel.courses);
      let off = 0;
      if (state.offset[g.id] && (state.offsetCount == null || state.offsetCount > 0)) {
        const maxOffset = state.offsetCount != null ? state.offsetCount : 2;
        let count = 0;
        const others = g.options.filter((o) => o.id !== sel.id);
        for (const o of others) {
          for (const c of (o.courses || [])) {
            if (state.checked[ckey(optListId(g, o), c)]) {
              if (count < maxOffset) {
                off += c.cr;
                count++;
              }
            }
          }
        }
      }
      // 手動改列：使用者明確指定的逐門搬入，不吃跨學程抵免上限（勾選優先，不重複計）
      let manual = 0;
      (state.passedCourses || []).forEach((c) => {
        if (reassignTargetOf(c) === g.id && !isCountedViaChecked(c)) manual += (c.cr || 0);
      });
      return main + off + manual;
    }
    let base = sumChecked(g.id, g.courses);
    (state.passedCourses || []).forEach((c) => {
      if (reassignTargetOf(c) === g.id && !isCountedViaChecked(c)) base += (c.cr || 0);
    });
    return base;
  }

  function compute() {
    const cats = {};
    let total = 0, raw = 0, allMet = true;
    GROUPS.forEach((g) => {
      const cur = groupCredits(g);
      cats[g.id] = { cur, req: g.required, title: g.title };
      // 各類最多採計「應修學分」，超修不灌進畢業總分（避免誤判可以畢業）
      total += Math.min(cur, g.required);
      raw += cur;
      if (cur < g.required) allMet = false;
    });
    const thrPass = THRESHOLDS.filter((t) => state.thresholds[t.id]).length;
    const thrAll = thrPass === THRESHOLDS.length;
    return { cats, total, raw, allMet, thrPass, thrAll };
  }

  function setCard(g, cur) {
    const countEl = $('[data-count="' + g.id + '"]');
    const meterEl = $('[data-meter="' + g.id + '"]');
    if (!countEl) return;
    const req = g.required;
    const met = cur >= req;
    countEl.innerHTML = '';
    countEl.append(
      el('span', { class: 'tnum', style: met ? 'color:var(--go-strong)' : '' }, String(cur)),
      el('span', { class: 'tnum' }, ' / ' + req + ' 學分'));
    if (cur > req) {
      countEl.append(el('span', { class: 'over-hint' }, '超修 ' + (cur - req) + '，不計入畢業總分（本類最多採計 ' + req + '）'));
    }
    animMeter(meterEl, (cur / req) * 100);
    const cardEl = countEl.closest('.card');
    if (cardEl) cardEl.setAttribute('data-met', String(met));
  }

  /* 還缺什麼：把未達標分類與未過門檻切成 chip，直接回答「還差什麼」 */
  function renderBreakdown(r, vstate) {
    const bd = $('#verdict-breakdown');
    if (!bd) return;
    bd.innerHTML = '';
    if (vstate === 'go') {
      bd.append(el('span', { class: 'gap-chip gap-chip--done' }, icon('i-check'), '所有分類與門檻都已達標'));
      return;
    }
    // 空狀態：什麼都還沒填時，列出全部缺口只是雜訊，先給明確的下一步
    if (r.total === 0 && r.thrPass === 0) {
      bd.append(el('span', { class: 'gap-chip gap-chip--hint' }, icon('i-info'),
        '先勾選你修過的課，或用上方「貼上成績單自動勾選」一次帶入'));
      return;
    }
    GROUPS.forEach((g) => {
      const c = r.cats[g.id];
      if (c && c.cur < c.req) {
        bd.append(el('span', { class: 'gap-chip' },
          el('span', {}, shortTitle(g.title)),
          el('b', { class: 'tnum' }, '缺 ' + (c.req - c.cur))));
      }
    });
    THRESHOLDS.forEach((t) => {
      if (!state.thresholds[t.id]) {
        bd.append(el('span', { class: 'gap-chip gap-chip--thr' },
          el('span', {}, t.label), el('b', {}, '未過')));
      }
    });
  }
  /* 卡片標題較長，切片上只顯示重點 */
  const shortTitle = (t) => String(t).split(/[·（(]/)[0].trim().replace(/\s+/g, '') || t;

  function update() {
    // 清掉指向已不存在分類的改列殘留（換課綱後），避免幽靈調整
    if (isObj(state.reassign)) {
      let pruned = false;
      Object.keys(state.reassign).forEach((k) => {
        if (!GROUPS.some((g) => g.id === state.reassign[k])) {
          delete state.reassign[k];
          pruned = true;
        }
      });
      if (pruned) save();
    }
    const r = compute();
    GROUPS.forEach((g) => setCard(g, r.cats[g.id].cur));

    // 畢業結論
    const verdict = $('#verdict');
    let vstate, word, iconId;
    if (r.total >= TOTAL && r.allMet && r.thrAll) {
      vstate = 'go'; word = '可以畢業'; iconId = 'i-check';
    } else if (r.total >= TOTAL && r.allMet && !r.thrAll) {
      vstate = 'hold'; word = '學分達標 · 門檻未過'; iconId = 'i-alert';
    } else {
      vstate = 'short'; iconId = 'i-alert';
      word = r.total < TOTAL ? '尚缺 ' + (TOTAL - r.total) + ' 學分' : '必修 / 學程未修滿';
    }
    verdict.setAttribute('data-state', vstate);
    $('#verdict-word').textContent = word;
    const stateIconUse = $('#verdict-state .icon use');
    if (stateIconUse) stateIconUse.setAttribute('href', '#' + iconId);

    // 頂部結論面板學生名牌（讓使用者上傳後一眼確認身分與及格總學分）
    const vStudent = $('#verdict-student');
    if (vStudent) {
      if (state.student && (state.student.name || state.student.id)) {
        vStudent.hidden = false;
        vStudent.innerHTML = '';
        const namePart = state.student.name || '同學';
        const idPart = state.student.id ? ` (${state.student.id})` : '';
        const semPart = state.student.semesters ? ` · 歷年 ${state.student.semesters} 個學期` : '';
        const crPart = state.student.totalCr != null ? ` · 共 ${state.student.totalCr} 及格學分` : '';
        vStudent.append(
          icon('i-cap'),
          el('span', {}, namePart + idPart),
          el('span', { style: 'font-weight:normal;opacity:0.85;margin-left:4px;' }, semPart + crPart)
        );
      } else {
        vStudent.hidden = true;
        vStudent.innerHTML = '';
      }
    }

    animNumber($('#verdict-now'), r.total);
    animMeter($('#verdict-fill'), (r.total / TOTAL) * 100);
    $('#verdict-gap').textContent = String(Math.max(0, TOTAL - r.total));
    $('#verdict-thresholds').textContent = r.thrPass + ' / ' + THRESHOLDS.length;
    renderBreakdown(r, vstate);

    const meterBox = $('#verdict .meter');
    if (meterBox) meterBox.setAttribute('aria-valuenow', String(Math.min(r.total, TOTAL)));

    // 頁首即時小結
    animNumber($('#bar-now'), r.total);
    animMeter($('#bar-fill'), (r.total / TOTAL) * 100);

    // 主場景：第一次達標才慶祝一次
    if (vstate === 'go' && !wasGo) {
      celebrate($('#verdict-state'));
      toast('恭喜，學分與門檻都達標了', 'go');
    }
    wasGo = vstate === 'go';

    renderRoadmap();
    refreshCreditBreakdowns();
    renderAssignedBlocks();
  }

  /* =====================================================================
     Toast
     ===================================================================== */
  function toast(msg, kind) {
    const wrap = $('#toast-wrap');
    const t = el('div', { class: 'toast' + (kind ? ' toast--' + kind : '') },
      icon(kind === 'go' ? 'i-cap' : 'i-info'), msg);
    wrap.append(t);
    if (motionOn) {
      gsap.timeline({ onComplete: () => t.remove() })
        .fromTo(t, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: 'power3.out' })
        .to(t, { y: 8, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=2.2');
    } else {
      setTimeout(() => t.remove(), 2600);
    }
  }

  function showUploadStatus(title, desc, type = 'info') {
    const bar = $('#upload-status-bar');
    if (!bar) return;
    bar.hidden = false;
    bar.className = 'upload-status-bar' + (type === 'go' ? ' is-go' : type === 'error' ? ' is-error' : '');
    const titleEl = $('#upload-status-title');
    const descEl = $('#upload-status-desc');
    const iconEl = $('#upload-status-icon');
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    if (iconEl) {
      iconEl.innerHTML = '';
      iconEl.append(icon(type === 'go' ? 'i-check' : type === 'error' ? 'i-alert' : 'i-upload'));
    }
  }

  /* =====================================================================
     4 年 8 學期建議修課規劃與學程抵免
     ===================================================================== */
  const DEFAULT_BASE_SCHEDULE = [
    {
      semId: '112-1',
      semLabel: '大一上（112-1）',
      courses: [
        { code: 'ES300208', name: '基礎程式設計(一)', cr: 1, cat: 'college' },
        { code: 'ES300209', name: '基礎程式設計(二)', cr: 1, cat: 'college' },
        { code: 'ES300210', name: '基礎程式設計(三)', cr: 1, cat: 'college' },
        { code: '', name: '電腦繪圖', cr: 3, cat: 'dept' },
        { code: 'EP300356', name: '新媒體內容技術與設計', cr: 2, cat: 'dept' },
        { code: '', name: '文學賞析', cr: 2, cat: 'general' },
        { code: '', name: '共通英語文(一)', cr: 3, cat: 'general' },
        { code: '', name: '資訊科技概論', cr: 2, cat: 'general' },
        { code: '', name: '健康與生活', cr: 2, cat: 'general' },
        { code: '', name: '體育(一)', cr: 0, cat: 'general' },
        { code: '', name: '服務學習(一)', cr: 0, cat: 'general' },
      ],
    },
    {
      semId: '112-2',
      semLabel: '大一下（112-2）',
      courses: [
        { code: 'EP300334', name: '平面影像設計', cr: 3, cat: 'dept' },
        { code: '', name: '智慧傳播應用實務', cr: 3, cat: 'dept' },
        { code: '', name: '網頁設計與數位敘事', cr: 3, cat: 'dept' },
        { code: 'EP300336', name: '動態攝影與剪輯', cr: 3, cat: 'dept' },
        { code: '', name: '文學與生活', cr: 2, cat: 'general' },
        { code: '', name: '共通英語文(二)', cr: 3, cat: 'general' },
        { code: '', name: '程式設計與智慧應用', cr: 2, cat: 'general' },
        { code: '', name: '歷史與文化', cr: 2, cat: 'general' },
        { code: '', name: '體育(二)', cr: 0, cat: 'general' },
        { code: '', name: '服務學習(二)', cr: 0, cat: 'general' },
      ],
    },
    {
      semId: '113-1',
      semLabel: '大二上（113-1）',
      courses: [
        { code: 'EP300355', name: '人工智慧與雲端應用', cr: 3, cat: 'college' },
        { code: 'EP300317', name: 'Unity多媒體應用', cr: 3, cat: 'dept' },
        { code: 'EP300358', name: '媒體數據分析', cr: 3, cat: 'dept' },
        { code: '', name: '科技英文', cr: 2, cat: 'general' },
        { code: '', name: '法律與生活', cr: 2, cat: 'general' },
        { code: '', name: '資料蒐集與田野調查', cr: 2, cat: 'free' },
        { code: '', name: '進階採訪實務', cr: 2, cat: 'free' },
        { code: '', name: '體育(三)', cr: 0, cat: 'general' },
      ],
    },
    {
      semId: '113-2',
      semLabel: '大二下（113-2）',
      courses: [
        { code: 'EP300232', name: '網路媒體與社群分析', cr: 3, cat: 'dept' },
        { code: 'EP300320', name: 'AR/VR應用實務', cr: 3, cat: 'dept' },
        { code: 'EP300053', name: '傳播倫理與法規', cr: 3, cat: 'dept' },
        { code: '', name: '設計思考與創新', cr: 2, cat: 'general' },
        { code: '', name: '博雅通識(一)', cr: 2, cat: 'general' },
        { code: '', name: '體育(四)', cr: 0, cat: 'general' },
      ],
    },
    {
      semId: '114-1',
      semLabel: '大三上（114-1）',
      courses: [
        { code: 'EP300359', name: '3D與虛擬攝影棚應用', cr: 3, cat: 'dept' },
        { code: 'EP300054', name: '傳播理論', cr: 3, cat: 'dept' },
        { code: '', name: '博雅通識(二)', cr: 2, cat: 'general' },
        { code: '', name: '廣告企劃實務', cr: 2, cat: 'free' },
      ],
    },
    {
      semId: '114-2',
      semLabel: '大三下（114-2）',
      courses: [
        { code: 'EP300176', name: '畢業專題(一)', cr: 1, cat: 'college' },
        { code: '', name: '博雅通識(三)', cr: 2, cat: 'general' },
        { code: '', name: '新聞播報與轉播技巧', cr: 2, cat: 'free' },
        { code: '', name: '專業實習(一)', cr: 3, cat: 'free' },
      ],
    },
    {
      semId: '115-1',
      semLabel: '大四上（115-1）',
      courses: [
        { code: '', name: '畢業專題(二)', cr: 1, cat: 'college' },
        { code: '', name: '專業實習(二)', cr: 3, cat: 'free' },
        { code: '', name: '他系專長選修', cr: 2, cat: 'external' },
      ],
    },
    {
      semId: '115-2',
      semLabel: '大四下（115-2）',
      courses: [
        { code: '', name: '資訊研討', cr: 1, cat: 'college' },
        { code: '', name: '畢業展演', cr: 1, cat: 'dept' },
        { code: '', name: '他系專長／跨領域（補足學分）', cr: 2, cat: 'external' },
      ],
    },
  ];

  const TRACK_SEMESTER_COURSES = {
    newmedia: {
      '112-2': [
        { code: 'EP300329', name: '傳播敘事與劇本創作', cr: 2, cat: 'major' },
      ],
      '113-1': [
        { code: 'EP300368', name: '紀錄片製作', cr: 3, cat: 'major' },
      ],
      '113-2': [
        { code: 'EP300347', name: '影音製作技術', cr: 3, cat: 'major' },
        { code: 'EP300369', name: '影音傳播資料庫', cr: 3, cat: 'major' },
        { code: '', name: '跨領域自由選修', cr: 3, cat: 'external' },
      ],
      '114-1': [
        { code: 'EP300271', name: '製片實務', cr: 3, cat: 'major' },
        { code: '', name: '影音虛實整合', cr: 3, cat: 'major' },
        { code: 'EP300371', name: '互動裝置媒體應用', cr: 2, cat: 'major' },
        { code: 'EP300372', name: '影音特效實務', cr: 3, cat: 'major' },
        { code: '', name: '專業自由選修', cr: 2, cat: 'external' },
      ],
      '114-2': [
        { code: 'EP300373', name: '劇情短片製作', cr: 3, cat: 'major' },
      ],
      '115-1': [
        { code: '', name: '數位創作與行銷', cr: 2, cat: 'major' },
      ],
      '115-2': [],
    },
    smart: {
      '112-2': [
        { code: '', name: '新聞採訪與寫作', cr: 3, cat: 'major' },
      ],
      '113-1': [
        { code: '', name: '情境感知傳播應用', cr: 3, cat: 'major' },
        { code: 'EP300361', name: '資訊視覺化', cr: 3, cat: 'major' },
      ],
      '113-2': [
        { code: '', name: '智慧媒體分析', cr: 3, cat: 'major' },
        { code: '', name: '新聞攝影與剪輯', cr: 3, cat: 'major' },
        { code: '', name: '媒體傳播資料庫', cr: 3, cat: 'major' },
      ],
      '114-1': [
        { code: '', name: '網路訊息檢索', cr: 3, cat: 'major' },
        { code: '', name: '知識性節目製作', cr: 3, cat: 'major' },
        { code: '', name: '專業自由選修', cr: 2, cat: 'external' },
      ],
      '114-2': [
        { code: '', name: '媒體科技實務選修', cr: 3, cat: 'major' },
      ],
      '115-1': [
        { code: '', name: '網路新聞平台應用實務', cr: 3, cat: 'major' },
      ],
      '115-2': [],
    },
  };

  function matchName(n1, n2) {
    if (!n1 || !n2) return false;
    const a = norm(n1);
    const b = norm(n2);
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) {
      if (Math.min(a.length, b.length) >= 3) return true;
    }
    // 常見課程名變體與簡寫相容
    if (/unity/i.test(a) && /unity/i.test(b)) return true;
    if (/ar\/vr|arvr/i.test(a) && /ar\/vr|arvr/i.test(b)) return true;
    if (/3d.*虛擬/i.test(a) && /3d.*虛擬/i.test(b)) return true;
    if (/影音.*資料庫/i.test(a) && /影音.*資料庫/i.test(b)) return true;
    if (/媒體.*資料庫/i.test(a) && /媒體.*資料庫/i.test(b)) return true;
    if (/情[境感]感知/i.test(a) && /情[境感]感知/i.test(b)) return true;
    if (/智慧媒體/i.test(a) && /智慧媒體/i.test(b)) return true;
    return false;
  }

  function isCourseCompleted(course) {
    const cName = course.name;

    // 1. 檢查 state.checked
    for (const k in state.checked) {
      if (state.checked[k]) {
        const parts = k.split('::');
        const checkedName = parts[1] || parts[0];
        if (matchName(checkedName, cName)) {
          return { completed: true, reason: '已勾選' };
        }
      }
    }

    // 2. 檢查 state.passedCourses
    if (state.passedCourses && state.passedCourses.length) {
      for (const p of state.passedCourses) {
        if (course.code && p.code && course.code.toUpperCase() === p.code.toUpperCase()) {
          return { completed: true, reason: p.score ? ('成績 ' + p.score) : '已修畢' };
        }
        if (matchName(p.name, cName)) {
          return { completed: true, reason: p.score ? ('成績 ' + p.score) : '已修畢' };
        }
      }
    }

    // 3. 通識體育與服務學習門檻
    if (/體育/.test(cName)) {
      if (state.thresholds['pe']) return { completed: true, reason: '門檻已過' };
      if (state.passedCourses && state.passedCourses.some(p => /體育/.test(p.name) && (p.name.includes(cName.slice(-3)) || p.sem))) {
        return { completed: true, reason: '已通過' };
      }
    }
    if (/服務學習/.test(cName)) {
      if (state.thresholds['service']) return { completed: true, reason: '服務學習已過' };
      if (state.passedCourses && state.passedCourses.some(p => /永續發展|服務學習/.test(p.name))) {
        return { completed: true, reason: '已通過' };
      }
    }

    // 4. 博雅通識與自由選修（依已通過學分認定；博雅含在校定 30 內）
    if (/博雅通識/.test(cName)) {
      const genGroup = GROUPS.find(g => g.id === 'general' || /通識|校定/.test(g.title));
      const genCr = (genGroup && groupCredits(genGroup)) || (state.credits && state.credits.general) || 0;
      if (genCr >= 24) return { completed: true, reason: '通識達標' };
    }
    if (/自由選修/.test(cName)) {
      const freeGroup = GROUPS.find(g => g.id === 'free' || /自由/.test(g.title));
      const freeCr = (freeGroup && groupCredits(freeGroup)) || (state.credits && state.credits.free) || 0;
      const freeNeed = (freeGroup && freeGroup.required) || 20;
      if (freeCr >= freeNeed) return { completed: true, reason: '選修達標' };
    }

    return { completed: false, reason: '' };
  }

  function renderRoadmap() {
    const grid = $('#roadmap-grid');
    if (!grid) return;

    // 1. 取得當前主修學程與可選學程清單
    const choiceGroup = GROUPS.find(g => g.kind === 'choice');
    const trackOptions = (choiceGroup && choiceGroup.options) ? choiceGroup.options : [
      { id: 'newmedia', label: '新媒體傳播內容學程' },
      { id: 'smart', label: '智慧傳播應用學程' },
    ];

    let currentTrackId = state.choice['major'];
    if (!currentTrackId || !trackOptions.some(o => o.id === currentTrackId)) {
      currentTrackId = trackOptions[0].id;
      state.choice['major'] = currentTrackId;
    }

    // 2. 渲染學程切換分段按鈕
    const segMount = $('#roadmap-track-seg');
    if (segMount) {
      segMount.innerHTML = '';
      trackOptions.forEach(opt => {
        const isActive = opt.id === currentTrackId;
        const b = el('button', {
          class: 'segmented__btn' + (isActive ? ' is-active' : ''),
          type: 'button',
          'aria-pressed': String(isActive),
          onClick: () => {
            if (state.choice['major'] === opt.id) return;
            state.choice['major'] = opt.id;
            // 連動主選單選項狀態
            const mainSeg = $('[aria-label="' + (choiceGroup ? choiceGroup.title : '主修學程（二選一）') + '"]');
            if (mainSeg) {
              const bIndex = trackOptions.findIndex(o => o.id === opt.id);
              const btns = $$('.segmented__btn', mainSeg);
              if (btns[bIndex]) btns[bIndex].click();
            } else {
              save();
              update();
            }
          },
        }, opt.label);
        segMount.append(b);
      });
    }

    // 3. 渲染抵免門數選擇按鈕 (0, 1, 2, 3, 4)
    const offsetMount = $('#roadmap-offset-group');
    const offsetTip = $('#roadmap-offset-tip');
    const curOffsetCount = state.offsetCount != null ? state.offsetCount : 2;

    if (offsetMount) {
      offsetMount.innerHTML = '';
      [0, 1, 2, 3, 4].forEach(n => {
        const isSelected = n === curOffsetCount;
        const btn = el('button', {
          class: 'offset-btn' + (isSelected ? ' is-active' : ''),
          type: 'button',
          'aria-pressed': String(isSelected),
          title: n === 2 ? '折抵 2 門（系所推薦預設值）' : `折抵 ${n} 門`,
          onClick: () => {
            state.offsetCount = n;
            save();
            update();
          },
        }, n === 2 ? '2 門 (推薦)' : (n + ' 門'));
        offsetMount.append(btn);
      });
    }

    // 4. 計算抵免池：從「非目前主修學程」中找出已修畢的課程
    const otherTrackId = trackOptions.find(o => o.id !== currentTrackId)?.id || (currentTrackId === 'newmedia' ? 'smart' : 'newmedia');
    const otherTrackCourses = [];
    const otherSemMap = TRACK_SEMESTER_COURSES[otherTrackId] || {};
    Object.values(otherSemMap).forEach(list => {
      list.forEach(c => {
        if (c.cat === 'major') otherTrackCourses.push(c);
      });
    });

    // 找出另一學程中已通過的課程
    const passedFromOther = [];
    otherTrackCourses.forEach(c => {
      const res = isCourseCompleted(c);
      if (res.completed) {
        passedFromOther.push({ course: c, reason: res.reason });
      }
    });

    if (offsetTip) {
      if (curOffsetCount === 0) {
        offsetTip.textContent = '未啟用跨學程抵免';
      } else {
        offsetTip.textContent = `已修另學程 ${passedFromOther.length} 門，最多可抵免 ${curOffsetCount} 門`;
      }
    }

    // 5. 組合 8 學期完整課程
    let availableOffsets = curOffsetCount > 0 ? [...passedFromOther] : [];
    let usedOffsets = [];

    const activeSemMap = TRACK_SEMESTER_COURSES[currentTrackId] || {};
    let totalScheduleCredits = 0;
    let totalCompletedCredits = 0;

    grid.innerHTML = '';

    DEFAULT_BASE_SCHEDULE.forEach(semBase => {
      const trackExtra = activeSemMap[semBase.semId] || [];
      const semCourses = [...semBase.courses, ...trackExtra];

      let semRequiredCr = 0;
      let semEarnedCr = 0;

      const courseNodes = semCourses.map(c => {
        semRequiredCr += c.cr;
        totalScheduleCredits += c.cr;

        let status = isCourseCompleted(c);
        let isOffset = false;
        let offsetBy = '';

        // 若本課程尚未修畢，且是學程核心課 (major)，嘗試從抵免池進行跨學程抵免
        if (!status.completed && c.cat === 'major' && availableOffsets.length > 0) {
          const offCandidate = availableOffsets.shift();
          usedOffsets.push({ target: c.name, source: offCandidate.course.name });
          status = {
            completed: true,
            reason: `跨學程抵免：由「${offCandidate.course.name}」抵免`,
          };
          isOffset = true;
          offsetBy = offCandidate.course.name;
        }

        if (status.completed) {
          semEarnedCr += c.cr;
          totalCompletedCredits += c.cr;
        }

        // 建立課程 DOM
        const courseEl = el('div', {
          class: 'sem-course ' + (isOffset ? 'is-offset' : (status.completed ? 'is-done' : 'is-pending')),
        },
          el('div', { class: 'sem-course__top' },
            el('span', { class: 'sem-course__name' }, c.name),
            el('span', { class: 'sem-course__cr' }, c.cr + ' 學分')
          ),
          el('div', { class: 'sem-course__meta' },
            el('span', { class: 'sem-cat-tag sem-cat-tag--' + c.cat }, getCatLabel(c.cat)),
            el('span', {
              class: 'sem-status-pill sem-status-pill--' + (isOffset ? 'offset' : (status.completed ? 'done' : 'pending')),
            },
              isOffset ? '★ 跨學程抵免' : (status.completed ? '✔ 已修畢' : '⏳ 待修習')
            )
          ),
          isOffset ? el('div', { class: 'sem-course__offset-note' }, `由「${offsetBy}」抵免`) : null
        );

        return courseEl;
      });

      const isAllDone = semEarnedCr >= semRequiredCr && semRequiredCr > 0;
      const progressPct = semRequiredCr > 0 ? Math.min(100, Math.round((semEarnedCr / semRequiredCr) * 100)) : 0;

      const cardEl = el('div', { class: 'sem-card' + (isAllDone ? ' is-all-done' : '') },
        el('div', { class: 'sem-card__head' },
          el('span', { class: 'sem-card__title' }, semBase.semLabel),
          el('span', { class: 'sem-card__cr' },
            isAllDone
              ? el('b', {}, `${semEarnedCr} / ${semRequiredCr} 學分 ✔`)
              : el('span', {}, `${semEarnedCr} / ${semRequiredCr} 學分`)
          )
        ),
        el('div', { class: 'sem-card__progress-bar' },
          el('div', { class: 'sem-card__progress-fill', style: `width: ${progressPct}%` })
        ),
        el('div', { class: 'sem-card__courses' }, ...courseNodes)
      );

      grid.append(cardEl);
    });

    // 6. 更新總覽徽章
    const summaryBadge = $('#roadmap-summary-badge');
    if (summaryBadge) {
      const overallPct = Math.min(100, Math.round((totalCompletedCredits / totalScheduleCredits) * 100));
      summaryBadge.innerHTML = `已修畢 <b>${totalCompletedCredits}</b> / ${totalScheduleCredits} 學分（進度 <b>${overallPct}%</b>）` +
        (usedOffsets.length > 0 ? ` · 跨學程抵免 <b>${usedOffsets.length}</b> 門` : '');
    }
  }

  function getCatLabel(cat) {
    switch (cat) {
      case 'college': return '院核心';
      case 'dept': return '系核心';
      case 'major': return '學程核心';
      case 'general': return '通識共同';
      case 'free': return '自由選修';
      case 'external': return '他系專長';
      default: return '選修';
    }
  }

  /* =====================================================================
     文字正規化（成績單與課綱解析共用）
     ===================================================================== */
  const toHalf = (s) => (s || '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[　 ]/g, ' ');
  const norm = (s) => toHalf(s).replace(/\s+/g, '').toLowerCase();

  /* 成績單一筆是否屬於「校定必修」（語文 16＋核心 8＋博雅 6；否則歸自由選修）。
     Excel 匯入、跨課綱比對、學分明細三處共用，規則必須一致。 */
  function isGeneralCourseRecord(c) {
    if (!c) return false;
    if (c.opt && c.opt.includes('通識')) return true;
    if (c.code && /^(GOG|GRG|GSG)/i.test(c.code)) return true;
    const n = norm(c.name);
    // 官方課綱校定必修課程名關鍵字（含博雅；博雅 6 學分含在校定 30 內）。
    // 人文/社會/自然/生活等單字太常見，刻意不用，避免誤把自由選修吸進校定。
    return /共通英語文|共通專業英語文|醫護英文|科技英文|商管英文|設計英文|簡報英文|文學賞析|文學與生活|中文|法律與生活|智慧財產|愛情|性別|設計思考|美學素養|資訊科技概論|資訊與科技|程式設計與智慧應用|歷史與文化|永續發展|服務學習|體育|健康與生活|博雅/.test(n);
  }

  /* =====================================================================
     貼上成績單自動勾選（純本機比對）
     ===================================================================== */
  function allCourses() {
    const out = [];
    const push = (listId, courses) =>
      (courses || []).forEach((c) => out.push({ listId, c, key: ckey(listId, c) }));
    GROUPS.forEach((g) => {
      if (g.kind === 'choice') g.options.forEach((o) => push(optListId(g, o), o.courses));
      else if (g.kind !== 'credits') push(g.id, g.courses);
    });
    return out;
  }

  function looksPassed(rawLine) {
    const line = toHalf(rawLine);
    if (/停修|退選|撤選|未通過|不及格|未達|抵免不/.test(line)) return false;
    if (/及格|通過|抵免|pass/i.test(line)) return true;
    const nums = (line.match(/\d{1,3}(?:\.\d+)?/g) || [])
      .map(Number).filter((n) => n >= 0 && n <= 100);
    if (nums.length) return Math.max(...nums) >= 60;
    return true; // 出現在成績單上、又無反向訊號 → 視為通過（使用者可再調整）
  }

  /* 比對一行是哪一門課：先比課號（最可靠），再比課名。
     課名取「最長」的匹配，避免短課名誤中另一門較長的課。 */
  function matchCourse(nline, idx) {
    for (const item of idx) {
      if (item.c.code && nline.includes(item.c.code.toLowerCase())) return item;
    }
    let best = null, bestLen = 0;
    for (const item of idx) {
      const nn = norm(item.c.name);
      if (nn.length >= 3 && nline.includes(nn) && nn.length > bestLen) { best = item; bestLen = nn.length; }
    }
    return best;
  }

  /* 尾欄 token：學分、成績、通過與否這類「附屬於上一門課」的欄位 */
  const isTailToken = (l) => {
    const t = toHalf(l).trim();
    if (!t) return false;
    if (/^[\d.\s]+$/.test(t)) return true;
    return /^(通過|及格|不及格|停修|退選|撤選|抵免|未通過|缺考|pass|fail|[a-fA-F][+-]?)$/.test(t);
  };

  /* 把貼上的文字整理成「一門課一筆」的紀錄。
     從網頁表格複製時常變成一欄一行（課號、課名、學分、成績各自成行），
     這時要把後續欄位接回同一門課，否則「停修 / 不及格」會被漏判成通過。 */
  function buildRecords(lines, idx) {
    const recs = [];
    let cur = null;
    lines.forEach((line) => {
      const hit = matchCourse(norm(line), idx);
      if (hit) {
        if (cur && cur.hit && cur.hit.key === hit.key) cur.parts.push(line);
        else { cur = { hit, parts: [line] }; recs.push(cur); }
      } else if (cur && isTailToken(line)) {
        cur.parts.push(line);
      } else {
        recs.push({ hit: null, parts: [line] });
        cur = null;
      }
    });
    return recs;
  }

  function runImport() {
    const text = $('#import-text').value || '';
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const idx = allCourses();
    const matchedKeys = new Set();
    const matchedNames = [];
    const skipped = [];
    const unmatched = [];

    buildRecords(lines, idx).forEach((rec) => {
      const t = rec.parts.join(' ');
      if (rec.hit) {
        if (looksPassed(t)) {
          if (!matchedKeys.has(rec.hit.key)) matchedNames.push(rec.hit.c.name);
          matchedKeys.add(rec.hit.key);
        } else skipped.push(rec.hit.c.name);
      } else if (looksPassed(t) && /[一-鿿]{2,}/.test(t)) {
        unmatched.push(t.trim());
      }
    });
    // 重修：只要有一次通過就算過，不因先前不及格被列入略過
    const reallySkipped = skipped.filter((n) => !matchedNames.includes(n));

    state.passedCourses = matchedNames.map((n) => ({ name: n, cr: 0 }));
    matchedKeys.forEach((k) => { state.checked[k] = true; });
    syncChecks();
    save(); update();

    const resBar = $('#import-result-bar');
    if (resBar) resBar.hidden = false;
    const badge = $('#student-badge');
    if (badge) badge.innerHTML = '';

    const res = $('#import-result');
    res.className = 'import__result is-ok';
    res.textContent = '已比對並勾選 ' + matchedKeys.size + ' 門必修 / 學程課程。';

    // 明細：讓你可以核對，而不是盲目相信自動勾選
    const detail = $('#import-detail');
    detail.innerHTML = '';
    if (matchedNames.length) {
      detail.append(el('div', { class: 'import__list' },
        el('b', {}, '已勾選：'), matchedNames.join('、')));
    }
    if (reallySkipped.length) {
      detail.append(el('div', { class: 'import__list import__list--skip' },
        el('b', {}, '看起來沒通過，未勾選：'), reallySkipped.join('、'),
        el('span', { class: 'import__hint' }, '（停修、退選或成績未達 60。若判斷有誤，直接手動勾選即可）')));
    }
    detail.hidden = !detail.children.length;

    const un = $('#import-unmatched');
    if (unmatched.length) {
      un.hidden = false;
      un.innerHTML = '';
      un.append(
        el('b', {}, '有 ' + unmatched.length + ' 筆沒對應到清單課程'),
        '（多半是通識、共同或自由選修）。請把這些學分自行加總後，填到學分輸入欄位：',
        el('div', { style: 'margin-top:.5rem;color:var(--ink-3)' },
          unmatched.slice(0, 12).join('　·　') + (unmatched.length > 12 ? ' …' : '')));
    } else {
      un.hidden = true;
    }
  }

  /* 依 state 同步所有 checkbox 的畫面（import / bulk 用） */
  function syncChecks() {
    $$('.course-row').forEach((row) => {
      const key = row.getAttribute('data-key');
      const input = row.querySelector('input');
      const on = !!state.checked[key];
      if (input && input.checked !== on) {
        input.checked = on;
        row.setAttribute('data-checked', String(on));
        if (on) animCheck(row.querySelector('.check__box'), true);
      }
    });
  }

  /* 依 state 同步學分數輸入框 */
  function syncCredits() {
    $$('input[data-credit-id]').forEach((input) => {
      const id = input.getAttribute('data-credit-id');
      if (id && typeof state.credits[id] === 'number') {
        input.value = String(state.credits[id]);
      }
    });
  }

  /* 依 state 同步畢業門檻檢定 */
  function syncThresholds() {
    $$('label.threshold[data-threshold]').forEach((row) => {
      const id = row.getAttribute('data-threshold');
      const input = row.querySelector('input');
      const pass = !!state.thresholds[id];
      if (input && input.checked !== pass) {
        input.checked = pass;
        row.setAttribute('data-pass', String(pass));
        animCheck(row.querySelector('.check__box'), pass);
      }
    });
  }

  /* =====================================================================
     Excel 成績單解析與智慧試算
     ===================================================================== */
  function parseExcelWorkbook(wb, filename) {
    let studentName = '';
    let studentId = '';
    let printDate = '';
    const semesters = [];
    const rawRecords = [];

    (wb.SheetNames || []).forEach((sheetName) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows || rows.length < 2) return;

      // 1. 嘗試讀取學生姓名、學號與製表日期
      for (let r = 0; r < Math.min(6, rows.length); r++) {
        const row = rows[r].map((c) => String(c || '').trim());
        const idIdx = row.findIndex((c) => c === '學號');
        const nameIdx = row.findIndex((c) => c === '姓名');
        const dateIdx = row.findIndex((c) => c === '製表日期');
        if (idIdx !== -1 && rows[r + 1]) {
          const nextRow = rows[r + 1].map((c) => String(c || '').trim());
          if (!studentId && nextRow[idIdx]) studentId = nextRow[idIdx];
          if (!studentName && nameIdx !== -1 && nextRow[nameIdx]) studentName = nextRow[nameIdx];
          if (!printDate && dateIdx !== -1 && nextRow[dateIdx]) printDate = nextRow[dateIdx];
        }
      }

      // 2. 尋找表格標題列（需含有 課號 及 課名/課程名稱）
      let headerRowIdx = -1;
      let colMap = { opt: -1, code: -1, name: -1, cr: -1, score: -1 };

      for (let r = 0; r < Math.min(12, rows.length); r++) {
        const row = rows[r].map((c) => String(c || '').trim());
        const codeCol = row.findIndex((c) => c === '課號');
        const nameCol = row.findIndex((c) => /課名|課程名稱/.test(c));
        if (codeCol !== -1 && nameCol !== -1) {
          headerRowIdx = r;
          colMap.code = codeCol;
          colMap.name = nameCol;
          colMap.opt = row.findIndex((c) => /選別/.test(c));
          colMap.cr = row.findIndex((c) => /學分/.test(c));
          // 優先匹配「學期成績」，避免誤配到「期中成績」
          let sIdx = row.findIndex((c) => /學期成績|學年成績|期末成績/.test(c));
          if (sIdx === -1) sIdx = row.findIndex((c) => /成績/.test(c) && !/期中/.test(c));
          colMap.score = sIdx;
          break;
        }
      }

      if (headerRowIdx === -1) return;
      semesters.push(sheetName);

      // 3. 讀取各門課程列
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row.length) continue;
        // 一旦遇到「排名」或「合計」列，代表本學期修課清單已結束
        if (row.some((c) => /排名|合計|平均|班級人數/.test(String(c || '')))) break;

        const code = String(row[colMap.code] || '').trim();
        const name = String(row[colMap.name] || '').trim();
        if (!name || name === 'None' || !code) continue;
        if (name === '操行' || code === 'CR101') continue;

        const opt = colMap.opt !== -1 ? String(row[colMap.opt] || '').trim() : '';
        const crVal = colMap.cr !== -1 ? parseFloat(row[colMap.cr]) : 0;
        const cr = isNaN(crVal) ? 0 : crVal;
        const scoreStr = colMap.score !== -1 ? String(row[colMap.score] || '').trim() : '';

        let passed = false;
        let reason = '';
        if (/停修|退選|撤選/.test(scoreStr)) {
          passed = false;
          reason = '停修';
        } else if (/未通過|不及格|fail/i.test(scoreStr)) {
          passed = false;
          reason = '不及格';
        } else if (/及格|通過|抵免|pass/i.test(scoreStr)) {
          passed = true;
          reason = scoreStr;
        } else {
          const num = parseFloat(scoreStr);
          if (!isNaN(num)) {
            if (num >= 60.0) {
              passed = true;
              reason = String(num);
            } else {
              passed = false;
              reason = num + '分 (不及格)';
            }
          } else {
            passed = false;
            reason = scoreStr || '無成績';
          }
        }

        rawRecords.push({
          sem: sheetName,
          opt,
          code,
          name,
          cr,
          score: scoreStr,
          passed,
          reason,
        });
      }
    });

    return {
      studentName,
      studentId,
      printDate,
      semesters,
      records: rawRecords,
      filename,
    };
  }

  function applyExcelImport(data) {
    if (!data || !data.records || !data.records.length) {
      alert('未能在 Excel 檔案中找到有效的課程成績紀錄，請確認此為亞洲大學學生資訊系統匯出之歷年成績 Excel 檔。');
      return;
    }

    const idx = allCourses();
    const courseMap = new Map();
    data.records.forEach((r) => {
      const idKey = (r.code ? r.code.toUpperCase() : norm(r.name));
      if (!courseMap.has(idKey)) {
        courseMap.set(idKey, []);
      }
      courseMap.get(idKey).push(r);
    });

    const passedCourses = [];
    const skippedCourses = [];

    courseMap.forEach((attempts) => {
      const passAttempt = attempts.find((a) => a.passed);
      if (passAttempt) {
        passedCourses.push(passAttempt);
      } else {
        const last = attempts[attempts.length - 1];
        skippedCourses.push(last);
      }
    });

    const matchedKeys = new Set();
    const matchedNames = [];
    const unmatchedPassed = [];

    passedCourses.forEach((c) => {
      const nline = (c.code + ' ' + c.name).toLowerCase();
      const hit = matchCourse(nline, idx);
      if (hit) {
        if (!matchedKeys.has(hit.key)) {
          matchedNames.push(hit.c.name);
          matchedKeys.add(hit.key);
        }
      } else {
        unmatchedPassed.push(c);
      }
    });

    // 區分通識共同與自由選修（規則見共用 isGeneralCourseRecord）
    const isGeneralCourse = isGeneralCourseRecord;

    let generalCr = 0;
    const generalList = [];
    let freeCr = 0;
    const freeList = [];

    unmatchedPassed.forEach((c) => {
      if (isGeneralCourse(c)) {
        generalCr += c.cr;
        generalList.push(c);
      } else {
        freeCr += c.cr;
        freeList.push(c);
      }
    });

    matchedKeys.forEach((k) => { state.checked[k] = true; });

    const genGroup = GROUPS.find((g) => g.id === 'general' || /通識/.test(g.title));
    if (genGroup && genGroup.kind === 'credits') {
      state.credits[genGroup.id] = Math.round(generalCr);
    }
    const freeGroup = GROUPS.find((g) => g.id === 'free' || /自由/.test(g.title));
    if (freeGroup && freeGroup.kind === 'credits') {
      state.credits[freeGroup.id] = Math.round(freeCr);
    }

    // 畢業門檻自動標記
    const detectedThresholds = [];
    const peCount = passedCourses.filter((c) => /體育/.test(c.name) || /GSG/i.test(c.code)).length;
    if (peCount >= 4) {
      state.thresholds['pe'] = true;
      detectedThresholds.push('體育（四學期全數通過）');
    }
    if (passedCourses.some((c) => /永續發展與實踐|服務學習/.test(c.name))) {
      state.thresholds['service'] = true;
      detectedThresholds.push('服務學習 / 勞作教育（由永續發展與實踐抵免）');
    }
    if (passedCourses.some((c) => /基礎程式設計|資訊科技概論|程式設計與智慧應用/.test(c.name))) {
      state.thresholds['info'] = true;
      detectedThresholds.push('資訊能力（修畢程式設計/資訊科技課程）');
    }
    if (passedCourses.some((c) => /共通英語文|進修英語|科技英文/.test(c.name))) {
      state.thresholds['english'] = true;
      detectedThresholds.push('英文能力（修畢指定英語文課程）');
    }

    state.passedCourses = passedCourses.map(c => ({
      sem: c.sem,
      code: c.code,
      name: c.name,
      cr: c.cr,
      score: c.score,
      grade: c.score,
    }));

    const totalCr = Math.round(passedCourses.reduce((s, c) => s + c.cr, 0));
    state.student = {
      name: data.studentName || '',
      id: data.studentId || '',
      semesters: data.semesters ? data.semesters.length : 0,
      totalCr: totalCr
    };

    syncChecks();
    syncCredits();
    syncThresholds();
    save();
    update();

    // 顯示結果
    const resBar = $('#import-result-bar');
    if (resBar) resBar.hidden = false;

    const badge = $('#student-badge');
    if (badge) {
      badge.innerHTML = '';
      const nameStr = data.studentName || '同學';
      const idStr = data.studentId ? ` (${data.studentId})` : '';
      const semsStr = data.semesters.length ? ` · 歷年 ${data.semesters.length} 個學期` : '';
      badge.append(
        icon('i-cap'),
        el('span', {}, nameStr + idStr),
        el('span', { class: 'badge-meta' }, semsStr + ` · 共 ${totalCr} 及格學分`)
      );
    }

    const res = $('#import-result');
    if (res) {
      res.className = 'import__result is-ok';
      res.textContent = `成功匯入！已勾選 ${matchedKeys.size} 門核心與學程課程，並自動加總 校定必修 ${Math.round(generalCr)} 學分、自由選修 ${Math.round(freeCr)} 學分。`;
    }

    const detail = $('#import-detail');
    detail.innerHTML = '';
    detail.hidden = false;

    if (matchedNames.length) {
      detail.append(el('div', { class: 'import__list' },
        el('b', {}, '已自動勾選核心/學程（' + matchedNames.length + ' 門）：'),
        matchedNames.join('、')));
    }

    if (generalList.length || freeList.length) {
      detail.append(el('div', { class: 'import__list import__list--credits' },
        el('b', {}, '已自動帶入學分：'),
        `校定必修 ${Math.round(generalCr)} 學分（含博雅通識；${generalList.map(c => c.name).join('、')}）；` +
        `自由選修 ${Math.round(freeCr)} 學分（${freeList.map(c => c.name + (c.cr ? '(' + c.cr + ')' : '')).join('、')}）`,
        el('span', { class: 'import__hint' }, '（他系專長／跨領域的課暫列在自由選修，請到下方「自由選修」明細用選單逐門改列到「他系專長／跨領域學程」）')));
    }

    if (skippedCourses.length) {
      detail.append(el('div', { class: 'import__list import__list--skip' },
        el('b', {}, '停修或不及格（未採計，共 ' + skippedCourses.length + ' 筆）：'),
        skippedCourses.map((c) => `${c.name} [${c.reason}]`).join('、'),
        el('span', { class: 'import__hint' }, '（重修通過者已正常採計，僅列出最終未通過或停修課程）')));
    }

    if (detectedThresholds.length) {
      detail.append(el('div', { class: 'import__list' },
        el('b', {}, '畢業門檻檢定已自動標記：'),
        detectedThresholds.join('、'),
        el('span', { class: 'import__hint' }, '（若有其他自辦檢定或特殊規範，仍請以系辦或相關單位認定為準）')));
    }

    const un = $('#import-unmatched');
    if (un) un.hidden = true;

    // 跨課綱共享已解析之成績單與學生身分
    writeJSON('au-audit-shared-student-v1', {
      student: state.student,
      passedCourses: state.passedCourses
    });

    // 立即自動平滑滾動至 4 年 8 學期建議規劃區，讓使用者一眼看見修畢標記與抵免
    const roadmapEl = $('#roadmap-section');
    if (roadmapEl) {
      setTimeout(() => {
        roadmapEl.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
      }, 100);
    }
    const studentTitle = data.studentName ? `${data.studentName} 同學的` : '';
    showUploadStatus(
      `🎉 成績單匯入成功！${studentTitle}`,
      `共辨識 ${data.semesters.length} 個學期、${totalCr} 及格學分。已為您在下方 8 學期規劃中標記修畢科目與學程抵免。`,
      'go'
    );
    toast(`已成功匯入 ${studentTitle}成績單！已為您更新 8 學期建議課表`, 'go');
  }

  function handleExcelFile(file) {
    if (!file) return;
    showUploadStatus('正在讀取 Excel 成績單...', `檔案「${file.name}」解析中，請稍候...`, 'info');
    if (typeof XLSX === 'undefined') {
      showUploadStatus('Excel 解析模組尚未就緒', '請確認 xlsx.full.min.js 是否已載入。', 'error');
      alert('Excel 解析模組尚未載入，請確認 xlsx.full.min.js 是否就緒。');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const parsed = parseExcelWorkbook(wb, file.name);
        applyExcelImport(parsed);
      } catch (err) {
        console.error('Excel 讀取錯誤', err);
        showUploadStatus('Excel 成績單解析失敗', (err.message || String(err)), 'error');
        alert('讀取 Excel 檔案時發生錯誤：' + (err.message || err));
      }
    };
    reader.onerror = (e) => {
      showUploadStatus('檔案讀取失敗', '無法讀取此檔案，請重新選取。', 'error');
    };
    reader.readAsArrayBuffer(file);
  }

  /* =====================================================================
     課綱：切換 / 匯入 / 匯出 / 由課表文字產生
     ===================================================================== */
  function curriculumLabel(cur) {
    const m = cur.meta || {};
    return [m.dept || m.id, m.cohort].filter(Boolean).join(' · ');
  }

  function renderCurriculumBar() {
    const sel = $('#cur-select');
    if (!sel) return;
    sel.innerHTML = '';
    Object.keys(registry).forEach((id) => {
      const opt = el('option', { value: id }, curriculumLabel(registry[id]));
      if (id === CUR_ID) opt.selected = true;
      sel.append(opt);
    });
    sel.addEventListener('change', () => {
      localStorage.setItem(SEL_KEY, sel.value);
      location.reload();   // 重新載入是最單純可靠的切換方式
    });
    const info = $('#cur-info');
    if (info) {
      const m = C.meta || {};
      info.textContent = [m.school, '畢業門檻 ' + TOTAL + ' 學分'].filter(Boolean).join(' · ');
    }
  }

  /* 課綱結構檢查：把問題講清楚，而不是靜靜壞掉 */
  function validateCurriculum(cur) {
    const errs = [];
    if (!cur || typeof cur !== 'object') return ['不是有效的 JSON 物件'];
    if (!cur.meta || !cur.meta.id) errs.push('缺少 meta.id');
    if (!cur.meta || !cur.meta.totalRequired) errs.push('缺少 meta.totalRequired（畢業總學分）');
    const gs = Array.isArray(cur.groups) ? cur.groups : null;
    if (!gs || !gs.length) errs.push('缺少 groups（至少要有一個分類）');
    if (gs) {
      gs.forEach((g, i) => {
        if (!g.id) errs.push('第 ' + (i + 1) + ' 個 group 缺少 id');
        if (typeof g.required !== 'number') errs.push('group「' + (g.title || g.id) + '」缺少 required');
        if (g.kind === 'choice') {
          if (!Array.isArray(g.options) || g.options.length < 1) errs.push('group「' + (g.title || g.id) + '」的 options 至少要一個');
        } else if (g.kind !== 'credits' && !Array.isArray(g.courses)) {
          errs.push('group「' + (g.title || g.id) + '」缺少 courses');
        }
      });
      const sum = gs.reduce((s, g) => s + (g.required || 0), 0);
      if (cur.meta && cur.meta.totalRequired && sum !== cur.meta.totalRequired) {
        errs.push('各分類應修學分加總 ' + sum + '，與 totalRequired ' + cur.meta.totalRequired + ' 不符');
      }
    }
    return errs;
  }

  function installCurriculum(cur) {
    const errs = validateCurriculum(cur);
    if (errs.length) return { ok: false, errs };
    userCurricula[cur.meta.id] = cur;
    if (!writeJSON(REG_KEY, userCurricula)) return { ok: false, errs: ['瀏覽器儲存空間不足，無法儲存課綱'] };
    localStorage.setItem(SEL_KEY, cur.meta.id);
    return { ok: true };
  }

  function exportCurriculum() {
    const blob = new Blob([JSON.stringify(C, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: CUR_ID + '.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已下載目前課綱 JSON，可改成別系的再匯入');
  }

  /* 由「課表文字」產生課綱：讓別系同學不需要 AI 也能自己做一份。
     格式（每行一項）：
       @meta 學校 | 系所 | 入學學年 | 畢業總學分
       @group 分類名稱 | 應修學分 | checklist|credits|choice
       @option 學程名稱                （只在 choice 分類下使用）
       @threshold 門檻名稱
       課號 課名 學分          （課號可省略；用空白或 Tab 分隔皆可）
  */
  function parseCourseLine(line) {
    const t = toHalf(line).trim();
    if (!t) return null;
    let code = '';
    const cm = t.match(/\b([A-Za-z]{2,3}\d{4,8})\b/);
    if (cm) code = cm[1];
    const crm = t.match(/(\d{1,2})\s*(?:學分)?\s*$/);
    const cr = crm ? parseInt(crm[1], 10) : 0;
    let name = t;
    if (code) name = name.replace(code, ' ');
    if (crm) name = name.slice(0, name.length - crm[0].length);
    name = name.replace(/[\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!name) return null;
    return { code, name, cr };
  }

  function parseCurriculumText(text) {
    const lines = String(text || '').split(/\r?\n/);
    const cur = { meta: { id: '', school: '', dept: '', cohort: '', totalRequired: 0 }, groups: [], thresholds: [] };
    let g = null, opt = null, n = 0;
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const at = line.match(/^@(\w+)\s*(.*)$/);
      if (at) {
        const cmd = at[1].toLowerCase();
        const parts = at[2].split('|').map((s) => s.trim());
        if (cmd === 'meta') {
          cur.meta.school = parts[0] || '';
          cur.meta.dept = parts[1] || '';
          cur.meta.cohort = parts[2] || '';
          cur.meta.totalRequired = parseInt(parts[3], 10) || 0;
          cur.meta.id = 'custom-' + norm((parts[1] || 'dept') + (parts[2] || '')).slice(0, 24) + '-' + String(Date.now()).slice(-5);
        } else if (cmd === 'group') {
          const kind = (parts[2] || 'checklist').toLowerCase();
          g = { id: 'g' + (++n), title: parts[0] || ('分類 ' + n), required: parseInt(parts[1], 10) || 0, kind: kind };
          if (kind === 'choice') { g.options = []; g.offsetNote = '折抵認定請以系辦為準。'; }
          else if (kind !== 'credits') g.courses = [];
          cur.groups.push(g); opt = null;
        } else if (cmd === 'option') {
          if (g && g.kind === 'choice') {
            opt = { id: 'o' + (g.options.length + 1), label: parts[0] || ('學程 ' + (g.options.length + 1)), courses: [] };
            g.options.push(opt);
          }
        } else if (cmd === 'threshold') {
          cur.thresholds.push({ id: 't' + (cur.thresholds.length + 1), label: parts[0] || '門檻', note: parts[1] || '' });
        }
        return;
      }
      const c = parseCourseLine(line);
      if (!c || !g) return;
      if (g.kind === 'choice') { if (opt) opt.courses.push(c); }
      else if (g.kind !== 'credits') g.courses.push(c);
    });
    return cur;
  }

  /* =====================================================================
     ODT / PDF 課綱自動解析模組（支援學校課規查詢匯出檔案）
     ===================================================================== */
  function cleanStr(s) {
    return String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  function buildCurriculumFromStructuredRows(rows, meta) {
    const collegeCore = {
      id: 'college-core',
      title: '資訊學院 · 院核心',
      required: 9,
      kind: 'checklist',
      note: '全院共同必修，每一門都要修過。',
      courses: []
    };
    const deptCore = {
      id: 'dept-core',
      title: (meta.dept ? meta.dept.replace(/學系$/, '系') : '系') + ' · 系核心必修',
      required: 39,
      kind: 'checklist',
      note: '系上共同必修，全部都要修過。',
      courses: []
    };
    const majorGroup = {
      id: 'major',
      title: '主修學程（擇一修滿）',
      required: 27,
      kind: 'choice',
      note: '各專業學程擇一修滿規定學分。',
      offsetNote: '折抵方向會跟著主修走。實際折抵請以系辦認定為準。',
      options: []
    };
    const generalGroup = {
      id: 'general',
      title: '校定必修 · 通識共同',
      required: 30,
      kind: 'credits',
      note: '含共通英語文、專業英語文、中文、體育、服務學習、通識選修等。請從成績單加總後填入已通過學分。'
    };
    const freeGroup = {
      id: 'free',
      title: '自由選修 · 其他',
      required: 8,
      kind: 'credits',
      note: '不足 128 學分時補足（註五）。超修的學程課程、系上選修都算在這裡。'
    };
    const externalGroup = {
      id: 'external',
      title: '他系專長／跨領域學程',
      required: 15,
      kind: 'credits',
      note: '主修之外另需他系專長、跨領域學程或次專長（約 15 學分）。請填入已通過學分。'
    };

    let currentGroup = null;
    let currentOption = null;

    rows.forEach(cells => {
      const line = cells.join(' ');

      if (/以院為教學核心課程|院核心/.test(line)) {
        const crM = line.match(/(\d+)\s*學分/);
        if (crM) collegeCore.required = parseInt(crM[1], 10);
        currentGroup = collegeCore;
        currentOption = null;
      } else if (/系核心課程|系核心/.test(line) && !/他系/.test(line)) {
        const crM = line.match(/(\d+)\s*學分/);
        if (crM) deptCore.required = parseInt(crM[1], 10);
        currentGroup = deptCore;
        currentOption = null;
      } else if (/系專業選修學程|主修學程/.test(line)) {
        currentGroup = majorGroup;
        currentOption = null;
      } else if (/自由選修|分流實習/.test(line)) {
        currentGroup = freeGroup;
        currentOption = null;
      } else if (/他系/.test(line) && /專長|學程/.test(line)) {
        // 「他系專長學程」是給非本系學生修的，不屬於本系課綱：斷開收集，避免課程漏進上一個學程
        currentGroup = null;
        currentOption = null;
      }

      if (currentGroup === majorGroup) {
        const optM = line.match(/([^\s;；]+學程)\s*(\d+)\s*學分/);
        if (optM && !optM[1].includes('他系')) {
          const optLabel = optM[1];
          let opt = majorGroup.options.find(o => o.label === optLabel);
          if (!opt) {
            const optId = optLabel.includes('智慧') ? 'smart' : (optLabel.includes('新媒體') ? 'newmedia' : 'opt-' + (majorGroup.options.length + 1));
            opt = { id: optId, label: optLabel, courses: [] };
            majorGroup.options.push(opt);
          }
          currentOption = opt;
        }
      }

      let courseName = '';
      let credits = 0;
      cells.forEach((c, cIdx) => {
        if (/類別|科目名稱|修課|學分|備註|講授|實習|學期|年級/.test(c)) return;
        if (/必修|選修|通識|學程|校定|核心/.test(c)) return;
        if (!courseName && /[一-鿿]{2,}/.test(c)) {
          courseName = c.replace(/^[*＊\s]+/, '').trim();
        }
        if (courseName && cIdx > 0 && /^[1-6]$/.test(c)) {
          credits = parseInt(c, 10);
        }
      });

      if (courseName && credits > 0) {
        const courseObj = { code: '', name: courseName, cr: credits };
        if (currentGroup === collegeCore) {
          if (!collegeCore.courses.some(x => x.name === courseName)) collegeCore.courses.push(courseObj);
        } else if (currentGroup === deptCore) {
          if (!deptCore.courses.some(x => x.name === courseName)) deptCore.courses.push(courseObj);
        } else if (currentGroup === majorGroup && currentOption) {
          if (!currentOption.courses.some(x => x.name === courseName)) currentOption.courses.push(courseObj);
        }
      }
    });

    const resGroups = [collegeCore, deptCore, majorGroup, generalGroup, externalGroup, freeGroup];
    const assigned = resGroups.reduce((s, g) => s + (g.required || 0), 0);
    if (meta.totalRequired > assigned) {
      freeGroup.required += (meta.totalRequired - assigned);
    }

    const curId = 'cur-' + (meta.dept || 'dept') + '-' + (meta.cohort || '').replace(/\D+/g, '');

    return {
      meta: {
        id: curId,
        school: meta.school,
        dept: meta.dept,
        cohort: meta.cohort,
        totalRequired: meta.totalRequired
      },
      groups: resGroups,
      thresholds: [
        { id: 'chinese', label: '中文能力檢定', note: '可由指定課程或檢定通過抵免。' },
        { id: 'english', label: '英文能力檢定', note: '共通英語文 / 外語能力檢定。' },
        { id: 'info', label: '資訊能力檢定', note: '資訊應用能力相關檢定。' },
        { id: 'service', label: '服務學習 / 勞作教育', note: '可由永續發展與實踐等課程抵免。' },
        { id: 'pe', label: '體育（四學期）', note: '體育(一)～(四) 皆需通過。' }
      ]
    };
  }

  function buildCurriculumFromPdfRows(rows, meta) {
    const collegeCore = {
      id: 'college-core',
      title: '資訊學院 · 院核心',
      required: 9,
      kind: 'checklist',
      note: '全院共同必修，每一門都要修過。',
      courses: []
    };
    const deptCore = {
      id: 'dept-core',
      title: (meta.dept ? meta.dept.replace(/學系$/, '系') : '系') + ' · 系核心必修',
      required: 39,
      kind: 'checklist',
      note: '系上共同必修，全部都要修過。',
      courses: []
    };
    const majorGroup = {
      id: 'major',
      title: '主修學程（二選一）',
      required: 27,
      kind: 'choice',
      note: '各專業學程擇一修滿 27 學分。',
      offsetNote: '折抵方向會跟著主修走。實際折抵請以系辦認定為準。',
      options: [
        { id: 'smart', label: '智慧傳播應用學程', courses: [] },
        { id: 'newmedia', label: '新媒體傳播內容學程', courses: [] }
      ]
    };
    const generalGroup = {
      id: 'general',
      title: '校定必修 · 通識共同',
      required: 30,
      kind: 'credits',
      note: '含共通英語文、專業英語文、中文、體育、服務學習、通識選修等。請從成績單加總後填入已通過學分。'
    };
    const freeGroup = {
      id: 'free',
      title: '自由選修 · 其他',
      required: 8,
      kind: 'credits',
      note: '不足 128 學分時補足（註五）。超修的學程課程、系上選修都算在這裡。'
    };
    const externalGroup = {
      id: 'external',
      title: '他系專長／跨領域學程',
      required: 15,
      kind: 'credits',
      note: '主修之外另需他系專長、跨領域學程或次專長（約 15 學分）。請填入已通過學分。'
    };

    let currentTarget = collegeCore.courses;

    rows.forEach(([cat, name, crStr]) => {
      if (!name || !crStr) return;
      const cr = parseInt(crStr, 10);
      if (isNaN(cr) || cr <= 0) return;

      if (name.includes('電腦繪圖') || (cat && cat.includes('系核心'))) {
        currentTarget = deptCore.courses;
      } else if (name.includes('新聞採訪與寫作') || (cat && cat.includes('智'))) {
        currentTarget = majorGroup.options[0].courses;
      } else if (name.includes('傳播敘事與劇本創作') || (cat && cat.includes('新'))) {
        currentTarget = majorGroup.options[1].courses;
      } else if (name.includes('資料蒐集與田野調查') || (cat && cat.includes('自'))) {
        currentTarget = null;
      }

      if (currentTarget) {
        if (!currentTarget.some(c => c.name === name)) {
          currentTarget.push({ code: '', name, cr });
        }
      }
    });

    const resGroups = [collegeCore, deptCore, majorGroup, generalGroup, externalGroup, freeGroup];
    const assigned = resGroups.reduce((s, g) => s + (g.required || 0), 0);
    if (meta.totalRequired > assigned) {
      freeGroup.required += (meta.totalRequired - assigned);
    }

    const curId = 'cur-' + (meta.dept || 'dept') + '-' + (meta.cohort || '').replace(/\D+/g, '');

    return {
      meta: {
        id: curId,
        school: meta.school,
        dept: meta.dept,
        cohort: meta.cohort,
        totalRequired: meta.totalRequired
      },
      groups: resGroups,
      thresholds: [
        { id: 'chinese', label: '中文能力檢定', note: '可由指定課程或檢定通過抵免。' },
        { id: 'english', label: '英文能力檢定', note: '共通英語文 / 外語能力檢定。' },
        { id: 'info', label: '資訊能力檢定', note: '資訊應用能力相關檢定。' },
        { id: 'service', label: '服務學習 / 勞作教育', note: '可由永續發展與實踐等課程抵免。' },
        { id: 'pe', label: '體育（四學期）', note: '體育(一)～(四) 皆需通過。' }
      ]
    };
  }

  async function parseCurriculumODT(buffer) {
    if (typeof JSZip === 'undefined') {
      throw new Error('未載入 JSZip 解壓縮庫，無法解析 ODT 檔。');
    }
    const zip = await JSZip.loadAsync(buffer);
    const contentFile = zip.file('content.xml');
    if (!contentFile) {
      throw new Error('ODT 檔案格式不符合（缺少 content.xml）');
    }
    const xml = await contentFile.async('text');

    const pMatches = xml.match(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g) || [];
    const pTexts = pMatches.map(p => cleanStr(p.replace(/<[^>]+>/g, ''))).filter(Boolean);

    let school = '亞洲大學';
    let dept = '資訊傳播學系';
    let cohort = '112 學年入學';
    let totalRequired = 128;

    pTexts.forEach(t => {
      const sm = t.match(/([^\s;；]+大學)/);
      if (sm) school = sm[1].replace(/^依據/, '');
      const cm = t.match(/(\d{3})\s*學年度/);
      if (cm) cohort = cm[1] + ' 學年入學';
      const dm = t.match(/系別[：:]\s*([一-鿿]+(?:學系|系))/);
      if (dm) dept = dm[1];
      else {
        const dm2 = t.match(/系別[：:]\s*([^\s;；畢業]+)/);
        if (dm2) dept = dm2[1];
      }
      const tm = t.match(/畢業總學分[：:]\s*(\d+)/);
      if (tm) totalRequired = parseInt(tm[1], 10);
    });

    const rowMatches = xml.match(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g) || [];
    const rows = [];
    rowMatches.forEach(rXml => {
      const cellMatches = rXml.match(/<table:table-cell[^>]*>([\s\S]*?)<\/table:table-cell>/g) || [];
      const cells = cellMatches.map(cXml => cleanStr(cXml.replace(/<[^>]+>/g, '')));
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length) rows.push(cells);
    });

    return buildCurriculumFromStructuredRows(rows, { school, dept, cohort, totalRequired });
  }

  function buildCurriculumFromPdfCourses(courses, meta) {
    const collegeCore = {
      id: 'college-core',
      title: '資訊學院 · 院核心',
      required: 9,
      kind: 'checklist',
      note: '全院共同必修，每一門都要修過。',
      courses: []
    };
    const deptCore = {
      id: 'dept-core',
      title: (meta.dept ? meta.dept.replace(/學系$/, '系') : '系') + ' · 系核心必修',
      required: 39,
      kind: 'checklist',
      note: '系上共同必修，全部都要修過。',
      courses: []
    };
    const majorGroup = {
      id: 'major',
      title: '主修學程（二選一）',
      required: 27,
      kind: 'choice',
      note: '各專業學程擇一修滿 27 學分。',
      offsetNote: '折抵方向會跟著主修走。實際折抵請以系辦認定為準。',
      options: [
        { id: 'smart', label: '智慧傳播應用學程', courses: [] },
        { id: 'newmedia', label: '新媒體傳播內容學程', courses: [] }
      ]
    };
    const generalGroup = {
      id: 'general',
      title: '校定必修 · 通識共同',
      required: 30,
      kind: 'credits',
      note: '含共通英語文、專業英語文、中文、體育、服務學習、通識選修等。請從成績單加總後填入已通過學分。'
    };
    const freeGroup = {
      id: 'free',
      title: '自由選修 · 其他',
      required: 8,
      kind: 'credits',
      note: '不足 128 學分時補足（註五）。超修的學程課程、系上選修都算在這裡。'
    };
    const externalGroup = {
      id: 'external',
      title: '他系專長／跨領域學程',
      required: 15,
      kind: 'credits',
      note: '主修之外另需他系專長、跨領域學程或次專長（約 15 學分）。請填入已通過學分。'
    };

    let currentTarget = collegeCore.courses;

    courses.forEach(c => {
      const { name, cr } = c;
      if (name.includes('電腦繪圖')) {
        currentTarget = deptCore.courses;
      } else if (name.includes('新聞採訪與寫作')) {
        currentTarget = majorGroup.options[0].courses;
      } else if (name.includes('傳播敘事與劇本創作')) {
        currentTarget = majorGroup.options[1].courses;
      } else if (name.includes('資料蒐集與田野調查')) {
        currentTarget = null;
      }

      if (currentTarget) {
        if (!currentTarget.some(x => x.name === name)) {
          currentTarget.push({ code: '', name, cr });
        }
      }
    });

    const resGroups = [collegeCore, deptCore, majorGroup, generalGroup, externalGroup, freeGroup];
    const assigned = resGroups.reduce((s, g) => s + (g.required || 0), 0);
    if (meta.totalRequired > assigned) {
      freeGroup.required += (meta.totalRequired - assigned);
    }

    const curId = 'cur-' + (meta.dept || 'dept') + '-' + (meta.cohort || '').replace(/\D+/g, '');

    return {
      meta: {
        id: curId,
        school: meta.school,
        dept: meta.dept,
        cohort: meta.cohort,
        totalRequired: meta.totalRequired
      },
      groups: resGroups,
      thresholds: [
        { id: 'chinese', label: '中文能力檢定', note: '可由指定課程或檢定通過抵免。' },
        { id: 'english', label: '英文能力檢定', note: '共通英語文 / 外語能力檢定。' },
        { id: 'info', label: '資訊能力檢定', note: '資訊應用能力相關檢定。' },
        { id: 'service', label: '服務學習 / 勞作教育', note: '可由永續發展與實踐等課程抵免。' },
        { id: 'pe', label: '體育（四學期）', note: '體育(一)～(四) 皆需通過。' }
      ]
    };
  }

  async function parseCurriculumPDF(buffer) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('未載入 PDF.js 庫，無法解析 PDF 檔。');
    }
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    let school = '亞洲大學';
    let dept = '資訊傳播學系';
    let cohort = '112 學年入學';
    let totalRequired = 128;

    // 從第 1 頁讀取中繼資訊
    const p1 = await doc.getPage(1);
    const c1 = await p1.getTextContent();
    const p1Text = c1.items.map(it => it.str).join(' ');

    const sm = p1Text.match(/([^\s;；]+大學)/);
    if (sm) school = sm[1].replace(/^依據/, '');
    const cm = p1Text.match(/(\d{3})\s*學年度/);
    if (cm) cohort = cm[1] + ' 學年入學';
    const dm = p1Text.match(/系別[：:]\s*([一-鿿]+(?:學系|系))/);
    if (dm) dept = dm[1];
    const tm = p1Text.match(/畢業總學分[：:]\s*(\d+)/);
    if (tm) totalRequired = parseInt(tm[1], 10);

    const validCourses = [];

    for (let p = 2; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      const nameItems = [];
      const crItems = [];

      content.items.forEach(it => {
        const str = it.str.trim();
        if (!str) return;
        const x = it.transform[4];
        const y = it.transform[5];

        if (x >= 65 && x < 215) {
          nameItems.push({ str, x, y });
        } else if (x >= 380 && x <= 405 && /^[1-6]$/.test(str)) {
          crItems.push({ str, x, y, cr: parseInt(str, 10) });
        }
      });

      const courseLines = [];
      nameItems.forEach(it => {
        let line = courseLines.find(cl => Math.abs(cl.y - it.y) <= 4);
        if (!line) {
          line = { y: it.y, items: [] };
          courseLines.push(line);
        }
        line.items.push(it);
      });

      courseLines.forEach(cl => {
        cl.items.sort((a, b) => a.x - b.x);
        cl.name = cl.items.map(it => it.str).join('').replace(/^[*＊\s]+/, '').trim();
        const matchedCr = crItems.find(cr => Math.abs(cr.y - cl.y) <= 4);
        cl.cr = matchedCr ? matchedCr.cr : 0;
      });

      const pageCourses = courseLines.filter(cl => cl.name && cl.cr > 0 && cl.name !== '科目名稱');
      pageCourses.sort((a, b) => b.y - a.y);

      pageCourses.forEach(c => {
        // Page 3: 忽略他系專長學程表格 (y < 450)
        if (p === 3 && c.y < 450) return;
        validCourses.push(c);
      });
    }

    return buildCurriculumFromPdfCourses(validCourses, { school, dept, cohort, totalRequired });
  }

  let handleCurriculumFile = null;

  function bindDropzone(zone, input, onFile) {
    if (!zone || !input) return;

    // 注意：zone 已是原生 <label for="...">，滑鼠點擊由瀏覽器原生接管，
    // 這裡刻意不再用 JS 呼叫 input.click()，避免被瀏覽器判為非信任手勢。
    // 僅保留鍵盤 Enter/Space 的無障礙 fallback（鍵盤事件屬於信任手勢）。

    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        // 若焦點在 label 上，Enter/Space 原生不一定會開檔，此處補上
        // （鍵盤手勢是可信的，不會被阻擋）
        if (e.target === zone) {
          e.preventDefault();
          try { input.click(); } catch (err) { reportErrorToUI('無法開啟選檔視窗：' + (err.message || err)); }
        }
      }
    });

    // input 的 change 只綁一次（init 開頭已優先綁過，這裡防重複避免一次選檔跑兩次解析）
    if (!input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('click', () => {
        input.value = '';
      });
      input.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) onFile(f);
      });
    }

    ['dragenter', 'dragover'].forEach((eventName) => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'dragend'].forEach((eventName) => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('is-dragover');
      });
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('is-dragover');
      const overlay = $('#window-drop-overlay');
      if (overlay) overlay.classList.remove('is-active');
      const dt = e.dataTransfer;
      const f = dt && dt.files && dt.files[0];
      if (f) onFile(f);
    });
  }

  function setupCurriculumPanel() {
    const panel = $('#cur-panel');
    if (!panel) return;
    const head = $('#cur-panel-head');
    head.addEventListener('click', () => {
      const open = panel.getAttribute('data-open') !== 'true';
      panel.setAttribute('data-open', String(open));
      head.setAttribute('aria-expanded', String(open));
      animAccordion(panel, open);
    });

    const out = $('#cur-msg');
    const say = (msg, bad) => {
      out.innerHTML = '';
      out.className = 'cur-msg' + (bad ? ' is-bad' : ' is-ok');
      out.append(typeof msg === 'string' ? document.createTextNode(msg) : msg);
      out.hidden = false;
    };

    const apply = (cur) => {
      const r = installCurriculum(cur);
      if (!r.ok) {
        showUploadStatus('課綱格式檢核未通過', r.errs.join('；'), 'error');
        say(el('div', {}, el('b', {}, '課綱格式有問題，沒有匯入：'),
          el('ul', { style: 'margin:.4rem 0 0 1.1rem' }, r.errs.map((e) => el('li', {}, e)))), true);
        return;
      }
      say('課綱已匯入，正在切換…');
      setTimeout(() => location.reload(), 300);
    };

    handleCurriculumFile = async (f) => {
      if (!f) return;
      showUploadStatus('正在讀取課綱檔案...', `檔案「${f.name}」解析中，請稍候...`, 'info');
      say('正在解析課綱檔案（' + f.name + '）…');
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      try {
        let cur = null;
        if (ext === '.odt' || (f.type && f.type.includes('opendocument'))) {
          const buf = await f.arrayBuffer();
          cur = await parseCurriculumODT(buf);
        } else if (ext === '.pdf' || (f.type && f.type === 'application/pdf')) {
          const buf = await f.arrayBuffer();
          cur = await parseCurriculumPDF(buf);
        } else if (ext === '.json' || (f.type && f.type.includes('json'))) {
          const txt = await f.text();
          cur = JSON.parse(txt);
        } else {
          try {
            const txt = await f.text();
            cur = JSON.parse(txt);
          } catch (_) {
            throw new Error('不支援的檔案格式，請上傳 .pdf、.odt 或 .json 課綱檔案。');
          }
        }

        const errs = validateCurriculum(cur);
        const counts = cur.groups.map((g) => {
          const n = g.kind === 'choice'
            ? g.options.reduce((s, o) => s + o.courses.length, 0)
            : (g.courses ? g.courses.length : 0);
          return g.title + '：' + (g.kind === 'credits' ? '填學分' : n + ' 門') + '／應修 ' + g.required + ' 學分';
        });

        if (errs.length) {
          showUploadStatus('課綱格式未通過檢核', errs.join('；'), 'error');
          const curPanel = $('#cur-panel');
          if (curPanel && curPanel.getAttribute('data-open') !== 'true') {
            $('#cur-panel-head').click();
          }
          if (curPanel) curPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          say(el('div', {},
            el('b', {}, '檔案解析完成，但課綱內容檢核未通過：'),
            el('ul', { style: 'margin:.4rem 0 .4rem 1.1rem' }, errs.map((e) => el('li', {}, e))),
            el('div', {}, '目前解析到 → ' + (counts.join('；') || '（無資料）'))), true);
          toast('課綱格式有誤，請查看下方說明', 'miss');
          return;
        }

        $('#cur-text').value = JSON.stringify(cur, null, 2);

        const m = cur.meta || {};
        const metaStr = [m.school, m.dept, m.cohort, m.totalRequired ? (m.totalRequired + ' 學分') : ''].filter(Boolean).join(' · ');

        say(el('div', {},
          el('b', {}, '🎉 成功解析課綱：' + (metaStr || f.name)),
          el('div', { style: 'margin-top:.3rem; font-size:var(--fs-xs); color:var(--ink-2); line-height:1.6;' },
            counts.join(' ｜ ')
          ),
          el('div', { style: 'margin-top:.5rem; font-weight:bold; color:var(--go);' }, '正在自動套用此課綱並更新試算…')
        ));
        showUploadStatus(
          '🎉 課綱檔案解析成功！正在自動套用...',
          `已成功識別「${metaStr}」，包含 ${counts.length} 個修課類別標準。正在切換課綱並重新試算...`,
          'go'
        );
        toast('課綱解析成功！正在為您自動套用…', 'go');

        // 存入 flash toast，重新載入後立即跳出成功通知與狀態列
        try {
          sessionStorage.setItem('au-flash-toast', JSON.stringify({
            msg: `🎉 課綱套用成功！已載入「${metaStr}」`,
            kind: 'go',
            status: {
              title: `🎉 課綱已成功套用：${metaStr}`,
              desc: `已依據「${f.name}」課規更新核心必修與學程設定，並自動保留已修課程試算。`,
              kind: 'go'
            }
          }));
        } catch (_) {}

        setTimeout(() => apply(cur), 400);
      } catch (err) {
        showUploadStatus('課綱解析失敗', (err && err.message ? err.message : String(err)), 'error');
        const curPanel = $('#cur-panel');
        if (curPanel && curPanel.getAttribute('data-open') !== 'true') {
          $('#cur-panel-head').click();
        }
        if (curPanel) curPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        say('課綱解析失敗：' + (err && err.message ? err.message : String(err)), true);
        toast('課綱解析失敗：' + (err && err.message ? err.message : String(err)), 'miss');
      }
    };

    $('#cur-import-json').addEventListener('click', () => {
      const t = $('#cur-text').value.trim();
      if (!t) { say('請先貼上課綱 JSON。', true); return; }
      try { apply(JSON.parse(t)); }
      catch (err) { say('JSON 解析失敗：' + err.message, true); }
    });

    $('#cur-build').addEventListener('click', () => {
      const t = $('#cur-text').value.trim();
      if (!t) { say('請先貼上課表文字（格式說明就在下方）。', true); return; }
      const cur = parseCurriculumText(t);
      const errs = validateCurriculum(cur);
      const counts = cur.groups.map((g) => {
        const n = g.kind === 'choice'
          ? g.options.reduce((s, o) => s + o.courses.length, 0)
          : (g.courses ? g.courses.length : 0);
        return g.title + '：' + (g.kind === 'credits' ? '填學分' : n + ' 門') + '／應修 ' + g.required;
      });
      if (errs.length) {
        say(el('div', {},
          el('b', {}, '解析結果還不能用：'),
          el('ul', { style: 'margin:.4rem 0 .4rem 1.1rem' }, errs.map((e) => el('li', {}, e))),
          el('div', {}, '目前解析到 → ' + (counts.join('；') || '（沒有任何分類）'))), true);
        return;
      }
      $('#cur-text').value = JSON.stringify(cur, null, 2);
      say(el('div', {},
        el('b', {}, '已產生課綱 JSON：'), counts.join('；'),
        el('span', { class: 'cur-msg__hint' }, '請核對上方 JSON，確認無誤後按「匯入這份 JSON」即可套用。')));
    });

    $('#cur-export').addEventListener('click', exportCurriculum);

    $('#cur-remove').addEventListener('click', () => {
      if (!userCurricula[CUR_ID]) { say('目前使用的是內建課綱，不需要刪除。', true); return; }
      if (!confirm('確定要移除這份自訂課綱嗎？（你在這份課綱下的勾選紀錄也會留在本機，但不再顯示）')) return;
      delete userCurricula[CUR_ID];
      writeJSON(REG_KEY, userCurricula);
      localStorage.removeItem(SEL_KEY);
      location.reload();
    });
  }

  /* =====================================================================
     初始化
     ===================================================================== */
  async function handleUniversalFile(file) {
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();

    // 立即顯示視覺進度反饋，讓使用者 100% 確知系統已接收到檔案並在處理
    showUploadStatus('已接收到檔案：' + (file.name || '檔案'), '系統正自動識別檔案格式並進行分析試算，請稍候...', 'info');

    // Excel 成績單
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || type.includes('spreadsheetml') || type.includes('ms-excel')) {
      handleExcelFile(file);
      return;
    }

    // 課綱檔案（ODT / PDF / JSON）
    if (name.endsWith('.odt') || name.endsWith('.pdf') || name.endsWith('.json') || type.includes('opendocument') || type.includes('pdf') || type.includes('json')) {
      if (typeof handleCurriculumFile === 'function') {
        handleCurriculumFile(file);
      }
      return;
    }

    // 備援嘗試：檢查是否為課綱 JSON 內容
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (obj && (obj.groups || obj.meta)) {
        if (typeof handleCurriculumFile === 'function') {
          handleCurriculumFile(file);
        }
        return;
      }
    } catch (_) {}

    showUploadStatus('無法辨識此檔案格式', `檔案「${file.name}」非支援格式。請上傳校務系統「歷年成績列印.xlsx」，或課規查詢匯出的「.pdf / .odt / .json」課綱檔案。`, 'error');
    toast('不支援的檔案格式，請上傳 .xlsx 成績單，或 .pdf / .odt / .json 課綱', 'miss');
  }

  function init() {
    const safe = (label, fn) => {
      try { fn(); }
      catch (err) {
        console.error('[init:' + label + ']', err);
        reportErrorToUI(label + '初始化失敗：' + (err && err.message ? err.message : err));
      }
    };

    // 0. 關鍵：檔案輸入 change 綁定最優先（即使後續任何渲染失敗，選檔仍有反應）
    safe('檔案輸入', () => {
      const excelInput = $('#excel-file-input');
      if (excelInput && !excelInput.dataset.bound) {
        excelInput.dataset.bound = '1';
        excelInput.addEventListener('click', () => { excelInput.value = ''; });
        excelInput.addEventListener('change', (e) => {
          const f = e.target.files && e.target.files[0];
          if (f) handleUniversalFile(f);
        });
      }
      const curInput = $('#cur-file');
      if (curInput && !curInput.dataset.bound) {
        curInput.dataset.bound = '1';
        curInput.addEventListener('click', () => { curInput.value = ''; });
        curInput.addEventListener('change', (e) => {
          const f = e.target.files && e.target.files[0];
          if (f) handleUniversalFile(f);
        });
      }
    });

    // 頁面標題與說明跟著課綱走
    safe('標題', () => {
      const m = C.meta || {};
      const t = [m.dept, m.cohort].filter(Boolean).join(' · ');
      document.title = (m.dept || '畢業審查') + ' 畢業審查工具';
      const bt = $('#appbar-title');
      if (bt) bt.textContent = t || '畢業審查';
      const im = $('#intro-meta');
      if (im) im.textContent = (t || '課綱') + '適用';
    });

    safe('課程卡片', () => {
      const mount = $('#sections');
      GROUPS.forEach((g) => mount.append(groupCard(g)));
    });

    safe('門檻卡片', () => {
      const thr = $('#thresholds');
      if (THRESHOLDS.length) THRESHOLDS.forEach((x) => thr.append(thresholdCard(x)));
      else $('#thresholds-title').hidden = true;
    });

    safe('卡片樣式', () => {
      $$('.card__body, .import__body').forEach((b) => { b.style.overflow = 'hidden'; });
    });

    // 檢查是否有重新載入前留下的 flash 通知
    safe('flash通知', () => {
      try {
        const flash = sessionStorage.getItem('au-flash-toast');
        if (flash) {
          sessionStorage.removeItem('au-flash-toast');
          const f = JSON.parse(flash);
          setTimeout(() => {
            if (f.msg) toast(f.msg, f.kind || 'go');
            if (f.status) showUploadStatus(f.status.title, f.status.desc, f.status.kind || 'go');
          }, 250);
        }
      } catch (_) {}
    });

    // 自動將跨課綱保留之已修及格科目比對至目前課綱
    safe('跨課綱比對', () => {
    if (state.passedCourses && state.passedCourses.length > 0 && Object.keys(state.checked).length === 0) {
      const idx = allCourses();
      let autoMatched = 0;
      state.passedCourses.forEach((c) => {
        const nline = ((c.code || '') + ' ' + (c.name || '')).toLowerCase();
        const hit = matchCourse(nline, idx);
        if (hit) {
          state.checked[hit.key] = true;
          autoMatched++;
        }
      });

      // 區分通識共同與自由選修（規則見共用 isGeneralCourseRecord）
      const isGeneralCourse = isGeneralCourseRecord;
      let generalCr = 0, freeCr = 0;
      state.passedCourses.forEach((c) => {
        const nline = ((c.code || '') + ' ' + (c.name || '')).toLowerCase();
        if (!matchCourse(nline, idx)) {
          if (isGeneralCourse(c)) generalCr += (c.cr || 0);
          else freeCr += (c.cr || 0);
        }
      });

      const genGroup = GROUPS.find((g) => g.id === 'general' || /通識/.test(g.title));
      if (genGroup && genGroup.kind === 'credits') {
        state.credits[genGroup.id] = Math.round(generalCr);
      }
      const freeGroup = GROUPS.find((g) => g.id === 'free' || /自由/.test(g.title));
      if (freeGroup && freeGroup.kind === 'credits') {
        state.credits[freeGroup.id] = Math.round(freeCr);
      }

      const peCount = state.passedCourses.filter((c) => /體育/.test(c.name) || /GSG/i.test(c.code)).length;
      if (peCount >= 4) state.thresholds['pe'] = true;
      if (state.passedCourses.some((c) => /永續發展與實踐|服務學習/.test(c.name))) state.thresholds['service'] = true;
      if (state.passedCourses.some((c) => /基礎程式設計|資訊科技概論|程式設計與智慧應用/.test(c.name))) state.thresholds['info'] = true;
      if (state.passedCourses.some((c) => /共通英語文|進修英語|科技英文/.test(c.name))) state.thresholds['english'] = true;

      syncChecks();
      syncCredits();
      syncThresholds();
      save();
    }
    }); // end 跨課綱比對

    // 狀態列關閉按鈕
    safe('狀態列', () => {
      const statusClose = $('#upload-status-close');
      if (statusClose) {
        statusClose.addEventListener('click', () => {
          const bar = $('#upload-status-bar');
          if (bar) bar.hidden = true;
        });
      }
    });

    // Import 面板預設收合
    safe('面板折疊', () => {
      const importCard = $('#import');
      const importBody = $('#import-body');
      if (!importCard || !importBody) return;
      importBody.style.height = '0px';
      importBody.style.overflow = 'hidden';
      const head = $('#import-head');
      if (head) head.addEventListener('click', () => {
        const open = importCard.getAttribute('data-open') !== 'true';
        importCard.setAttribute('data-open', String(open));
        head.setAttribute('aria-expanded', String(open));
        animAccordion(importCard, open);
      });
    });

    safe('課綱面板', () => {
      const curBody = $('#cur-panel-body');
      if (curBody) { curBody.style.height = '0px'; curBody.style.overflow = 'hidden'; }
    });

    // Toolbar：檔案按鈕已是原生 <label for>，滑鼠點擊零 JS 即可開檔。
    // 這裡只補鍵盤無障礙（Enter/Space），不綁 click -> input.click() 以免被擋。
    safe('工具列鍵盤', () => {
      const labelKeys = ['#btn-toolbar-excel', '#btn-toolbar-cur', '#btn-cur-file'];
      labelKeys.forEach((sel) => {
        const lab = $(sel);
        if (!lab) return;
        lab.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const targetId = lab.getAttribute('for');
            const input = targetId ? document.getElementById(targetId) : null;
            if (input) {
              try { input.click(); } catch (err) { reportErrorToUI('無法開啟選檔視窗：' + (err.message || err)); }
            }
          }
        });
      });
    });

    safe('一般按鈕', () => {
      const importCard = $('#import');
      const toggle = $('#btn-import-toggle');
      if (toggle) toggle.addEventListener('click', () => {
        if (importCard && importCard.getAttribute('data-open') !== 'true') $('#import-head').click();
        if (importCard) importCard.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
      });
      const btnRoadmap = $('#btn-roadmap-toggle');
      if (btnRoadmap) {
        btnRoadmap.addEventListener('click', () => {
          const rSection = $('#roadmap-section');
          if (rSection) {
            rSection.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
          }
        });
      }
      const runBtn = $('#btn-import-run');
      if (runBtn) runBtn.addEventListener('click', runImport);
      const printBtn = $('#btn-print');
      if (printBtn) printBtn.addEventListener('click', () => window.print());
      const resetBtn = $('#btn-reset');
      if (resetBtn) resetBtn.addEventListener('click', () => {
        if (!confirm('確定要清空所有勾選與輸入嗎？此動作無法復原。')) return;
        try {
          localStorage.removeItem(STORE_KEY);
          localStorage.removeItem('au-audit-shared-student-v1');
        } catch (e) {}
        location.reload();
      });
    });

    safe('課綱面板邏輯', () => {
      renderCurriculumBar();
      setupCurriculumPanel();
    });

    safe('拖曳區', () => {
      // 檔案選取與拖曳上傳（全功能智慧檔案路由：支援 .xlsx / .xls / .pdf / .odt / .json）
      bindDropzone($('#excel-dropzone'), $('#excel-file-input'), handleUniversalFile);
      bindDropzone($('#cur-dropzone'), $('#cur-file'), handleUniversalFile);
    });

    safe('全域拖放', () => {
    // 全視窗拖曳提示遮罩：平時 display:none（CSS 保證不遮擋點擊），
    // 只有真正拖入「檔案」時才顯示。離開 / 放下 / 按 Esc 立即隱藏。
    const overlay = $('#window-drop-overlay');
    let dragCounter = 0;

    const hasFiles = (e) => {
      try {
        const dt = e && e.dataTransfer;
        if (!dt) return false;
        if (dt.types) {
          if (typeof dt.types.includes === 'function') return dt.types.includes('Files');
          // Safari 舊版 DataTransfer.types 可能是 DOMStringList
          for (let i = 0; i < dt.types.length; i++) {
            if (dt.types[i] === 'Files') return true;
          }
        }
        return false;
      } catch (_) { return false; }
    };
    const showOverlay = () => { if (overlay) overlay.classList.add('is-active'); };
    const hideOverlay = () => {
      dragCounter = 0;
      if (overlay) overlay.classList.remove('is-active');
    };

    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter++;
      showOverlay();
    });

    window.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        try { e.dataTransfer.dropEffect = 'copy'; } catch (_) {}
      }
      if (overlay && !overlay.classList.contains('is-active')) {
        showOverlay();
      }
    });

    window.addEventListener('dragleave', (e) => {
      // 只有離開視窗本體才遞減，避免子元素間移動誤觸
      if (e.target === document || e.target === document.documentElement) {
        dragCounter = 0;
        if (overlay) overlay.classList.remove('is-active');
        return;
      }
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        if (overlay) overlay.classList.remove('is-active');
      }
    });

    // Esc 立即關閉遮罩，避免卡住
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideOverlay();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (overlay) overlay.classList.remove('is-active');
      const dt = e.dataTransfer;
      const f = dt && dt.files && dt.files[0];
      if (!f) return;
      handleUniversalFile(f);
    });
    });

    // 頁首即時小結：點一下回到「畢業結論」
    safe('頁首小結', () => {
      const barV = $('#appbar-verdict');
      if (barV) {
        barV.setAttribute('role', 'button');
        barV.setAttribute('tabindex', '0');
        barV.setAttribute('title', '回到畢業結論');
        const goTop = () => $('#verdict').scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
        barV.addEventListener('click', goTop);
        barV.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTop(); }
        });
      }
    });

    safe('首次試算', () => {
      setupMotion();   // 先決定動效模式，再畫第一次狀態
      update();
      inited = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try { init(); } catch (err) { reportErrorToUI('啟動失敗：' + (err && err.message ? err.message : err)); }
    });
  } else {
    try { init(); } catch (err) { reportErrorToUI('啟動失敗：' + (err && err.message ? err.message : err)); }
  }
})();
