# 美甲調色 / Manicure Color Mixer

一個給自己用的美甲調色小工具。上傳靈感圖、點選想要的顏色，App 會根據 5 種基底色（黃 / 紅 / 藍 / 白 / 黑）給出最接近的調色配方。

> A personal tool to mix nail polish colors. Upload an inspiration photo, tap to pick a target color, and get a recipe of base color parts to recreate it.

線上版本：
**https://oomao.github.io/Manicure_color/**

---

## 功能 Features

- 從圖片取色：上傳 / 拍照 → 點擊任意位置取色
- 直接輸入 HEX 色碼當成目標
- 自動搜尋最佳配方（每色 0–6 滴 / 總量 ≤ 10 滴）
- 經過驗證的顏料混色演算法（Mixbox，SIGGRAPH Asia 2021）
- 染色力 Tinting Strength 補償（黑色預設 ×3.0，符合 ISO 787-24）
- ΔE 色差顯示 + 超出可達色域時警告
- 自訂基底色：可加 / 改 / 刪，最多 8 色，從圖片或色號輸入
- 全部資料存在 localStorage（不會送到任何伺服器）

## 為何要使用 Mixbox 而不是 RGB 平均？

一般 `(R1+R2)/2` 或線性加權混合，是「光的混合」而不是「顏料的混合」。
紅 + 黃 在線性平均下會偏髒橘；在現實中應該是鮮亮的橙色。

Mixbox 是 Sochorová & Jamriška 在 SIGGRAPH Asia 2021 發表的演算法，
基於 Kubelka-Munk 顏料光學理論，把每個顏色映射到 7 維 latent space 後線性插值，
被 Rebelle、Procreate、Corel Painter 等專業繪圖軟體採用。

## 為什麼黑色加一點點就差很多？

這是真的，不是錯覺。
ISO 787-24 標準裡測得的染色力（tinting strength）：
- Carbon Black 約是 Bone Black 的 2–3 倍
- 同重量下，黑色顏料對混合結果的貢獻遠高於白 / 紅 / 黃 / 藍

App 內已對黑色做 ×3.0 補償；如果發現自家牌子更猛 / 更弱可在「基底色 → 編輯 → 染色力」自行調整。

## 螢幕顏色 ≠ 實際顏色

| 裝置 | 與實際偏差（ΔE） |
| --- | --- |
| iPhone（出廠校準）| < 1（肉眼難辨） |
| iPad / Mac Display | 1–3 |
| 一般筆電 / Android | 3–8（明顯偏差） |
| 老螢幕 / 強光下 | > 10 |

建議在固定光源下、用同一台手機操作。日後可以加「校色卡」功能來抵銷螢幕誤差。

---

## 技術 Stack

- 純單檔 HTML / CSS / JS — 沒有框架、沒有 build step
- Mixbox.js（CDN，CC BY-NC 4.0）
- Canvas 2D 取色
- localStorage 持久化
- GitHub Pages 部署

## 本地執行

```bash
# 直接開檔即可
open index.html
# 或起一個簡單伺服器（取色採樣需要）
python -m http.server 8080
```

## Roadmap

- [x] 配方收藏（存下成功配方、可加標籤 / 備註 / 成品照、可再做一次、可分享文字）
- [ ] 多點取色平均（避免單點取到反光 / 雜訊）
- [ ] 校色卡（拍實體色卡反推螢幕偏差）
- [ ] 凝膠用量計算（一片指甲 × N 片）+ UV 燈計時
- [ ] PWA 離線支援

## Disclaimer

此 App 為個人 side project，不保證商用準確度。
顏料與膠的批次差異、底色（白底 vs 透明底）、燈烤條件都會影響最終結果，
請把 App 當成「起手式」而不是「最終答案」，調出 70% 後靠眼睛微調。

## License

Code: MIT
Mixbox: CC BY-NC 4.0（個人使用 OK，商用需另外授權）
