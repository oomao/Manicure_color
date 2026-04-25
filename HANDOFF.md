# HANDOFF — 給下一次接手的自己（或下一個 AI session）

這份文件目的：**讓任何人（包括之後的 Claude session）3 分鐘內掌握這個專案的結構、要改哪裡、有什麼陷阱。**

---

## 1. TL;DR

- 美甲調色 SPA，零框架、零 build、純前端。
- 三檔架構：`index.html` + `styles.css` + `app.js`，外加 mixbox.js（CDN）。
- 部署：GitHub Pages（`oomao/Manicure_color`），有 `.nojekyll`。
- 資料存 localStorage（key 已版本化），不上傳。
- 開發習慣：commit 不加 Claude 署名，email `csm088220@gmail.com`。

## 2. 檔案地圖

```
Chienze/
├── index.html        結構：4 個 view + 5 個 modal + tabbar
├── styles.css        樣式：CSS 變數 + 響應式 + Home Hero 動畫
├── app.js            邏輯：演算法 + 狀態 + DOM
├── README.md         對外說明
├── HANDOFF.md        本檔
├── plan.md           （歷史）基底色管理功能設計案
├── .nojekyll         GitHub Pages 開關
└── .gitignore        忽略個人參考圖片、IDE、.claude/
```

## 3. App 結構（views / modals / 全域常數）

### 4 個 view（在 `<main>` 裡）
1. `view-mix` — 調色（首頁）。**Home Hero** 在最上方，picker 收在 `#pickerSection`（hidden）。
2. `view-saved` — 收藏列表 + 搜尋。
3. `view-bases` — 基底色管理（最多 8 色）。
4. `view-me` — 我的（碼表入口、APP 說明）。

view 切換靠 `switchView(name)`，會：
- 更新 view 的 hidden 狀態
- 更新 tabbar 的 active 樣式
- mix view 額外呼叫 `renderHero()`

### 5 個 modal（都在 `</main>` 之後，body 直屬）
- `#baseModal` — 新增 / 編輯基底色（圖片採樣 + hex 輸入兩 tab）
- `#saveModal` — 儲存配方
- `#detailModal` — 配方詳情（再做一次 / 刪除）
- `#timerModal` — 碼表（count-up + lap；id 沿用舊名 `timerModal`）
- `#hexModal` — 從 Home Hero 進入的 hex 直接輸入

打開 / 關閉統一用 `el.hidden = true|false`，沒有用 class toggle。

### 全域常數（`app.js` 頂端）
```js
const STORAGE_KEY_BASES   = 'manicure_bases_v1';
const STORAGE_KEY_SAVED   = 'manicure_saved_v2';
const MAX_BASES           = 8;
const MIN_BASES_OK        = 3;
const MAX_PARTS_PER_COLOR = 6;
const MAX_TOTAL_PARTS     = 10;
const MAX_PICKS           = 5;   // 多點取色上限
```

## 4. 核心演算法（在哪裡 / 怎麼動）

| 功能 | 函式 | 約略行號 |
|---|---|---|
| RGB ↔ Lab | `rgbToLab` / `labToRgb` | app.js 上半 |
| 色差 | `deltaE2000(L1, L2)` | CIEDE2000 標準實作 |
| Mixbox 包裝 | `mixLatents(latents, weights)` | 用 mixbox 的 latent 加權 |
| 搜尋配方 | `searchBest(target)` | 遞迴枚舉 parts，剪枝 |
| 染色力補償 | 在 `weights` 上乘 `tinting`（黑色預設 ×3.0） |  |
| onPickTarget | 取色入口（圖片 / hex / 多點都進這裡） | `function onPickTarget(target)` |

> 想加新演算法？切入點通常是 `searchBest` 或 `onPickTarget`。

## 5. Home Hero（2026/04 改版）

mix view 的首頁不再是「直接看到檔案上傳按鈕」，改成 hero 風格：

```
┌──────────────────────────┐
│ 早安 ✨                  │  hero（依時段問候）
│ 今天想調什麼顏色？       │
├──────────────────────────┤
│ 🎨🎨🎨🎨🎨  我的調色盤   │  paletteCard（點 → bases view）
│              N 個基底色  │
├────────────┬─────────────┤
│ 📷 從圖片  │ 🎨 輸入色號 │  action-grid
│ 取色       │             │
├────────────┴─────────────┤
│ 最近收藏    看全部 →     │  rail-section
│ ▢▢ ▢▢ ▢▢ ▢▢ ...        │  （水平滾動，scroll-snap）
├──────────────────────────┤
│ 💡 小知識                │  tipCard（點換下一則）
└──────────────────────────┘
```

點 **從圖片取色** → 展開 `#pickerSection`（內含原本的檔案選擇 / canvas / 結果 card）。
點 **輸入色號** → 開 `#hexModal`，輸入後直接 `onPickTarget(rgb)` + 展開 picker section 顯示結果。

關鍵 JS 函式（都在 `app.js` 後段）：
- `renderHero()` — 一次 render 所有 4 個區塊，由 `switchView('mix')` 自動觸發
- `renderPaletteCard()` — 由 `saveBases()` 觸發（有變動就重畫）
- `renderRecentRail()` — 由 `saveSaved()` 觸發
- `renderTipCard()` — 點卡片時 cycle index
- `openPicker(focus)` — 顯示 `#pickerSection`，`focus='result'` 時 scroll 到結果
- `openHexModal()` / `closeHexModal()` / `submitHex()` — hex 流程

