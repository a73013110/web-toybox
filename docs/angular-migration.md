# Angular 22 遷移計畫

把 Web Toybox 從「零建置的原生 HTML/JS」改成 Angular 22 + build 期 prerender，
用 GitHub Actions 部署到 GitHub Pages。後端 Apps Script 不動。

日常鐵律見專案根目錄的 `CLAUDE.md`，本文件放計畫、理由與風險。

---

## 0. 先承認的取捨

| 項目 | 現在 | 遷移後 | 判斷 |
|---|---|---|---|
| 首頁傳輸量 | 數十 KB | 約 100–150 KB（gzip） | 接受。學習價值 > 體積 |
| 建置需求 | 無 | Node + Angular CLI | 接受。README 第一句要改寫 |
| 每頁 meta | 各頁自己有 | 需靠 prerender 維持 | **不可退步**，見下方 §2 |
| 新增作品成本 | 改 1 個檔 | 改 2 個檔 | 接受 |

README 目前寫「無需建置工具或前端框架」，遷移完成後這句話就不成立，必須一併更新。

---

## 1. 技術選型

- **Angular 22.1.x**（`@angular/core` 22.1.3 / CLI 22.1.5），Node 24 LTS 或 26
- **standalone + zoneless + OnPush**：v22 起三者皆為框架預設，程式碼裡不需要任何一行去開啟
- **Signal Forms**（`@angular/forms/signals`）：與 EDoc 對齊。experimental API，風險已知並接受
- **prerender（SSG）**：裝 `@angular/ssr`，設 `outputMode: 'static'`
- **Vitest**：Angular 22 CLI 的預設 unit test builder
- **原生 CSS + 現有語意 token**：不引入 Tailwind 或 UI 套件

### 為什麼是 prerender 而不是純 SPA

純 SPA 方案（build 後把同一份 `index.html` 複製到各頁目錄）有兩個實際問題：

1. **分享預覽會壞掉。** 現在 `pages/deep-talk/index.html` 與 `pages/invitation-card/index.html`
   各有自己的 `<title>` 和 `<meta description>`。共用同一份 shell 之後，
   貼到 LINE / Facebook 的預覽卡片會全部變成首頁。這是實質功能退步。
2. **trailing slash 未經驗證。** `/web-toybox/pages/deep-talk/` 進站時 router 拿到帶尾斜線的路徑，
   能不能穩定匹配得實測。

prerender 一次解決兩者：build 期就把每個路由渲染成真正的靜態 HTML，
輸出到 `dist/browser/pages/deep-talk/index.html`，各自帶正確的 meta，
目錄結構天然對應 URL，也不需要 404 hack。輸出仍是純靜態檔，GitHub Pages 完全支援。

**prerender ≠ SSR。** 它只是一個 build step，不需要任何 server runtime。

---

## 2. 部署架構

```
angular.json  → baseHref: "/web-toybox/", outputMode: "static"
                ↓ ng build（自動探索靜態路由並 prerender）
dist/browser/
├─ index.html                          → /web-toybox/
├─ pages/invitation-card/index.html    → /web-toybox/pages/invitation-card/
├─ pages/deep-talk/index.html          → /web-toybox/pages/deep-talk/
├─ 404.html、robots.txt、favicon.svg   （來自 public/）
└─ *.js / *.css
                ↓ GitHub Actions
GitHub Pages（Source 設為 GitHub Actions，不是 branch）
```

Actions 用 `actions/configure-pages` → `actions/upload-pages-artifact` → `actions/deploy-pages`。
只在 `main` 觸發部署。

**meta 設定位置**：在元件的 field initializer 或 constructor 呼叫 `inject(Meta).updateTag(...)`，
讓它在 render 期間執行，prerender 才會序列化進 HTML。放進 `afterNextRender()` 會失效
（那只在瀏覽器跑），這個錯誤在本機 `ng serve` 完全看不出來，只有看 build 產物才會發現。

---

## 3. 遷移期間的部署狀態

⚠️ 遷移過程中，舊的 `pages/*/index.html` 與 Angular build 產物會爭同一個路徑。

規則：**整段遷移在 feature branch 進行，GitHub Actions 只在 `main` 部署。**
中途一律靠本機 `ng build` + 本機靜態伺服器驗證，不做混合部署。
`main` 維持現有的原生版本正常服務，直到階段六一次切換。

---

## 4. 階段

### 階段一：骨架與部署管線 ✅ 已完成

- `ng new` 到暫存目錄後把 `src/`、`angular.json`、`tsconfig*` 搬進來，
  **合併而非覆蓋** `package.json`（`gs:*` scripts 必須保留）
- tsconfig 對齊 EDoc：`strict`、`strictTemplates`、`noImplicitReturns`、
  `noFallthroughCasesInSwitch`、`noUncheckedIndexedAccess`、`noPropertyAccessFromIndexSignature`、path alias
