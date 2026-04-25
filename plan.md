# 基底色管理功能 — 實作計畫

## 目標

讓使用者可自訂、新增、刪除基底色，不再寫死 5 個 infin.Lin 預設。
> 支援兩種新增方式：**圖片採樣（主要）** + **手動輸入 hex（輔助、可校正）**。

---

## 為什麼要做

| 現狀 | 做了之後 |
|---|---|
| 5 色寫死，使用者買新色（例如薄荷綠）沒辦法用 | 可隨時新增 |
| 基底色 hex 是我目視估算，誤差大 | 使用者親自採樣，誤差降到最低 |
| 所有人共用同一組基底 | 每個人可有自己的色卡（未來擴充） |

---

## 技術影響分析

### 1. 演算法會不會受影響？

**不會。** Mixbox 的 `rgbToLatent` 對任何 RGB 都能算出 7 維 latent，不限 palette。
但有兩個前提：
- 使用者至少留 **3 個**基底色（太少 → 大量目標色色域內達不到）
- 基底色上限 **8 個**（再多 → 搜尋時間 > 2 秒，體感不流暢）

### 2. 搜尋演算法要重構

**現在**：5 層寫死 `for` loop，parts 陣列長度固定為 5。
**改成**：遞迴搜尋，支援任意 N 個基底。

```js
function searchRecursive(parts, idx, remaining) {
  if (idx === BASES.length) {
    if (parts.reduce((a,b)=>a+b) === 0) return;
    evaluate(parts);  // 算 mix + deltaE
    return;
  }
  const max = Math.min(MAX_PARTS_PER_COLOR, remaining);
  for (let k = 0; k <= max; k++) {
    parts[idx] = k;
    searchRecursive(parts, idx + 1, remaining - k);
  }
}
```

**搜尋空間估算**（MAX_PARTS_PER_COLOR=6, MAX_TOTAL=10）：
- 5 基底 → ~3,003 組合
- 6 基底 → ~8,008 組合
- 7 基底 → ~19,448 組合
- 8 基底 → ~43,758 組合

每個組合一次 mix + deltaE ≈ 0.1 ms，所以 8 基底最差 ~4 秒。
如果實測太慢，改用 **剪枝策略**（提前放棄 deltaE 明顯不會變好的分支）或**隨機重啟爬山**。

---

## 資料結構

### 單一基底色

```js
{
  id: 'uuid-xxx',           // 用 crypto.randomUUID() 生成，刪除/編輯用
  name: '黃',               // 使用者顯示名（必填）
  sub: 'infin.Lin 096M',    // 品牌/色號（選填）
  hex: '#E5B23C',           // 主要色值（必填）
  tintStrength: 1.0,        // 著色力係數，預設 1.0；黑系預設 3.0
  source: 'default' | 'image' | 'hex',  // 建立方式（顯示用）
  createdAt: 1714000000000, // timestamp
}
```

### localStorage 鍵

```js
KEY: 'nail-color-mixer.bases.v1'
VALUE: JSON.stringify(Array<Base>)
```

> 版本號 `v1` 方便未來 schema 變動時做 migration。

---

## UI 變動

### 位置：把現有 `<details>「基底色設定」` 改成 `card` 並加上操作按鈕

```
┌─ 🎨 基底色管理 ────────────────────────┐
│                                        │
│  ● 黃   infin.Lin 096M       ×1.0  …  │
│  ● 紅   infin.Lin Red        ×1.0  …  │
│  ● 藍   infin.Lin 156M       ×1.0  …  │
│  ● 白   infin.Lin White      ×1.0  …  │
│  ● 黑   infin.Lin Black      ×3.0  …  │
│                                        │
│  [ + 新增基底色 ]                       │
│                                        │
│  （目前 5 / 8，建議至少保留紅黃藍白黑） │
└────────────────────────────────────────┘
```

- **`…` 按鈕**：彈出選單 → [編輯] [刪除]
- **刪除**：第一次點 → 倒數 3 秒確認；防手殘
- **編輯**：開 modal，同新增流程但預填資料
- **刪到少於 3 色**：顯示紅字警告「色域不足，許多顏色將無法調出」

### 新增基底色 Modal

```
┌─ 新增基底色 ────────────────────────────┐
│                                         │
│  [ 🖼️ 從圖片採樣 ]  [ #️⃣ 手動輸入色號 ]  │  ← tabs
│  ─────────────────                      │
│                                         │
│  ( Tab A：圖片採樣 )                    │
│  [選擇圖片 / 開相機]                    │
│  ┌──────────────────────┐               │
│  │     [圖片]            │               │
│  │    ⊕ 點一下取色       │               │
│  └──────────────────────┘               │
│                                         │
│  採樣色：■ #XXXXXX                      │
│  （可再手動微調 hex →）                 │
│                                         │
│  ─────────────────                      │
│                                         │
│  名稱 *        [ 螢光粉            ]    │
│  品牌/色號     [ infin.Lin 120M    ]    │
│  著色力        [  1.0  ] （預設 1.0）   │
│                                         │
│  [ 取消 ]              [ 儲存 ]         │
└─────────────────────────────────────────┘
```

