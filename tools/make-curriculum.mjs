#!/usr/bin/env node
/*
 * make-curriculum.mjs — 把課程規劃表轉成畢業審查工具用的課綱 JSON
 * ---------------------------------------------------------------------
 * 用法：
 *   node tools/make-curriculum.mjs 課表.txt  > 我的系.json
 *   node tools/make-curriculum.mjs 課規.pdf  > 我的系.json     （需要 pdftotext）
 *   node tools/make-curriculum.mjs --check 課規.pdf            （只檢查能不能抽出中文）
 *
 * 輸入的文字格式（和網站上「由課表文字產生」完全相同）：
 *   @meta 學校 | 系所 | 入學學年 | 畢業總學分
 *   @group 分類名稱 | 應修學分 | checklist|credits|choice
 *   @option 學程名稱                （只用在 choice 分類）
 *   @threshold 門檻名稱
 *   課號 課名 學分                  （課號可省略，空白或 Tab 分隔皆可）
 *
 * PDF 注意事項：
 *   很多學校的課程規劃表 PDF 沒有內嵌 ToUnicode 對照表，中文抽出來會是空的。
 *   本腳本會偵測這種情況並直接告訴你，請改用「網頁版課程規劃表」複製表格文字。
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, extname } from 'node:path';

const CJK = /[一-鿿]/g;

function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

/* ---------- 讀取來源文字 ---------- */
function readSource(file) {
  if (!existsSync(file)) die(`找不到檔案：${file}`);
  if (extname(file).toLowerCase() !== '.pdf') return readFileSync(file, 'utf8');

  let out = '';
  try {
    out = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    die('無法執行 pdftotext。請安裝 poppler-utils，或改用網頁版課表複製成 .txt 再轉。');
  }
  const cjk = (out.match(CJK) || []).length;
  if (cjk === 0) {
    die(
      `這個 PDF 抽不出中文（中文字元數 0）。\n` +
      `原因通常是 PDF 內嵌字型沒有 ToUnicode 對照表，文字複製出來是空的。\n\n` +
      `建議改用以下任一種方式：\n` +
      `  1. 到系上或教務處的「網頁版」課程規劃表，直接複製表格文字（最省事）\n` +
      `  2. 用支援中文 OCR 的工具（如 tesseract 加 chi_tra 語言包）先轉成文字\n` +
      `  3. 照上面的格式自己打一份（一門課一行，其實比想像中快）\n`
    );
  }
  process.stderr.write(`（PDF 抽出 ${cjk} 個中文字元）\n`);
  return out;
}

/* ---------- 解析（與網站端同一套規則） ---------- */
const toHalf = (s) =>
  (s || '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[　 ]/g, ' ');

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
  name = name.replace(/\t+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!name) return null;
  return { code, name, cr };
}

function parseCurriculumText(text, seed) {
  const cur = {
    meta: { id: '', school: '', dept: '', cohort: '', totalRequired: 0 },
    groups: [],
    thresholds: [],
  };
  let g = null, opt = null, n = 0;

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const at = line.match(/^@(\w+)\s*(.*)$/);
    if (at) {
      const cmd = at[1].toLowerCase();
      const p = at[2].split('|').map((s) => s.trim());
      if (cmd === 'meta') {
        cur.meta.school = p[0] || '';
        cur.meta.dept = p[1] || '';
        cur.meta.cohort = p[2] || '';
        cur.meta.totalRequired = parseInt(p[3], 10) || 0;
        cur.meta.id = 'custom-' + (seed || 'dept');
      } else if (cmd === 'group') {
        const kind = (p[2] || 'checklist').toLowerCase();
        g = { id: 'g' + ++n, title: p[0] || `分類 ${n}`, required: parseInt(p[1], 10) || 0, kind };
        if (kind === 'choice') { g.options = []; g.offsetNote = '折抵認定請以系辦為準。'; }
        else if (kind !== 'credits') g.courses = [];
        cur.groups.push(g);
        opt = null;
      } else if (cmd === 'option') {
        if (g && g.kind === 'choice') {
          opt = { id: 'o' + (g.options.length + 1), label: p[0] || `學程 ${g.options.length + 1}`, courses: [] };
          g.options.push(opt);
        }
      } else if (cmd === 'threshold') {
        cur.thresholds.push({ id: 't' + (cur.thresholds.length + 1), label: p[0] || '門檻', note: p[1] || '' });
      }
      continue;
    }

    const c = parseCourseLine(line);
    if (!c || !g) continue;
    if (g.kind === 'choice') { if (opt) opt.courses.push(c); }
    else if (g.kind !== 'credits') g.courses.push(c);
  }
  return cur;
}

