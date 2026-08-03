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

  const userCurricula = readJSON(REG_KEY, {});
  const registry = Object.assign({}, window.CURRICULA || {}, userCurricula);

  function pickCurriculum() {
    const want = localStorage.getItem(SEL_KEY);
    if (want && registry[want]) return registry[want];
    return window.CURRICULUM || registry[Object.keys(registry)[0]];
  }

  const C = pickCurriculum();
  if (!C) return; // 沒有任何課綱可用

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

  function migrate(saved) {
    const base = { checked: {}, choice: {}, offset: {}, credits: {}, thresholds: {} };
    if (!saved) { seedDefaults(base); return base; }
    const s = Object.assign(base, saved);
    s.checked = saved.checked || {};
    s.thresholds = saved.thresholds || {};
    s.choice = saved.choice || {};
    s.offset = saved.offset || {};
    s.credits = saved.credits || {};
    // 舊版單一 major / offset / general / free 的資料搬過來
    if (typeof saved.major === 'string') s.choice.major = saved.major;
    if (typeof saved.offset === 'boolean') s.offset.major = saved.offset;
    if (typeof saved.general === 'number') s.credits.general = saved.general;
    if (typeof saved.free === 'number') s.credits.free = saved.free;
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

  function stepper(get, set, min, max) {
    const input = el('input', { type: 'number', min: String(min), max: String(max), value: String(get()) });
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
    const label = others.length === 1
      ? '用「' + others[0].label + '」的課折抵主修'
      : '用其他學程的課折抵主修';
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

  /* 學分數輸入卡 */
  function creditsCard(g) {
    const body = el('div', {},
      el('div', { class: 'credit-input' },
        el('label', { for: g.id + '-num' }, '已通過學分'),
        stepper(() => state.credits[g.id] || 0,
          (v) => { state.credits[g.id] = v; save(); update(); }, 0, 200)),
      g.hints
        ? el('div', { class: 'credit-hints' }, '通常包含：',
            el('ul', {}, g.hints.map((h) => el('li', {}, h))))
        : null);
    return card(g.id, g.title, g.note, body);
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
    const row = el('label', { class: 'threshold', 'data-pass': String(input.checked) },
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
    if (g.kind === 'credits') return state.credits[g.id] || 0;
    if (g.kind === 'choice') {
      const sel = selectedOption(g);
      const main = sumChecked(optListId(g, sel), sel.courses);
      const off = state.offset[g.id]
        ? g.options.filter((o) => o.id !== sel.id)
            .reduce((s, o) => s + sumChecked(optListId(g, o), o.courses), 0)
        : 0;
      return main + off;
    }
    return sumChecked(g.id, g.courses);
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
      countEl.append(el('span', { class: 'over-hint' }, '超修 ' + (cur - req) + '，計入自由選修'));
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

  /* =====================================================================
     文字正規化（成績單與課綱解析共用）
     ===================================================================== */
  const toHalf = (s) => (s || '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[　 ]/g, ' ');
  const norm = (s) => toHalf(s).replace(/\s+/g, '').toLowerCase();

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

    matchedKeys.forEach((k) => { state.checked[k] = true; });
    syncChecks();
    save(); update();

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
      if (input.checked !== on) {
        input.checked = on;
        row.setAttribute('data-checked', String(on));
        if (on) animCheck(row.querySelector('.check__box'), true);
      }
    });
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
        say(el('div', {}, el('b', {}, '課綱格式有問題，沒有匯入：'),
          el('ul', { style: 'margin:.4rem 0 0 1.1rem' }, r.errs.map((e) => el('li', {}, e)))), true);
        return;
      }
      say('課綱已匯入，正在切換…');
      setTimeout(() => location.reload(), 500);
    };

    $('#cur-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try { apply(JSON.parse(fr.result)); }
        catch (err) { say('這個檔案不是有效的 JSON：' + err.message, true); }
      };
      fr.readAsText(f, 'utf-8');
    });

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
  function init() {
    // 頁面標題與說明跟著課綱走
    const m = C.meta || {};
    const t = [m.dept, m.cohort].filter(Boolean).join(' · ');
    document.title = (m.dept || '畢業審查') + ' 畢業審查工具';
    const bt = $('#appbar-title');
    if (bt) bt.textContent = t || '畢業審查';
    const im = $('#intro-meta');
    if (im) im.textContent = (t || '課綱') + '適用';

    const mount = $('#sections');
    GROUPS.forEach((g) => mount.append(groupCard(g)));

    const thr = $('#thresholds');
    if (THRESHOLDS.length) THRESHOLDS.forEach((x) => thr.append(thresholdCard(x)));
    else $('#thresholds-title').hidden = true;

    $$('.card__body, .import__body').forEach((b) => { b.style.overflow = 'hidden'; });

    // Import 面板預設收合
    const importCard = $('#import');
    const importBody = $('#import-body');
    importBody.style.height = '0px';
    importBody.style.overflow = 'hidden';
    $('#import-head').addEventListener('click', () => {
      const open = importCard.getAttribute('data-open') !== 'true';
      importCard.setAttribute('data-open', String(open));
      $('#import-head').setAttribute('aria-expanded', String(open));
      animAccordion(importCard, open);
    });

    // 課綱面板預設收合
    const curBody = $('#cur-panel-body');
    if (curBody) { curBody.style.height = '0px'; curBody.style.overflow = 'hidden'; }

    // Toolbar
    $('#btn-import-toggle').addEventListener('click', () => {
      if (importCard.getAttribute('data-open') !== 'true') $('#import-head').click();
      importCard.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => $('#import-text').focus(), 300);
    });
    $('#btn-import-run').addEventListener('click', runImport);
    $('#btn-print').addEventListener('click', () => window.print());
    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('確定要清空所有勾選與輸入嗎？此動作無法復原。')) return;
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    });

    // 頁首即時小結：點一下回到「畢業結論」
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

    renderCurriculumBar();
    setupCurriculumPanel();

    setupMotion();   // 先決定動效模式，再畫第一次狀態
    update();
    inited = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
