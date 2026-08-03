/*
 * 亞洲大學 資訊傳播學系 · 112 學年度課綱畢業審查資料
 * ------------------------------------------------------------------
 * 這是「通用」資料模型，不含任何個人成績或身分資料。
 * 使用者的勾選狀態只會存在自己瀏覽器的 localStorage，不會上傳。
 *
 * 資料來源：112 學年入學資傳系課程架構表（院核心 / 系核心 /
 * 主修學程二選一 / 校定必修通識 / 自由選修）。
 * 課程代碼（code）僅用於「貼上成績單自動勾選」時的比對，
 * 缺代碼時會退回以「課程名稱」比對，因此非必填。
 */

const CURRICULUM = {
  meta: {
    dept: '資訊傳播學系',
    cohort: '112 學年入學',
    totalRequired: 128,
    // 各分類的畢業應修學分（合計 128）
    // 院核心 9 + 系核心 39 + 主修學程 27 + 校定必修通識 30 + 自由選修 23 = 128
    updated: '112 課綱',
  },

  /* 資訊學院 院核心：9 學分 */
  collegeCore: {
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
  deptCore: {
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
  major: {
    id: 'major',
    title: '主修學程（二選一）',
    required: 27,
    kind: 'choice',
    note: '智慧傳播應用學程 與 新媒體傳播內容學程 擇一修滿 27 學分。',
    // offset：智慧學程課程可折抵新媒體學程（依系上規定，建議向系辦確認）
    offset: {
      from: 'smart',
      to: 'newmedia',
      label: '智慧學程課程折抵新媒體學程',
      note: '選新媒體為主修時，已修過的智慧學程課程可計入 27 學分（此折抵規則建議向系辦確認）。',
    },
    options: {
      newmedia: {
        id: 'newmedia',
        label: '新媒體傳播內容學程',
        required: 27,
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
      smart: {
        id: 'smart',
        label: '智慧傳播應用學程',
        required: 27,
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
    },
  },

  /* 校定必修 · 通識共同：30 學分（因人而異，採學分數輸入） */
  general: {
    id: 'general',
    title: '校定必修 · 通識共同',
    required: 30,
    kind: 'credits',
    note: '含共通英語文、專業英語文、中文、體育、服務學習、通識選修等。每人修課不同，請從成績單加總後填入已通過學分。',
    hints: [
      '共通英語文(一)(二)、共通專業英語文',
      '中文（中文表達與應用等）',
      '設計思考與創新、資訊科技概論類',
      '體育(一)～(四)（0 學分，需通過）',
      '通識博雅選修',
    ],
  },

  /* 自由選修：補足畢業總學分至 128（含超修之學程課程、實習等） */
  free: {
    id: 'free',
    title: '自由選修 · 其他',
    required: 23, // 128 - (9 + 39 + 27 + 30)
    kind: 'credits',
    note: '補足畢業總學分至 128。超修的學程課程、系上選修（如專業實習、廣告企劃實務等）都算在這裡。',
  },

  /* 畢業門檻檢定：通過 / 未通過（不計學分，但沒過不能畢業） */
  thresholds: [
    { id: 'chinese', label: '中文能力檢定', note: '可由指定課程或檢定通過抵免。' },
    { id: 'english', label: '英文能力檢定', note: '共通英語文 / 外語能力檢定。' },
    { id: 'info', label: '資訊能力檢定', note: '資訊應用能力相關檢定。' },
    { id: 'service', label: '服務學習 / 勞作教育', note: '可由永續發展與實踐等課程抵免。' },
    { id: 'pe', label: '體育（四學期）', note: '體育(一)～(四) 皆需通過。' },
  ],
};

// 讓 app.js 取用；同時保留全域變數方便直接開檔測試。
if (typeof window !== 'undefined') {
  window.CURRICULUM = CURRICULUM;
}