/* ---------- 檢查 ---------- */
function validate(cur) {
  const errs = [];
  if (!cur.meta.id) errs.push('缺少 @meta 那一行');
  if (!cur.meta.totalRequired) errs.push('@meta 的畢業總學分沒填或不是數字');
  if (!cur.groups.length) errs.push('沒有任何 @group 分類');
  cur.groups.forEach((g) => {
    if (!g.required) errs.push(`分類「${g.title}」的應修學分沒填`);
    if (g.kind === 'choice' && (!g.options || !g.options.length))
      errs.push(`分類「${g.title}」是 choice，但底下沒有 @option`);
    if (g.kind === 'checklist' && (!g.courses || !g.courses.length))
      errs.push(`分類「${g.title}」是 checklist，但底下沒有任何課程`);
  });
  const sum = cur.groups.reduce((s, g) => s + (g.required || 0), 0);
  if (cur.meta.totalRequired && sum !== cur.meta.totalRequired)
    errs.push(`各分類應修學分加總 ${sum}，與畢業總學分 ${cur.meta.totalRequired} 不符`);
  return errs;
}

/* ---------- 主流程 ---------- */
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  die(
    '用法：node tools/make-curriculum.mjs <課表.txt 或 課規.pdf> > 我的系.json\n' +
    '      node tools/make-curriculum.mjs --check <課規.pdf>\n\n' +
    '格式說明請看本檔開頭的註解，或網站上「換一份課綱」面板裡的說明。'
  );
}

const text = readSource(file);

if (checkOnly) {
  const cjk = (text.match(CJK) || []).length;
  process.stderr.write(`可抽出中文字元：${cjk}\n`);
  process.stderr.write(cjk ? '看起來可以轉換。\n' : '抽不出中文，請改用網頁版課表。\n');
  process.exit(cjk ? 0 : 2);
}

const seed = basename(file).replace(/\.[^.]+$/, '').replace(/[^\w一-鿿-]/g, '').slice(0, 24);
const cur = parseCurriculumText(text, seed);
const errs = validate(cur);

if (errs.length) {
  process.stderr.write('課綱還不能用，請先修正：\n');
  errs.forEach((e) => process.stderr.write('  - ' + e + '\n'));
  process.stderr.write('\n目前解析到：\n');
  cur.groups.forEach((g) => {
    const n = g.kind === 'choice'
      ? g.options.reduce((s, o) => s + o.courses.length, 0)
      : (g.courses ? g.courses.length : 0);
    process.stderr.write(`  ${g.title}（${g.kind}）應修 ${g.required}，${g.kind === 'credits' ? '填學分' : n + ' 門'}\n`);
  });
  process.exit(1);
}

process.stderr.write('轉換完成：\n');
cur.groups.forEach((g) => {
  const n = g.kind === 'choice'
    ? g.options.reduce((s, o) => s + o.courses.length, 0)
    : (g.courses ? g.courses.length : 0);
  process.stderr.write(`  ${g.title}（${g.kind}）應修 ${g.required}，${g.kind === 'credits' ? '填學分' : n + ' 門'}\n`);
});
process.stderr.write(`  門檻 ${cur.thresholds.length} 項\n\n把輸出的 JSON 在網站「換一份課綱」面板匯入即可。\n`);

process.stdout.write(JSON.stringify(cur, null, 2) + '\n');
