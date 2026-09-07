/*
 * 畢業審查工具 · 課綱資料
 * ------------------------------------------------------------------
 * 這是「通用」資料模型，不含任何個人成績或身分資料。
 * 使用者的勾選狀態只會存在自己瀏覽器的 localStorage，不會上傳。
 *
 * ── 課綱格式（其他系所照這個格式寫，就能直接套用本工具）──────────
 * {
 *   meta: { id, school, dept, cohort, totalRequired },
 *   groups: [
 *     { id, title, required, kind: 'checklist', note, courses:[{code,name,cr}] },
 *     { id, title, required, kind: 'choice',    note, offsetNote,
 *       options:[{ id, label, courses:[...] }] },      // 擇一修滿；其餘學程的課可折抵
 *     { id, title, required, kind: 'credits',   note, hints:[...] },  // 由使用者填學分數
 *   ],
 *   thresholds: [{ id, label, note }]                  // 不計學分的畢業門檻
 * }
 * groups 的 required 加總 = meta.totalRequired。
 * kind 的意思：checklist = 逐門勾選；choice = 學程二選一；credits = 直接填學分。
 * 課號（code）只用於「貼上成績單自動勾選」的比對，沒有也可以，會退回用課名比對。
 */

const CURRICULUM = {
  meta: {
    id: 'au-ci-112',
    school: '亞洲大學',
    dept: '資訊傳播學系',
    cohort: '112 學年入學',
    totalRequired: 128,
    updated: '112 課綱',
  },

  groups: [
    /* 資訊學院 院核心：9 學分 */
    {
      id: 'college-core',
      title: '資訊學院 · 院核心',
      required: 9,
      kind: 'checklist',
      note: '全院共同必修，7 門合計 9 學分，每一門都要修過。',
      courses: [
        { code: 'ES300208', name: '基礎程式設計(一)', cr: 1 },
        { code: 'ES300209', name: '基礎程式設計(二)', cr: 1 },
        { code: 'ES300210', name: '基礎程式設計(三)', cr: 1 },
        { code: 'EP300355', name: '人工智慧與雲端應用', cr: 3 },
        { code: 'EP300176', name: '畢業專題(一)', cr: 1 },
        { code: '', name: '畢業專題(二)', cr: 1 },
        { code: '', name: '資訊研討', cr: 1 },
      ],
    },

    /* 系核心必修：39 學分（14 門） */
    {
      id: 'dept-core',
      title: '資傳系 · 系核心必修',
      required: 39,
      kind: 'checklist',
      note: '系上共同必修，14 門合計 39 學分，全部都要修過。',
      courses: [
        { code: '', name: '電腦繪圖', cr: 3 },
        { code: 'EP300356', name: '新媒體內容技術與設計', cr: 2 },
        { code: 'EP300334', name: '平面影像設計', cr: 3 },
        { code: '', name: '智慧傳播應用實務', cr: 3 },
        { code: '', name: '網頁設計與數位敘事', cr: 3 },
        { code: 'EP300336', name: '動態攝影與剪輯', cr: 3 },
        { code: 'EP300317', name: 'Unity 多媒體應用', cr: 3 },
        { code: 'EP300358', name: '媒體數據分析', cr: 3 },
        { code: 'EP300232', name: '網路媒體與社群分析', cr: 3 },
        { code: 'EP300320', name: 'AR/VR 應用實務', cr: 3 },
        { code: 'EP300053', name: '傳播倫理與法規', cr: 3 },
        { code: 'EP300359', name: '3D 與虛擬攝影棚應用', cr: 3 },
        { code: 'EP300054', name: '傳播理論', cr: 3 },
        { code: '', name: '畢業展演', cr: 1 },
      ],
    },

    /* 主修學程二選一：任選一學程修滿 27 學分 */
    {
      id: 'major',
      title: '主修學程（二選一）',
      required: 27,
      kind: 'choice',
      note: '智慧傳播應用學程 與 新媒體傳播內容學程 擇一修滿 27 學分。',
      // 折抵方向跟著「主修」走：選定主修後，另一個學程已修過的課可計入主修學分。
      offsetNote: '折抵方向會跟著主修走：選新媒體，就用智慧學程的課折抵；選智慧，就用新媒體的課折抵。實際折抵請以系辦認定為準。',
      options: [
        {
          id: 'newmedia',
          label: '新媒體傳播內容學程',
          courses: [
            { code: 'EP300329', name: '傳播敘事與劇本創作', cr: 2 },
            { code: 'EP300368', name: '紀錄片製作', cr: 3 },
            { code: 'EP300347', name: '影音製作技術', cr: 3 },
            { code: 'EP300369', name: '影音傳播資料庫製作與應用', cr: 3 },
            { code: 'EP300271', name: '製片實務', cr: 3 },
            { code: '', name: '影音虛實整合', cr: 3 },
            { code: 'EP300371', name: '互動裝置媒體應用', cr: 2 },
            { code: 'EP300372', name: '影音特效實務', cr: 3 },
            { code: 'EP300373', name: '劇情短片製作', cr: 3 },
            { code: '', name: '數位創作與行銷', cr: 2 },
          ],
        },
        {
          id: 'smart',
          label: '智慧傳播應用學程',
          courses: [
            { code: '', name: '新聞採訪與寫作', cr: 3 },
            { code: '', name: '情感感知應用（Smart IoT）', cr: 3 },
            { code: 'EP300361', name: '資訊視覺化', cr: 3 },
            { code: '', name: '智慧媒體分析與行銷傳播應用', cr: 3 },
            { code: '', name: '新聞攝影與剪輯', cr: 3 },
            { code: '', name: '媒體傳播資料庫製作與應用', cr: 3 },
            { code: '', name: '網路訊息檢索與分析', cr: 3 },
            { code: '', name: '知識性節目製作', cr: 3 },
            { code: '', name: '網路新聞平台應用實務', cr: 3 },
          ],
        },
      ],
    },

    /* 校定必修：30 學分 = 語文通識 16 + 核心通識 8 + 博雅通識 6（因人而異，採學分數輸入） */
    {
      id: 'general',
      title: '校定必修 · 通識共同',
      required: 30,
      kind: 'credits',
      note: '語文通識 16（中文 4、英文 8、程式 4）＋核心通識 8（健康、歷史、法律、藝術三選一/二選一）＋博雅通識 6（人文、社會、自然、生活四類，資訊學院免修自然類）。每人修課不同，請從成績單加總後填入已通過學分。',
      hints: [
        '共通英語文(一)(二)、共通專業英語文（科技英文等）',
        '中文（文學賞析、文學與生活等）',
        '設計思考與創新、資訊科技概論類',
        '體育(一)～(四)（0 學分，需通過）',
        '博雅通識（人文/社會/自然/生活，資訊學院免修自然類，共 6 學分）',
      ],
    },

    /* 他系專長／跨領域學程：15 學分（註五：主修之外另需他系專長學程、跨領域學程或次專長） */
    {
      id: 'external',
      title: '他系專長／跨領域學程',
      required: 15,
      kind: 'credits',
      note: '本系主修學程之外，另需他系專長學程、跨領域學程或次專長（約 15 學分）。每人選擇不同，請填入已通過學分；跨領域學分數不同者，多退少補進自由選修。',
      hints: [
        '他系專長學程約 15 學分',
        '跨領域學程（學分數依各學程規定）',
        '次專長',
      ],
    },

    /* 自由選修：不足 128 學分時，從本系另一非主修學程或自由選修補足（註五） */
    {
      id: 'free',
      title: '自由選修 · 其他',
      required: 8, // 128 - (9 + 39 + 27 + 30 + 15)
      kind: 'credits',
      note: '不足畢業學分時，從本系另一非主修學程或自由選修補足（註五）。超修的學程課程、系上選修（如專業實習、廣告企劃實務等）都算在這裡。',
    },
  ],

  /* 畢業門檻檢定：通過 / 未通過（不計學分，但沒過不能畢業） */
  thresholds: [
    { id: 'chinese', label: '中文能力檢定', note: '可由指定課程或檢定通過抵免。' },
    { id: 'english', label: '英文能力檢定', note: '共通英語文 / 外語能力檢定。' },
    { id: 'info', label: '資訊能力檢定', note: '資訊應用能力相關檢定。' },
    { id: 'service', label: '服務學習 / 勞作教育', note: '可由永續發展與實踐等課程抵免。' },
    { id: 'pe', label: '體育（四學期）', note: '體育(一)～(四) 皆需通過。' },
  ],
};

/* 課綱註冊表：其他系所的課綱也註冊到這裡，網站上就能直接切換。
   使用者自行匯入的課綱存在 localStorage，由 app.js 合併進來。 */
if (typeof window !== 'undefined') {
  window.CURRICULA = window.CURRICULA || {};
  window.CURRICULA[CURRICULUM.meta.id] = CURRICULUM;
  window.CURRICULUM = CURRICULUM; // 預設課綱
}
