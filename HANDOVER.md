# 亞洲大學資訊傳播學系畢業學分審查工具 — 專案交接文檔 (Handover Document)

> **致接手的 Agent**：  
> 本文檔已將使用者的所有原始需求、目前專案架構、程式碼現況、以及當前使用者回報「點擊都無效了」的深層核心問題與具體處置指南完整彙整，請務必詳閱後接續進行修復與交付。

---

## 1. 使用者原始需求清單 (User Requirements)

1. **基本功能**：
   - 亞洲大學資訊傳播學系（及支援其他系所課綱）畢業學分檢核工具。
   - 依照 112 學年度課綱（128 畢業總學分，包含院核心、系核心、專業主修學程、通識、自由選修及門檻檢定）。
   - 純前端靜態網頁，資料存於瀏覽器 `localStorage`，保障隱私不外傳。
   - 部署於 GitHub Pages：[https://fengfeng1021.github.io/au-ci-graduation-audit/](https://fengfeng1021.github.io/au-ci-graduation-audit/)。

2. **成績單 Excel 匯入**：
   - 支援直接上傳或拖曳校務系統匯出的歷年成績單：`D:\Downloads\汪俊鋒成績列印.xlsx`。
   - 自動過濾停修、不及格、重修，僅採計通過科目。
   - 自動勾選核心必修與學程課程，並自動加總「通識共同」與「自由選修」學分。
   - 自動標記體育、服務學習、資訊能力、英文能力等門檻。

3. **課綱 PDF / ODT 匯入**：
   - 支援直接上傳或拖曳學校課規查詢匯出的課綱檔案：
     - ODT 課綱：`D:\Downloads\553702574.odt`
     - PDF 課綱：`D:\Downloads\296353842.pdf`
   - 使用純前端函式庫（JSZip / PDF.js）解析表格，自動識別必修、選修、專業學程及應修學分。
   - 換課綱或匯入課綱時，**必須保留已匯入之學生成績單資料**，自動將已修及格科目比對至新課綱。

4. **4 年 8 學期建議修課規劃與學程切換、抵免**：
   - 提供大學 4 年 8 個學期（112-1 至 115-2）建議修課路線圖。
   - 依照建議課表修畢剛好可滿足 128 畢業學分要求。
   - **學程切換按鈕**：可切換不同學程（如「新媒體傳播內容學程」與「智慧傳播應用學程」），課表連動更新。
   - **修畢標記**：建議課表需明確標註該門課是否已經修畢（如「✔ 已修畢」或「⏳ 待修習」）。
   - **跨學程抵免按鈕**：可選擇拿不同學程的課抵免修習學程的門數（0、1、2、3、4 門），並在課表上標示「★ 跨學程抵免（由某課程抵免）」。

5. **使用者體驗與互動回饋（近期核心痛點）**：
   - 使用者反映：「無法把檔案放進去，點擊按鈕也沒辦法彈出選檔案的視窗」。
   - 使用者反映：「上傳檔案後沒有在網頁看到更新，完全沒反饋，甚至不知道有沒有成功上傳」。
   - 使用者最新回饋：「點擊都無效了把我要的要求跟現在問題跟專案整理，給下一個agent做」。

---

## 2. 當前問題剖析 (Current Issues & Root Causes)

雖然在無頭 Chrome CDP 測試中腳本能正常觸發，但**在真實使用者的實體瀏覽器環境中，使用者遇到「點擊都無效」**，經分析有以下高風險原因：

### 原因 A：全螢幕拖曳遮罩 `.window-drop-overlay` 的遮蔽問題（極高機率）
- **現狀**：
  在 `styles.css` 中，`.window-drop-overlay` 的樣式為：
  ```css
  .window-drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    ...
    opacity: 0;
    pointer-events: none !important;
  }
  ```
- **潛在問題**：
  1. 雖然設置了 `opacity: 0` 和 `pointer-events: none !important`，但在部分瀏覽器或特定縮放比例下，若 DOM 未設置 `display: none`，或者 `dragenter` / `dragover` 計數器因為滑鼠移動誤觸發了 `is-active`（透明度變 1），全螢幕的 fixed 遮罩會直接蓋在整個網頁上方。
  2. 如果任何 CSS 規則覆蓋了 `pointer-events`，這個全螢幕元素會直接把整個頁面所有的點擊事件全部吃掉！這完全吻合使用者說的**「點擊都無效了」**！
- **接手解決方案**：
  在非拖曳狀態下，**必須強制 `display: none !important;`**，僅在真正有檔案拖入視窗時才改為 `display: flex !important;`。離開或放下後立即恢復 `display: none`。

### 原因 B：使用 JavaScript `input.click()` 受到瀏覽器安全策略阻擋
- **現狀**：
  為了隱藏原生檔案輸入框，將 `<input type="file">` 藏在 `position: fixed; top: -9999px`，由 `<button>` 的 click 事件執行 `$('#excel-file-input').click()`。
- **潛在問題**：
  部分瀏覽器（尤其是有安裝安全外掛、或特定模式下的 Edge/Chrome）對於非原生直接點擊、或是對位置在視窗可視範圍外（`-9999px`）的 file input，會判定為不可信事件或禁止喚起檔案選擇器。
- **接手解決方案**：
  不要用透明隱藏+程式觸發！改用最穩健的原生做法：
  直接讓按鈕就是 `<label for="excel-file-input">`，且將 `<input type="file" id="excel-file-input" style="display:none">` 緊鄰放置在旁，完全走瀏覽器原生 HTML 關聯，無需任何 JS 轉發點擊。

### 原因 C：JavaScript 全域錯誤導致事件監聽中斷
- 若使用者本機的 `localStorage` 存有舊格式的殘留資料，或某個外部 CDN（如 GSAP、PDF.js）在使用者網路環境下被阻擋或拋出例外，可能導致 `init()` 在執行途中中斷，造成後續的按鈕監聽器全部未綁定成功。
- **接手解決方案**：
  1. 在 `app.js` 的 `init()` 及關鍵點加入全域 `try...catch` 與 `window.onerror` 視覺化報錯條。
  2. 頁面提供一個「強制重置快取 / 恢復預設」的緊急按鈕。

---

## 3. 專案環境與檔案結構 (Project Overview)

- **本機工作目錄**：`d:\Desktop\亞大畢業審查\audit-tool`
- **GitHub 儲存庫**：`https://github.com/fengfeng1021/au-ci-graduation-audit.git`（分支：`main`）
- **GitHub Pages 網址**：`https://fengfeng1021.github.io/au-ci-graduation-audit/`
- **本機測試檔案位置**：
  - 成績單：`D:\Downloads\汪俊鋒成績列印.xlsx`
  - 課綱 ODT：`D:\Downloads\553702574.odt`
  - 課綱 PDF：`D:\Downloads\296353842.pdf`

### 核心檔案清單

| 檔案路徑 | 說明 |
| :--- | :--- |
| `index.html` | 網頁骨架。包含頂部結論卡、工具列按鈕、即時上傳狀態列、成績單面板、課綱面板、8 學期建議規劃區。 |
| `styles.css` | 樣式表。色彩變數、進度條、卡片、拖曳區、toast、8 學期路線圖網格、全螢幕拖曳遮罩。 |
| `app.js` | 核心邏輯（約 2,700 行）。包含：<br>1. 學分試算 (`compute`, `update`)<br>2. Excel 解析 (`parseExcelWorkbook`, `applyExcelImport`)<br>3. ODT/PDF 課綱解析 (`parseCurriculumODT`, `parseCurriculumPDF`)<br>4. 8 學期課表與抵免邏輯 (`renderRoadmap`, `isCourseCompleted`)<br>5. 檔案路由與拖曳監聽 (`handleUniversalFile`, `bindDropzone`) |
| `curriculum.js` | 內建預設課綱資料（112 學年資訊傳播學系）。 |
| `xlsx.full.min.js` | 本地端 SheetJS 函式庫（離線解析 Excel）。 |
| `jszip.min.js` | 本地端 JSZip 函式庫（離線解壓 ODT content.xml）。 |
| `pdf.min.js` / `pdf.worker.min.js` | 本地端 PDF.js 函式庫（離線抽取 PDF 表格與文字）。 |

---

## 4. 給下一個 Agent 的具體重構與除錯指南 (Action Plan for Next Agent)

接手的 Agent 請依以下順序執行，切勿只看無頭瀏覽器的自動化通過，務必徹底根治使用者的點擊失效：

### 步驟 1：徹底根除遮罩遮蔽（立即解決「點擊都無效」）
- 檢查 `styles.css` 與 `app.js`：
  - 將 `#window-drop-overlay` 在 CSS 中預設設為 `display: none !important;`。
  - 只有在 `window` 的 `dragenter` 且 `e.dataTransfer.types.includes('Files')` 時，才將其設為 `display: flex !important;`。
  - 在 `dragleave`、`drop` 以及點擊遮罩任何位置時，一律立即還原為 `display: none !important;`。
  - 這樣能保證在平時 100% 不會有任何隱形圖層蓋在頁面按鈕上方。

### 步驟 2：改用原生最簡單可靠的 HTML 檔案選取（不依賴 JS `click()` 轉發）
- 在 `index.html` 中：
  ```html
  <!-- 方式：使用標準 label 包含 hidden input，或 label for 對應相鄰 input -->
  <label class="btn btn--primary" style="cursor: pointer;">
    <svg class="icon"><use href="#i-upload"/></svg> 選擇成績單 Excel
    <input type="file" id="excel-file-input" accept=".xlsx,.xls" style="display:none;" />
  </label>
  ```
  - 原生 `<label>` 包裹 `<input type="file" style="display:none">` 是所有作業系統與瀏覽器最高優先級的原生使用者手勢，絕不會被瀏覽器安全策略阻擋，點擊立即彈出系統選檔對話框。

### 步驟 3：在畫面加上視覺化除錯反饋列 (Visual Debug Bar)
- 使用者常遇到「沒有反饋，不知道有沒有成功上傳」。
- 在頁面頂部常駐一個小巧的狀態條，只要有任何點擊、拖曳、檔案載入、或 JS 錯誤，立即將狀態文字更新在畫面上（例如：「已接收到檔案：汪俊鋒成績列印.xlsx，正在解析...」或「解析完成，共 108 學分」）。
- 若發生 JS 例外，利用 `window.addEventListener('error', e => ...)` 直接將紅字顯示在該狀態條上，讓使用者即使沒開 F12 也能看見錯誤原因。

### 步驟 4：驗證與交付
- 使用本機檔案 `D:\Downloads\汪俊鋒成績列印.xlsx`、`D:\Downloads\553702574.odt`、`D:\Downloads\296353842.pdf` 進行測試。
- `git commit` 並 `git push origin main`。
- 確認 GitHub Pages 更新後交付。
