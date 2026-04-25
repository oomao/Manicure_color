# 美甲調色 / Manicure Color Mixer

給自己用的美甲工具。除了上傳靈感圖、點選顏色、自動算配方,還能管理材料庫、收集靈感、紀錄每次作品的步驟。

> Personal nail-polish color mixer & sketchbook. Color mixing + material library + inspiration board + step-by-step work log — all offline.

線上版:**https://oomao.github.io/Manicure_color/**

---

## 功能

### 調色
- 從圖片或 hex 色碼取色
- 單點 / 多點取色,多點時可加上漸層中間色
- 自動搜尋最佳配方(每色 0–6 份,總量 ≤ 10 份)
- ΔE 色差顯示 + 色域不足時警告
- 雙指縮放(pinch-zoom)+ 平移,zoom=1 時可正常上下滑
- **從靈感圖庫直接挑一張** → 不用每次重新上傳

### 收藏
- 配方收藏:標籤、備註、成品照、再做一次、分享文字
- 份量計算:依倍數或指甲數換算成克數

### 圖庫(IndexedDB)
1. **材料庫** — 拍照 / 上傳材料(凝膠、亮粉、飾品…),自訂分類,可 CRUD、依分類篩選
2. **美甲靈感** — 雙軸分類:**色系**(紅/橘/黃/綠/藍/紫/粉/白/黑/金銀/裸色…)+ **風格**(法式/暈染/貓眼/鏡面/磁鐵/手繪/光療/簡約/漸層…)
3. **作品紀錄** — 完整紀錄每次美甲:封面成品照 + 標題 + 日期 + 整體備註 + **步驟陣列**
   - 每個步驟可記錄:標題、步驟照片、調色配方(連到收藏 OR 自由文字)、使用材料(從材料庫多選)、備註
   - 步驟可上下重排、刪除
   - 詳細頁顯示配方色塊與比例

三組分類(材料 / 色系 / 風格)都可自由新增、刪除,刪除時引用該分類的項目自動歸到「未分類」。

### 其他
- **首頁 Home Hero**:時段問候 + 調色盤狀態 + 動作卡 + 最近收藏 rail + 小知識
- 自訂基底色(最多 8 色,圖片採樣或 hex 輸入,可調染色力)
- 碼表(count-up + 計次/lap,記每個塗布步驟花的時間)

### 資料儲存
- 基底色 / 配方 → `localStorage`(輕量 JSON)
- 材料 / 靈感 / 作品(含照片 Blob)→ `IndexedDB`
- 全部存瀏覽器本機,**不上傳任何伺服器**,僅單一裝置 / 單一瀏覽器可見

---

## 演算法 / 參考資料

- **混色**:Mixbox(latent-space 顏料模型)
  Sochorová & Jamriška, *Practical Pigment Mixing for Digital Painting*, SIGGRAPH Asia 2021
- **色差**:CIEDE2000
  CIE Publication 142-2001
- **染色力補償**:黑色預設 ×3.0
  ISO 787-24(顏料相對染色力測定法)
- **顏料光學理論**:Kubelka-Munk
  P. Kubelka & F. Munk, 1931

## 為什麼不用 RGB 平均?

線性 RGB 加權是「光的混合」不是「顏料的混合」。紅+黃在 RGB 平均下會偏髒橘,現實中應該是鮮亮的橙色。Mixbox 用 7 維 latent space 解決這件事,被 Rebelle / Procreate / Corel Painter 採用。

## 為什麼黑色一點就差很多?

ISO 787-24 量到的染色力:Carbon Black 約是 Bone Black 的 2–3 倍。同重量下黑色對混合結果貢獻遠高於白 / 紅 / 黃 / 藍。App 內已對黑色做 ×3.0 補償,可在「基底色 → 編輯 → 染色力」自行調整。

## 螢幕 ≠ 實際

| 裝置 | 與實際偏差(ΔE) |
| --- | --- |
| iPhone(出廠校準)| < 1 |
| iPad / Mac Display | 1–3 |
| 一般筆電 / Android | 3–8 |
| 老螢幕 / 強光下 | > 10 |

建議固定光源、固定一台手機操作。

---

## 技術 / 檔案結構

無框架、無 build、零外部依賴(只有 Mixbox.js 透過 CDN)。

```
index.html        — 結構:views / modals / tabbar
styles.css        — 樣式:Home Hero、圖庫網格、chip、modal、響應式

app.js            — 主邏輯:mixbox / CIEDE2000 / 搜尋 / localStorage / Home Hero / tabbar

# IndexedDB 圖庫模組
media-db.js       — IDB 薄封裝(materials / galleryImages / works / categoryDefs)
img-utils.js      — 圖片 resize + 縮圖,處理成 Blob
cat-manager.js    — 共用「分類管理」modal(新增 / 刪除類別)
materials.js      — 材料庫頁面
gallery.js        — 美甲靈感頁面
works.js          — 作品紀錄頁面(含步驟編輯器)
inspire-picker.js — 從靈感圖庫挑圖到調色 canvas
```

進一步的架構說明、改動切入點、未完工事項見 **[HANDOFF.md](./HANDOFF.md)**。

## 本地執行

```bash
python -m http.server 8080
```

## Roadmap

- [x] 配方收藏(標籤 / 備註 / 成品照 / 再做一次)
- [x] 多點取色 + 漸層中間色
- [x] 份量計算(克數 / 倍數)
- [x] 碼表(記每個塗布步驟花的時間)
- [x] Home Hero 首頁改版
- [x] 拆分單檔 → index.html / styles.css / app.js
- [x] 圖片 pan/zoom + tap-vs-drag 偵測
- [x] 圖庫:材料庫 + 美甲靈感(IndexedDB,雙軸分類)
- [x] 作品紀錄:封面 + 步驟陣列(配方連結 / 材料多選 / 步驟照片)
- [x] 從靈感圖庫直接載入調色 canvas
- [ ] 校色卡(拍實體色卡反推螢幕偏差)
- [ ] PWA 離線支援
- [ ] 圖庫匯出 / 匯入備份
- [ ] 從作品紀錄反查「這個材料用在哪幾次作品」

## Disclaimer

個人 side project,非商業準確度。批次差異、底色、燈烤條件都會影響結果,App 是「起手式」不是「最終答案」,調出 70% 後靠眼睛微調。

## License

- Code: MIT
- Mixbox: CC BY-NC 4.0(個人使用 OK,商用需另外授權)