**Tab A（從圖片採樣）流程**：
1. 使用者上傳 / 拍攝自家色卡或凝膠色塊
2. 在圖片上點一下 → 用 5×5 平均取色（同現有邏輯）
3. 採樣後 hex 可再手動微調（解決「照片 JPEG 壓縮或白平衡偏色」問題）

**Tab B（手動輸入色號）流程**：
1. 直接貼 `#RRGGBB` 或輸入 6 位數
2. 即時預覽色塊
3. 驗證格式（只接受合法 hex）

**共用欄位**：
- 名稱（必填、去空白、最多 10 字）
- 品牌/色號（選填）
- 著色力（數字，0.2 – 5.0，預設 1.0）
  - 提示：「碳黑系建議 3.0、螢光色建議 1.5-2.0、一般色 1.0」

**儲存時**：
- 寫入 BASES 陣列
- `mixbox.rgbToLatent()` 預建 latent
- 同步寫 localStorage
- 關閉 modal、重新 render 列表

---

## 新增的警告 / 提示

### A. 色域警告

計算配方後，若最佳 ΔE > 15：
> ⚠️ 此目標色在你目前的基底組合下難以精確調出。
> 建議新增：__ 色系（自動判斷目標 Lab 色相，推薦接近的基底類型）

### B. 基底數量警告

- 少於 3 色：橙色警示條「色域嚴重不足，多數顏色會調不出來」
- 多於 8 色：禁止新增，提示「基底色超過 8 個會讓搜尋變很慢」

### C. 重複 hex 警告

- 若新增的 hex 與現有某基底相差 ΔE < 5：
  > ⚠️ 此色與「紅 infin.Lin Red」非常接近，新增意義不大，要繼續嗎？

---

## 邊界情況處理

| 情況 | 處理 |
|---|---|
| 使用者把所有基底刪光 | 強制至少保留 1 個；顯示「至少需要 1 個基底色」 |
| localStorage 讀到壞資料 | try/catch → fallback 回預設 5 色 |
| 著色力輸入 0 或負數 | 拒絕儲存；顯示「著色力必須 > 0」 |
| Hex 格式錯誤 | 拒絕儲存；紅框提示 |
| 著色力極端值（> 10） | 警告「超過 10 會讓該色主導混合，你確定嗎？」 |
| 從圖片採樣但沒點任何位置就按儲存 | 拒絕儲存，提示「請先在圖片上點取一個顏色」 |

---

## 實作拆解（依序）

### Phase 1：演算法重構（無 UI 變動）
- [ ] `findBestRecipe` 改遞迴
- [ ] `mixMixbox` 改吃變長 parts
- [ ] `showResult` 改動態 render N 基底
- [ ] `ratioSummary` 動態生成欄位名（「黃:紅:藍」→ 由 BASES.name 組）
- [ ] 本地測試 5 色結果跟現在一致（regression test）

### Phase 2：資料持久化
- [ ] `loadBases()` / `saveBases()` 函數
- [ ] 啟動時先 load，沒資料就用預設 5 色
- [ ] 改動 BASES 後自動 save

### Phase 3：基底色管理 UI
- [ ] 改 details → card
- [ ] 列表 render
- [ ] 刪除 / 編輯按鈕 + 確認

### Phase 4：新增 Modal
- [ ] Modal 殼 + 關閉/遮罩
- [ ] Tab 切換
- [ ] Tab A：圖片採樣（沿用現有取色邏輯）
- [ ] Tab B：Hex 輸入 + 即時預覽
- [ ] 表單驗證 + 儲存

### Phase 5：警告系統
- [ ] 色域不足警告
- [ ] 基底數量警告
- [ ] ΔE > 15 的自動色系建議（這項可選）

### Phase 6：回歸測試（手動）
- [ ] 開新環境（clear localStorage）→ 看到預設 5 色
- [ ] 刪一個 → 重開 APP → 確認持久
- [ ] 新增 6 色 → 搜尋時間 < 1 秒
- [ ] 新增 8 色 → 搜尋時間 < 3 秒
- [ ] 圖片採樣流程跑通
- [ ] Hex 輸入流程跑通
- [ ] 編輯既有色正常

---

## 不做的事（範圍外）

