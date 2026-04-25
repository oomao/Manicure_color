# 美甲調色 / Manicure Color Mixer

給自己用的美甲調色小工具。上傳靈感圖、點選想要的顏色，就會用基底色調出最接近的配方。

> Personal nail-polish color mixer. Upload an inspiration photo, tap a color, get a recipe.

線上版：**https://oomao.github.io/Manicure_color/**

---

## 功能

- 從圖片或 hex 色碼取色
- 單點 / 多點取色，多點時可加上漸層中間色
- 自動搜尋最佳配方（每色 0–6 份，總量 ≤ 10 份）
- ΔE 色差顯示 + 色域不足時警告
- 收藏配方：標籤、備註、成品照、再做一次、分享文字
- 份量計算：依倍數或指甲數換算成克數
- UV / LED 燈計時器（預設 + 自訂秒數）
- 自訂基底色（最多 8 色，圖片採樣或 hex 輸入，可調染色力）
- 全部資料存在瀏覽器 localStorage，不上傳

---

## 演算法 / 參考資料

- **混色**：Mixbox（latent-space 顏料模型）
  Sochorová & Jamriška, *Practical Pigment Mixing for Digital Painting*, SIGGRAPH Asia 2021
- **色差**：CIEDE2000
  CIE Publication 142-2001
- **染色力補償**：黑色預設 ×3.0
  ISO 787-24（顏料相對染色力測定法）
- **顏料光學理論**：Kubelka-Munk
  P. Kubelka & F. Munk, 1931

## 為什麼不用 RGB 平均？

線性 RGB 加權是「光的混合」不是「顏料的混合」。紅+黃在 RGB 平均下會偏髒橘，現實中應該是鮮亮的橙色。Mixbox 用 7 維 latent space 解決這件事，被 Rebelle / Procreate / Corel Painter 採用。

## 為什麼黑色一點就差很多？

ISO 787-24 量到的染色力：Carbon Black 約是 Bone Black 的 2–3 倍。同重量下黑色對混合結果貢獻遠高於白 / 紅 / 黃 / 藍。App 內已對黑色做 ×3.0 補償，可在「基底色 → 編輯 → 染色力」自行調整。

## 螢幕 ≠ 實際

| 裝置 | 與實際偏差（ΔE） |
| --- | --- |
| iPhone（出廠校準）| < 1 |
| iPad / Mac Display | 1–3 |
| 一般筆電 / Android | 3–8 |
| 老螢幕 / 強光下 | > 10 |

建議固定光源、固定一台手機操作。

---

## 技術

純單檔 HTML / CSS / JS、無框架、無 build。Mixbox.js 從 CDN 載入。

## 本地執行

```bash
python -m http.server 8080
```

## Roadmap

- [x] 配方收藏（標籤 / 備註 / 成品照 / 再做一次）
- [x] 多點取色 + 漸層中間色
- [x] 份量計算（克數 / 倍數）
- [x] UV / LED 計時器
- [ ] 校色卡（拍實體色卡反推螢幕偏差）
- [ ] PWA 離線支援

## Disclaimer

個人 side project，非商業準確度。批次差異、底色、燈烤條件都會影響結果，App 是「起手式」不是「最終答案」，調出 70% 後靠眼睛微調。

## License

- Code: MIT
- Mixbox: CC BY-NC 4.0（個人使用 OK，商用需另外授權）