## 6. 資料持久化（localStorage）

```js
manicure_bases_v1   — Array<Base>
manicure_saved_v2   — Array<SavedRecipe>
```

- 寫入都過 `saveBases()` / `saveSaved()`，會 try/catch `QuotaExceededError`。
- 讀取都過 `loadBases()` / `loadSaved()`，有 schema 預設值與容錯。
- **改 schema 一定要 bump key 版本號**（避免讀到舊結構炸掉）。

成品照存在 SavedRecipe 裡的 `photo`（dataURL，已壓縮：720px / JPEG q=0.7）。
Base 也可有 `swatchPhoto`（採樣時的縮圖）。

## 7. 改動的常見切入點

| 我想加 ... | 改這裡 |
|---|---|
| 一個新的首頁區塊 | `index.html` view-mix 內 + `styles.css` 加 class + `app.js` 加 `renderXxx()`，並在 `renderHero()` 內叫一次 |
| 新的 modal | 在 timerModal 之後加 `<div class="modal-overlay" id="...">`，js 用 `el.hidden = false` 開關 |
| 新的 view（第 5 個 tab） | 加 `<section class="view view-X" id="view-X">`、tabbar 加按鈕、`views` 物件加 key、`switchView` 自動處理 |
| 新的演算法路徑 | 從 `onPickTarget` 接，不要繞過它 — 它有處理 calc state / scroll / 多點 |
| 新的小知識 | `app.js` 的 `const TIPS = [...]`，直接加字串 |
| 碼表行為改動 | `app.js` 的「碼表」區塊：`swState` 狀態機 + `renderSwTime/Buttons/Laps` |

## 7.5. 圖片取色 pan/zoom（2026/04 改）

問題：原本 `canvas { touch-action: none }`，圖片擋住整頁滑動；多點模式容易誤觸；不能放大。

現在的設計：
- `.canvas-wrap { touch-action: pan-y }` 預設讓瀏覽器接管上下捲。
- zoom > 1 時加 class `is-zoomed`，切成 `touch-action: none` 自己接管 1 指 pan。
- Tap 偵測：累積移動 > `TAP_MOVE_THRESHOLD`（8px）或時間 > `TAP_TIME_THRESHOLD`（400ms）就不算 tap，不會取色。
- Pinch：2 指 distance ratio 套到 zoom，pivot 在兩指中點。
- 內部結構：`<div.canvas-wrap><div.canvas-zoomer><canvas/><crosshair/><pinsLayer/></div><zoom-controls/></div>`，CSS transform 套在 zoomer 上、`transform-origin: 0 0`。
- 取色座標：`pickFromCanvas` 用 `getBoundingClientRect()` 拿到的是後變換的 rect，所以 zoom 過後仍能正確取像素，不需額外換算。
- crosshair / pin 的 % 定位放在 zoomer 內部（pre-transform 空間），會跟著 transform 一起縮放、不需要額外重畫。

切記：**tap 偵測 + 取色都在 `canvasWrap` 上，不是 canvas 上**。原本綁在 canvas 的 `click` / `touchend` listener 已經移除。

## 8. 已知限制 / 陷阱

1. **Mixbox 是 CC BY-NC 4.0** — 商用要另外授權。README 已標註。
2. **localStorage 配額** — 存大量帶照片的配方會撞 5–10 MB 牆。已壓縮但沒做 LRU。
3. **iOS Safari** — input[type=file] 在某些版本不會觸發 change，這版用 label-for 解決。
4. **Capture-phase listener** — picker 用了 `stopImmediatePropagation` 攔截，加新 listener 時注意執行順序。
5. **showResult 已被 monkey-patch**（`_origShowResult = showResult; showResult = function...`）— 改 showResult 行為時要看清楚 patch 後的版本。
6. **`switchView('mix')` 會呼叫 `renderHero()`**，但首次 init 在 file 最尾巴 — 改 init 順序時注意。

## 9. 部署

- 推到 `main` → GitHub Pages 自動發佈。
- 沒有 CI、沒有測試、沒有 lint。改完自己開瀏覽器看。
- 本地測試：`python -m http.server 8080`，注意 mixbox.js 要走 https CDN，所以本地 http 也 ok（瀏覽器允許 mixed → https）。

## 10. Commit 規範

- **不加 Claude / AI 署名**。
- email：`csm088220@gmail.com`。
- 訊息中文 OK，盡量寫「為什麼」。
- 檔案大改時可以分多個 commit（例如：拆檔 / Home Hero / docs 各一）。

## 11. 還沒做 / 想做

- [ ] **校色卡** — 拍一張實體色卡，反推當前螢幕偏差，給配方做補償。
- [ ] **PWA** — manifest + service worker，可離線。
- [ ] **基底色匯入 / 匯出 JSON** — 換手機時搬資料。
- [ ] **rail-item 長按預覽** — 不切到收藏頁就能快速看。
- [ ] **多點漸層步數可調**（目前固定中間色 1 個）。
