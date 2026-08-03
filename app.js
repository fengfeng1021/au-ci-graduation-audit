/* =====================================================================
   資傳系畢業審查工具 · 邏輯與動效
   ---------------------------------------------------------------------
   設計原則（呼應 impeccable Operate 模式）：
   - 回饋要快；只保留一個「作者級」主場景 = 畢業結論的達標時刻。
   - 每個「物件型別」的動效寫成一個可重用函式（meter / number /
     check / accordion / celebrate），全站以 class 統一套用，不逐一調。
   - 尊重 prefers-reduced-motion：改為即時、不做位移動畫。
   - 內容預設可見；就算 GSAP 載入失敗，資料與計算仍可運作。
   ===================================================================== */
(function () {
  'use strict';

  const C = window.CURRICULUM;
  const STORE_KEY = 'au-ci-audit-v1';
  const TOTAL = C.meta.totalRequired; // 128
  const hasGSAP = typeof window.gsap !== 'undefined';
  const prefersReduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = hasGSAP && !prefersReduced;

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

  /* =====================================================================
     狀態（存 localStorage；只在本機）
     ===================================================================== */
  const state = load() || {
    checked: {},          // { key: true }
    major: 'newmedia',    // 'newmedia' | 'smart'
    offset: true,         // 智慧折抵新媒體
    general: 0,           // 校定必修·通識 已通過學分
    free: 0,              // 自由選修·其他 已通過學分
    thresholds: {},       // { id: true }
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); }
    catch (e) { return null; }
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    }, 120);
  }

  /* =====================================================================
     可重用動效函式（每個物件型別一個）
     ===================================================================== */
  function animMeter(fill, pct) {
    pct = clamp(0, 100, pct);
    if (!motion) { fill.style.width = pct + '%'; return; }
    gsap.to(fill, { width: pct + '%', duration: 0.7, ease: 'power3.out', overwrite: 'auto' });
  }

  function animNumber(node, to) {
    const from = parseFloat(node.dataset.val || '0');
    node.dataset.val = String(to);
    if (node._numTween) { node._numTween.kill(); node._numTween = null; } // 避免快速連點時多個 tween 競爭
    if (!motion || from === to) { node.textContent = String(to); return; }
    const o = { v: from };
    node._numTween = gsap.to(o, {
      v: to, duration: 0.6, ease: 'power2.out',
      onUpdate: () => { node.textContent = String(Math.round(o.v)); },
      onComplete: () => { node.textContent = String(to); node._numTween = null; },
    });
  }

  function animCheck(box, on) {
    if (!motion || !on) return;
    const path = box.querySelector('path');
    if (path && path.getTotalLength) {
      const len = path.getTotalLength();
      gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' });
    }
    gsap.fromTo(box, { scale: 0.82 }, { scale: 1, duration: 0.3, ease: 'back.out(2.2)' });
  }

  function animAccordion(card, open) {
    const body = $('.card__body, .import__body', card);
    if (!body) return;
    if (!motion) { body.style.height = open ? 'auto' : '0px'; return; }
    if (open) {
      gsap.set(body, { height: 'auto' });
      const h = body.offsetHeight;
      gsap.fromTo(body, { height: 0 }, {
        height: h, duration: 0.4, ease: 'power3.out',
        onComplete: () => { body.style.height = 'auto'; },
      });
    } else {
      gsap.to(body, { height: 0, duration: 0.32, ease: 'power3.inOut' });
    }
  }

  /* 作者級主場景：達標的那一刻只演一次 */
  let wasGo = false;
  function celebrate(stateEl) {
    if (!motion) return;
    gsap.fromTo(stateEl, { scale: 0.9 }, { scale: 1, duration: 0.55, ease: 'back.out(1.7)' });
    const p = stateEl.querySelector('path');
    if (p && p.getTotalLength) {
      const l = p.getTotalLength();
      gsap.fromTo(p, { strokeDasharray: l, strokeDashoffset: l },
        { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' });
    }
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

  /* 全必修類清單：一鍵列 + 課程列 */
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
      el('div', { class: 'card__progress' }, countEl, el('div', { class: 'sub-meter' }, meterEl)),
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

  /* 主修學程卡：分段控制 + 折抵開關 + 動態清單 */
  function majorCard() {
    const cfg = C.major;
    const bodyMount = el('div');

    const seg = el('div', { class: 'segmented', role: 'group', 'aria-label': '主修學程' },
      ['newmedia', 'smart'].map((k) => {
        const b = el('button', {
          class: 'segmented__btn', type: 'button',
          'aria-pressed': String(state.major === k),
          onClick: () => {
            if (state.major === k) return;
            state.major = k;
            $$('.segmented__btn', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            renderMajorBody(bodyMount);
            save(); update();
          },
        }, cfg.options[k].label);
        return b;
      }));

    const controls = el('div', { class: 'major-controls' }, seg);
    const bodyNode = el('div', {}, controls, bodyMount);
    const wrap = card(cfg.id, cfg.title, cfg.note, bodyNode);
    renderMajorBody(bodyMount);
    return wrap;
  }

  function renderMajorBody(mount) {
    mount.innerHTML = '';
    const cfg = C.major;
    const opt = cfg.options[state.major];
    const otherKey = state.major === 'newmedia' ? 'smart' : 'newmedia';
    const other = cfg.options[otherKey];

    // 主修學程本身的課
    mount.append(
      bulkToggle('major-' + opt.id, opt.courses),
      courseList('major-' + opt.id, opt.courses));

    // 折抵：另一個學程的課可計入主修（雙向，方向跟著主修走）
    const sw = el('input', { type: 'checkbox' });
    sw.checked = !!state.offset;
    sw.addEventListener('change', () => {
      state.offset = sw.checked;
      offsetList.hidden = !sw.checked;
      save(); update();
    });
    const offsetRow = el('label', { class: 'offset-row switch' },
      el('span', { class: 'switch' }, sw,
        el('span', { class: 'switch__track' }, el('span', { class: 'switch__thumb' }))),
      el('span', {},
        el('span', { class: 'switch__label' }, '用「' + other.label + '」的課折抵主修'),
        el('span', { class: 'offset-note' }, cfg.offset.note)));

    const offsetList = el('div', {},
      el('div', { class: 'card__note', style: 'border-top:none;padding-bottom:.25rem' },
        '以下是「' + other.label + '」的課程，勾選你修過的即可折抵主修學分：'),
      bulkToggle('major-' + other.id, other.courses),
      courseList('major-' + other.id, other.courses));
    offsetList.hidden = !state.offset;

    mount.append(el('div', { class: 'card__note' }, offsetRow), offsetList);
  }

  /* 學分數輸入卡（校定必修 / 自由選修） */
  function creditsCard(cfg, prop) {
    const body = el('div', {},
      el('div', { class: 'credit-input' },
        el('label', { for: cfg.id + '-num' }, '已通過學分'),
        stepper(() => state[prop], (v) => { state[prop] = v; save(); update(); }, 0, 200)),
      cfg.hints
        ? el('div', { class: 'credit-hints' }, '通常包含：',
            el('ul', {}, cfg.hints.map((h) => el('li', {}, h))))
        : null);
    return card(cfg.id, cfg.title, cfg.note, body);
  }

  /* 門檻檢定 */
  function thresholdCard(t) {
    const input = el('input', { type: 'checkbox', 'aria-label': t.label });
    input.checked = !!state.thresholds[t.id];
    const row = el('label', { class: 'threshold', 'data-pass': String(input.checked) },
      el('span', { class: 'check' }, input, el('span', { class: 'check__box' }, icon('i-check'))),
      el('span', { class: 'threshold__label' }, t.label,
        el('span', { class: 'threshold__note' }, t.note)));
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
    return courses.reduce((s, c) => s + (state.checked[ckey(listId, c)] ? c.cr : 0), 0);
  }

  function compute() {
    const collegeCr = sumChecked('college-core', C.collegeCore.courses);
    const deptCr = sumChecked('dept-core', C.deptCore.courses);
    // 折抵方向跟著主修走：主修之外「另一個學程」的課，可計入主修 27 學分
    const otherKey = state.major === 'newmedia' ? 'smart' : 'newmedia';
    const majorOpt = C.major.options[state.major];
    const majorMain = sumChecked('major-' + state.major, majorOpt.courses);
    const offsetActive = !!state.offset;
    const offsetCr = offsetActive
      ? sumChecked('major-' + otherKey, C.major.options[otherKey].courses) : 0;
    const majorProg = majorMain + offsetCr;

    // 計入畢業總分時，主修學程最多採計應修的 27 學分；超修部分請改計入自由選修，
    // 避免把超修的學程課重複灌進總學分而誤判「可以畢業」。
    const majorForTotal = Math.min(majorProg, C.major.required);
    const courseTotal = collegeCr + deptCr + majorForTotal;
    const total = courseTotal + state.general + state.free;

    const thrPass = C.thresholds.filter((t) => state.thresholds[t.id]).length;
    const thrAll = thrPass === C.thresholds.length;

    const hardMet =
      collegeCr >= C.collegeCore.required &&
      deptCr >= C.deptCore.required &&
      majorProg >= C.major.required;

    return {
      collegeCr, deptCr, majorMain, offsetCr, majorProg, total,
      thrPass, thrAll, hardMet,
      cats: {
        'college-core': { cur: collegeCr, req: C.collegeCore.required },
        'dept-core': { cur: deptCr, req: C.deptCore.required },
        major: { cur: majorProg, req: C.major.required },
        general: { cur: state.general, req: C.general.required },
        free: { cur: state.free, req: C.free.required },
      },
    };
  }

  function setCard(id, cur, req) {
    const countEl = $('[data-count="' + id + '"]');
    const meterEl = $('[data-meter="' + id + '"]');
    if (!countEl) return;
    countEl.innerHTML = '';
    const met = cur >= req;
    countEl.append(el('span', { class: 'tnum', style: met ? 'color:var(--go-strong)' : '' }, String(cur)),
      el('span', { class: 'tnum' }, ' / ' + req + ' 學分'));
    if (id === 'major' && cur > req) {
      countEl.append(el('span', { class: 'over-hint' }, '超修 ' + (cur - req) + '，計入自由選修'));
    }
    animMeter(meterEl, (cur / req) * 100);
    const cardEl = countEl.closest('.card');
    if (cardEl) cardEl.setAttribute('data-met', String(met));
  }

  /* 分類中文標籤（給「還缺什麼」用） */
  const CAT_LABEL = {
    'college-core': '院核心', 'dept-core': '系核心', major: '主修學程',
    general: '通識', free: '自由選修',
  };
  /* 還缺什麼：把未達標分類與未過門檻切成 chip，直接回答「還差什麼」 */
  function renderBreakdown(r, vstate) {
    const bd = $('#verdict-breakdown');
    if (!bd) return;
    bd.innerHTML = '';
    if (vstate === 'go') {
      bd.append(el('span', { class: 'gap-chip gap-chip--done' }, icon('i-check'), '所有分類與門檻都已達標'));
      return;
    }
    const chips = [];
    Object.keys(CAT_LABEL).forEach((id) => {
      const c = r.cats[id];
      if (c && c.cur < c.req) chips.push(
        el('span', { class: 'gap-chip' },
          el('span', {}, CAT_LABEL[id]),
          el('b', { class: 'tnum' }, '缺 ' + (c.req - c.cur))));
    });
    C.thresholds.forEach((t) => {
      if (!state.thresholds[t.id]) chips.push(
        el('span', { class: 'gap-chip gap-chip--thr' },
          el('span', {}, t.label), el('b', {}, '未過')));
    });
    if (!chips.length) {
      bd.append(el('span', { class: 'gap-chip gap-chip--done' }, icon('i-check'), '分類與門檻皆達標，確認總學分即可'));
    } else {
      chips.forEach((n) => bd.append(n));
    }
  }

  function update() {
    const r = compute();

    setCard('college-core', r.collegeCr, C.collegeCore.required);
    setCard('dept-core', r.deptCr, C.deptCore.required);
    setCard('major', r.majorProg, C.major.required);
    setCard('general', state.general, C.general.required);
    setCard('free', state.free, C.free.required);

    // 畢業結論
    const verdict = $('#verdict');
    let vstate, word, iconId;
    if (r.total >= TOTAL && r.hardMet && r.thrAll) {
      vstate = 'go'; word = '可以畢業'; iconId = 'i-check';
    } else if (r.total >= TOTAL && r.hardMet && !r.thrAll) {
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
    $('#verdict-thresholds').textContent = r.thrPass + ' / ' + C.thresholds.length;
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
    if (motion) {
      gsap.fromTo(t, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: 'power3.out' });
      gsap.to(t, { y: 8, autoAlpha: 0, duration: 0.4, delay: 2.6, ease: 'power2.in', onComplete: () => t.remove() });
    } else {
      setTimeout(() => t.remove(), 2600);
    }
  }

  /* =====================================================================
     貼上成績單自動勾選（純本機比對）
     ===================================================================== */
  const norm = (s) => (s || '')
    .replace(/\s+/g, '')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/／/g, '/')
    .toLowerCase();

  function allCourses() {
    const out = [];
    const push = (listId, courses) => courses.forEach((c) => out.push({ listId, c, key: ckey(listId, c) }));
    push('college-core', C.collegeCore.courses);
    push('dept-core', C.deptCore.courses);
    push('major-newmedia', C.major.options.newmedia.courses);
    push('major-smart', C.major.options.smart.courses);
    return out;
  }

  function looksPassed(line) {
    if (/停修|退選|撤選|未通過|不及格|未達|抵免不/.test(line)) return false;
    if (/及格|通過|抵免|pass|通過/i.test(line)) return true;
    const nums = (line.match(/\d{1,3}(?:\.\d+)?/g) || [])
      .map(Number).filter((n) => n >= 0 && n <= 100);
    if (nums.length) return Math.max(...nums) >= 60;
    return true; // 出現在成績單上、又無反向訊號 → 視為通過（使用者可再調整）
  }

  function runImport() {
    const text = $('#import-text').value || '';
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const idx = allCourses();
    const matchedKeys = new Set();
    const unmatched = [];

    lines.forEach((line) => {
      const nline = norm(line);
      let hit = null;
      // 先比代碼
      for (const item of idx) {
        if (item.c.code && nline.includes(item.c.code.toLowerCase())) { hit = item; break; }
      }
      // 再比名稱
      if (!hit) {
        for (const item of idx) {
          const nn = norm(item.c.name);
          if (nn.length >= 3 && nline.includes(nn)) { hit = item; break; }
        }
      }
      if (hit) {
        if (looksPassed(line)) matchedKeys.add(hit.key);
      } else if (looksPassed(line) && /[一-鿿]{2,}/.test(line)) {
        unmatched.push(line);
      }
    });

    // 套用勾選
    matchedKeys.forEach((k) => { state.checked[k] = true; });
    syncChecks();
    save(); update();

    const res = $('#import-result');
    res.className = 'import__result is-ok';
    res.textContent = '已比對並勾選 ' + matchedKeys.size + ' 門必修 / 學程課程。';

    const un = $('#import-unmatched');
    if (unmatched.length) {
      un.hidden = false;
      un.innerHTML = '';
      un.append(
        el('b', {}, '有 ' + unmatched.length + ' 筆沒對應到清單課程'),
        '（多半是通識、共同或自由選修）。請把這些學分自行加總後，填到「校定必修·通識」或「自由選修」欄位：',
        el('div', { style: 'margin-top:.5rem;color:var(--ink-3)' }, unmatched.slice(0, 12).join('　·　') + (unmatched.length > 12 ? ' …' : '')));
    } else {
      un.hidden = true;
    }
  }

  /* 依 state 同步所有 checkbox 的畫面（import / reset 用） */
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
     進場（只演一次，不做逐段捲動 reveal）
     ===================================================================== */
  function entrance() {
    if (!motion) return;
    gsap.from('.verdict', { y: 16, autoAlpha: 0, duration: 0.6, ease: 'power3.out' });
    gsap.from('#sections .section', {
      y: 14, autoAlpha: 0, duration: 0.5, ease: 'power3.out',
      stagger: { each: 0.06, from: 'start' }, delay: 0.08,
    });
  }

  /* =====================================================================
     初始化
     ===================================================================== */
  function init() {
    const mount = $('#sections');
    mount.append(
      card(C.collegeCore.id, C.collegeCore.title, C.collegeCore.note,
        checklistBody('college-core', C.collegeCore.courses)),
      card(C.deptCore.id, C.deptCore.title, C.deptCore.note,
        checklistBody('dept-core', C.deptCore.courses)),
      majorCard(),
      creditsCard(C.general, 'general'),
      creditsCard(C.free, 'free'));

    const thr = $('#thresholds');
    C.thresholds.forEach((t) => thr.append(thresholdCard(t)));

    // 折疊面板：確保展開內容可用 height 動畫
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
      const c = importCard.querySelector('.card__chevron');
      if (c) c.style.transform = open ? 'rotate(180deg)' : '';
      if (!motion) { importBody.style.height = open ? 'auto' : '0px'; return; }
      if (open) {
        gsap.set(importBody, { height: 'auto' });
        const h = importBody.offsetHeight;
        gsap.fromTo(importBody, { height: 0 }, { height: h, duration: 0.4, ease: 'power3.out', onComplete: () => { importBody.style.height = 'auto'; } });
      } else {
        gsap.to(importBody, { height: 0, duration: 0.32, ease: 'power3.inOut' });
      }
    });

    // Toolbar
    $('#btn-import-toggle').addEventListener('click', () => {
      if (importCard.getAttribute('data-open') !== 'true') $('#import-head').click();
      importCard.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => $('#import-text').focus(), 300);
    });
    $('#btn-import-run').addEventListener('click', runImport);
    $('#btn-print').addEventListener('click', () => window.print());
    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('確定要清空所有勾選與輸入嗎？此動作無法復原。')) return;
      state.checked = {}; state.major = 'newmedia'; state.offset = true;
      state.general = 0; state.free = 0; state.thresholds = {};
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    });

    // 頁首即時小結：點一下回到「畢業結論」（長頁面隨時看得到、回得去）
    const barV = $('#appbar-verdict');
    if (barV) {
      barV.setAttribute('role', 'button');
      barV.setAttribute('tabindex', '0');
      barV.setAttribute('title', '回到畢業結論');
      const goTop = () => $('#verdict').scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
      barV.addEventListener('click', goTop);
      barV.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTop(); }
      });
    }

    update();
    // 首次若已達標，不要放慶祝（避免每次開啟都跳）；用 update 後的 wasGo 已設定
    requestAnimationFrame(entrance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