- ❌ 多組色卡切換（例如「infin.Lin 系列」vs「日系甲油」）→ 未來
- ❌ 從雲端同步基底色 → 未來
- ❌ 基底色分享（匯出 / 匯入 JSON）→ 未來
- ❌ 自動建議著色力（根據 hex 的 L* 值自動推）→ 未來
- ❌ 固化後變深補償 → 獨立任務
- ❌ 相機拍照即時預覽 → 獨立任務（目前用 `<input capture>` 就夠）

---

## 預估工時

- Phase 1：1 小時（小心 regression）
- Phase 2：30 分鐘
- Phase 3：1 小時
- Phase 4：1.5 小時（modal + tabs + validation）
- Phase 5：30 分鐘
- Phase 6：20 分鐘測試

**合計：約 4.5 小時**。單一 `index.html` 預估從現在 ~22 KB 長到 ~38-42 KB。

---

## 已決定的設計（採用合理預設，事後再調）

| # | 決策點 | 採用方案 | 原因 |
|---|---|---|---|
| 1 | 資料欄位 | 加 `note`（備註，選填，最多 50 字） | 方便記錄「常用色 / 已用完 / 待補」等 |
| 2 | 基底色上限 | **8 個** | 搜尋 < 1 秒；超過開始有體感延遲 |
| 3 | 新增方式介面 | **Tab 切換（圖片採樣 / Hex 輸入）** | 兩種流程很不同，並排會擁擠 |
| 4 | 刪除防呆 | 原生 `confirm()` 對話框 | 簡單夠用，不用自己刻倒數 |
| 5 | 著色力輸入 | **三擋下拉 + 自訂數字**：標準 (1.0) / 高 (2.0) / 超高 (3.0) / 自訂 | 給使用者語意化選擇，進階用戶可自訂 |
| 6 | 色域警告 | 做基本版（ΔE > 15 時跳「色域不足」紅字），暫不做「自動推薦補什麼色」 | 省 30 分鐘，之後 Phase 5 再加 |

---

# 🎨 UI 設計方向：Instagram 風格

## 設計原則

| 原則 | 具體做法 |
|---|---|
| **照片為主角** | 美甲圖片是 hero，介面色 chrome 一律低調讓圖片跳出 |
| **大量留白** | 區塊間距 16-20 px、卡片內距 16-20 px |
| **Neutral 配色** | 背景 `#FAFAFA`、卡片 `#FFFFFF`、文字 `#262626`（IG 招牌字色） |
| **單一強調色** | 全 APP 只用一個 accent — 玫瑰粉 `#ED4956`（IG 紅心同色），其他都灰階 |
| **薄分隔線** | 用 `#DBDBDB` 1px 線取代陰影；陰影只在浮層（modal） |
| **圓角統一** | 卡片 12 px、按鈕 8 px、輸入框 8 px |
| **字重對比** | 標題 600（semibold）、內文 400、輔助訊息 400 + 灰色 |
| **Outline icon** | 用 SVG 線性圖示（Feather 風），不要 emoji |
| **底部分頁導航** | 仿 IG 底部 nav bar：4 tab（調色 / 收藏 / 基底色 / 我的） |

## 字型

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Text",
  "Helvetica Neue",
  "PingFang TC",
  "Microsoft JhengHei",
  sans-serif;
```

## 主要色票

```css
--bg:           #FAFAFA;  /* 背景 */
--surface:      #FFFFFF;  /* 卡片 */
--text:         #262626;  /* 主文字 */
--text-2:       #8E8E8E;  /* 次要文字 */
--text-3:       #C7C7C7;  /* 提示 */
--border:       #DBDBDB;  /* 分隔線 */
--border-soft:  #EFEFEF;  /* 淺分隔 */
--accent:       #ED4956;  /* IG 紅 */
--accent-2:     #0095F6;  /* IG 藍（連結 / 第二強調） */
--success:      #2ECC71;
--warning:      #F39C12;
--danger:       #ED4956;
```

## 主要元件範例

### 卡片
```css
.card {
  background: #fff;
  border: 1px solid #EFEFEF;
  border-radius: 12px;
  padding: 16px;
}
```

### 底部 Tab Bar（仿 IG）
```
┌──────────────────────────────────────┐
│  🎨        ❤️         🧴       👤      │
│  調色      收藏      基底色    我的    │
└──────────────────────────────────────┘
```
- 高度 56 px、固定底部、白底 1px 上邊框
- icon 24×24，selected 為深色 (#262626)，unselected 灰 (#8E8E8E)

### 配方 Row（重做，更乾淨）
```
●●  黃 infin.Lin 096M             3
                                  份