- 建三條路由（先放空白元件）、搬 `shared/*.css` 到 `src/styles/`
- 裝 `@angular/ssr`，設定 prerender 與 baseHref
- 寫 GitHub Actions workflow
- （計畫外追加）ESLint：`prefer-inject`、`no-output-native`、`prefer-control-flow`
  與 `no-restricted-imports` 邊界規則，把 CLAUDE.md 的幾條鐵律交給 linter 把關

**驗收**：`ng build` 後 `dist/browser/` 確實出現三個 `index.html`，
用本機靜態伺服器開 `/web-toybox/pages/deep-talk/` 不是 404。

### 階段二：Home

搬 `shared/projects.js` → `features/home/projects.data.ts`，
`assets/home.js` 的渲染邏輯 → `@for` template，`assets/home.css` → `home.css`。

**驗收**：與現行首頁 1:1 比對（桌面 + 375px）。

### 階段三：API Transport

- `shared/api.js` → `core/api/apps-script-client.ts`
- endpoint 與逾時 → `core/api/apps-script-config.ts`
- ⚠️ **同時改 `scripts/gs-deploy.mjs`**：它現在用 regex 從 `shared/config.js` 抓部署 ID
  （見 `scripts/gs-deploy.mjs:17`），檔案搬走就會壞
- ⚠️ HttpClient 傳 body 必須先 `JSON.stringify()`，否則 content-type 被蓋成 json → CORS preflight → 失敗
- `sendBeacon` 維持原生 API，不經 HttpClient

**驗收**：用 `HttpTestingController` 測 request header 確實是 `text/plain;charset=utf-8`、
body 是 string、`ok: false` 會轉成對應錯誤碼、逾時會拋 timeout。

### 階段四：Invitation Card（Signal Forms）

- 一個 `signal(model)` 當唯一資料源，一份 `form(model, schema)` 集中驗證
- 五個步驟用 `disabled({ when })` 控制推進，不要拆成五份 form
- 送出走 `submit()`，後端錯誤映射回欄位
- URL query parameter 行為逐項比對

**驗收**：五步驟驗證、query parameter、Apps Script 實際寫入結果與現行版本一致。

### 階段五：Deep Talk

順序很重要：**先 Store，再畫面，最後 Canvas / Clipboard / Beacon。**
不要一次重寫 `pages/deep-talk/script.js` 那 700 行。

Store（route-scoped）管理：當前畫面、設定步驟、關係階段、深度、主題、題組、當前題目、
讚與跳過、待送回饋、loading / error、已看題目、重試。

⚠️ **最容易靜默壞掉的一點**：待送回饋的 flush。
原生版本靠 `pagehide` + `sendBeacon`，SPA 化後多了「點返回鍵切回首頁」這條
`pagehide` 不會觸發的路徑，回饋會直接遺失。
`DestroyRef.onDestroy()` 必須也 flush 一次。

**驗收**：翻完整疊牌 → 點返回鍵回首頁 → 確認 Google Sheet 收到回饋。

### 階段六：正式切換

刪除 `pages/`、`shared/`、`assets/`、`templates/page-starter/`
（`templates/` 的原生骨架在 Angular 化後已無意義，改用 `ng generate`）。
GitHub Pages 的 Source 從 branch 改成 GitHub Actions。更新 README。

**切換前檢查清單**：

- [ ] 桌面與 375px 視覺比對（兩個作品 + 首頁）
- [ ] 鍵盤操作與 `:focus-visible`
- [ ] `prefers-reduced-motion`
- [ ] 三個舊網址直接輸入不 404
- [ ] 每個舊網址重新整理不 404
- [ ] 三頁的 `<title>` / `<meta description>` 各自正確（看 build 產物，不是看 devtools）
- [ ] invitation-card query parameter
- [ ] localStorage（`deep-talk:setup` / `deep-talk:seen`）
- [ ] Deep Talk 回饋在「切回首頁」時有送出
- [ ] Google Fonts 載入行為沒有造成 FOUT 差異
- [ ] `npm run test:backend` 全綠

---

## 5. 已知風險

| 風險 | 徵狀 | 對策 |
|---|---|---|
| HttpClient 蓋掉 content-type | CORS 錯誤，看不出跟 body 型別有關 | body 先 stringify，寫測試鎖住 header |
| meta 設在 `afterNextRender()` | 本機看起來正常，build 產物沒有 meta | 檢查 `dist/browser/pages/*/index.html` 原始碼 |
| Deep Talk 回饋遺失 | 沒有錯誤訊息，Sheet 就是少資料 | `DestroyRef.onDestroy()` flush + 手動驗收 |
| `gs-deploy.mjs` 讀不到 config | `npm run gs:deploy` 直接報錯 | 階段三同步改 |
| Signal Forms breaking change | 升 Angular 版本後編譯失敗 | 接受；升版前先看 changelog |
| 新增動態路由後該頁 404 | 只有直接進入或重新整理才重現 | 路由維持靜態，或補 prerender 清單 |