─────────────────────────────────────
```
- 純文字、左色塊、右份數
- 沒有底色，用底分隔線即可

### Pill 按鈕（IG 風）
```css
.btn-primary {
  background: #0095F6;
  color: #fff;
  border-radius: 8px;
  font-weight: 600;
  padding: 8px 16px;
}
.btn-secondary {
  background: transparent;
  color: #262626;
  border: 1px solid #DBDBDB;
}
```

### Modal（仿 IG 浮層）
- 全螢幕半透明黑色遮罩 `rgba(0,0,0,0.65)`
- 內容置中、白卡、`max-width: 400px`、`border-radius: 12px`
- 標題列 + 右上 X 關閉按鈕
- 按鈕在底部分隔線下，左 [取消] 右 [儲存] 兩個 pill

### 預估色 vs 目標色（重做）
取消「左右兩個 swatch + hex」的設計，改成 **IG 風格的 split-screen 卡片**：
```
┌──────────────┬──────────────┐
│   目標色      │    預估       │
│   ████████   │   ████████   │
│  #5E7386     │  #4F7891     │
└──────────────┴──────────────┘
```
但卡片用 `border: 1px solid #DBDBDB`、無背景色，更簡潔。

---

# 🚀 GitHub Pages 部署規劃

## 檔案結構

```
nail-color-mixer/                ← repo root
├── index.html                   ← 主 APP（單檔）
├── README.md                    ← 給逛 GitHub 的人看
├── plan.md                      ← 開發計畫（不影響 deploy）
├── assets/
│   └── icons/                   ← SVG icon set
└── .nojekyll                    ← 防止 GitHub 用 Jekyll 處理
```

## 部署步驟

1. 在 GitHub 建 public repo（建議名 `nail-color-mixer`）
2. push 上述檔案
3. Settings → Pages → Source: `main` branch / `(root)`
4. 約 1 分鐘後 `https://<username>.github.io/nail-color-mixer/` 上線
5. 自動 HTTPS（相機 / `getUserMedia` 必須）

## 部署注意事項

- **單檔 SPA**：所有東西在 `index.html`，無 build step、無路由問題
- **localStorage**：domain-scoped，每個 GitHub Pages site 各自獨立，不會互相干擾
- **檔案路徑**：所有靜態資源用相對路徑，不要 `/foo`（會跑去 root 找）
- **CSP**：避免 inline `<style>` / `<script>` 太多時要加 `<meta http-equiv="Content-Security-Policy">` 設定，但 side project 可先省略
- **第三方 CDN**：Mixbox 來自 `scrtwpns.com/mixbox.js`，cross-origin 沒問題；HTTPS-only
- **iOS Safari PWA**：`apple-mobile-web-app-capable` 已設好，使用者可「加到主畫面」

## 可選：自訂網域 / PWA

- 之後可加 `manifest.json` 變成可安裝 PWA
- 可在 `Settings → Pages → Custom domain` 綁自己的網域
- 加 `service-worker.js` 做離線快取（讓 APP 在沒網路時也能用）

---

# 🗺️ 未來路線圖（Roadmap）

完成「基底色管理」後的功能規劃，依價值排序：

## Phase 7：配方收藏 / 調色日記 ⭐
**將 APP 從「一次性計算機」升級為「會回來用的個人色彩資產」**
- 每次成功配方可存起來（含目標色、配方、可選成品照）
- 列表 + 搜尋 + 標籤
- 點開可看詳細，可「再做一次」

## Phase 8：多點取色 / 漸層分析
**讓 APP 真正能設計整套美甲**
- 一張靈感圖點 2-5 個位置
- 一次取得多個配方（法式、漸層、彩繪）
- 顏色之間可設「過渡」推算中間色

## Phase 9：校色卡（Calibration Card）
**準確度的最後一塊拼圖**
- 列印一張含已知色塊的小卡（PDF 提供下載）
- 使用者拍照時把卡放在凝膠旁邊
- APP 自動偵測色卡白平衡、修正整張照片
- 圖片採樣準度從「不可靠」升至「半專業級」

## Phase 10：實用工具集
- 凝膠用量換算（依指甲數）
- 配方比例縮放（×1.5、×2 ...）
- UV/LED 固化計時器（多種 preset）
- 互補色 / 配色建議

## Phase 11+：未來潛在功能
- AI 風格化（Anthropic API：「這張靈感圖但變莫蘭迪色系」）
- 多色卡 profile（春夏 / 秋冬不同基底）
- 配方匯出 / 分享 QR
- 雲端同步（Firebase / Supabase）
- PWA 離線可用
- 色彩理論互動教學

## 明確不做

- ❌ AR 試戴
- ❌ 電商整合 / 帳號系統 / 多人協作
- ❌ 通用化支援所有廠牌

---

確認 plan.md 看起來沒問題的話，我就開始 Phase 1（演算法重構），整個 Phase 1-6 完成後 push 上 GitHub Pages 給你看。
