# Web Toybox

一個互動網頁作品集，用 Angular 22 製作，build 期預先渲染成靜態頁面後部署到 GitHub Pages。

- 線上首頁：<https://a73013110.github.io/web-toybox/>
- 授權方式：[MIT License](./LICENSE)

## 特色

- **每頁都是實體 HTML**：build 期 prerender，直接輸入網址或重新整理都不會 404，各頁有自己的 `<title>` 與描述。
- **共用設計層**：色票、字型與常用元件集中在 `src/styles/`，新增作品不必複製貼上。
- **垂直切片**：每個作品在 `src/app/features/<作品名稱>/` 自成一區，頁面、狀態、API、型別與測試放在一起。
- **響應式設計**：支援桌面與行動裝置。
- **無障礙考量**：語意化標籤、鍵盤焦點、讀屏提示與減少動態效果支援。

## 作品

| 作品 | 說明 | 文件 |
| --- | --- | --- |
| [Invitation Card](https://a73013110.github.io/web-toybox/pages/invitation-card/) | 五步驟互動邀請卡，結果寫入 Google Sheet | [說明](./src/app/features/invitation-card/README.md) |
| [Deep Talk](https://a73013110.github.io/web-toybox/pages/deep-talk/) | 抽一疊由淺入深的問題，題庫在 Google Sheet，熱門度由使用者投票決定 | [說明](./src/app/features/deep-talk/README.md) |

首頁的卡片與件數由 [`projects.data.ts`](./src/app/features/home/projects.data.ts) 自動產生。

## 專案結構

```text
web-toybox/
├── src/
│   ├── app/
│   │   ├── core/api/                 # Apps Script transport（endpoint、逾時、錯誤碼）
│   │   ├── core/seo/                 # 每頁的 title 與 description
│   │   ├── shared/                   # 跨 feature 的無業務程式碼（目前尚無內容）
│   │   ├── features/
│   │   │   ├── home/                 # 首頁與作品清單
│   │   │   ├── invitation-card/      # 邀請卡（Signal Forms）
│   │   │   └── deep-talk/            # Deep Talk（route-scoped Store）
│   │   ├── app.ts / app.config.ts / app.routes.ts
│   ├── styles/                       # tokens.css、base.css、ui.css
│   └── index.html / main.ts / styles.css
├── public/                           # favicon.svg、robots.txt、404.html
├── apps-script/                      # Google Apps Script 後端（單一專案，所有作品共用）
├── scripts/gs-deploy.mjs             # 更新 Apps Script 部署
├── docs/angular-migration.md         # 從原生 HTML/JS 遷移過來的紀錄
├── CLAUDE.md                         # 開發鐵律與慣例
└── .github/workflows/deploy.yml      # GitHub Pages 部署
```

## 共用層

樣式分成三層，載入順序不能顛倒（`base.css` 與 `ui.css` 都依賴 `tokens.css` 的變數），入口是 [`src/styles.css`](./src/styles.css)：

| 檔案 | 內容 |
| --- | --- |
| `src/styles/tokens.css` | `--ink`、`--gold`、`--paper`、`--surface`、`--font-sans`、`--radius` 等變數。**全站唯一的色票來源**，作品不應該再宣告色碼 |
| `src/styles/base.css` | box-sizing、邊界重設、focus 樣式、`prefers-reduced-motion` 支援 |
| `src/styles/ui.css` | `.btn` / `.btn-primary` / `.btn-link` / `.btn-wide`、`.eyebrow`、`.mark`、`.divider`、`.input`、`.field-error`、`.sr-only`、`.back-link` |

作品專屬的變化寫進該作品自己的 `.css`，不要改共用檔。要換整頁調性時，在該元件的 `:host` 覆寫 `--accent` 三個角色 token 即可（見 Deep Talk）。

需要把資料送到後端時，一律經由該作品的 `<name>.api.ts`，元件不直接碰 `HttpClient`：

```ts
// features/my-toy/my-toy.api.ts
@Injectable({ providedIn: 'root' })
export class MyToyApi {
  private readonly _client = inject(AppsScriptClient);

  async submit(value: string): Promise<void> {
    await this._client.send('my-toy', { schemaVersion: 1, value });
  }
}
```

`AppsScriptClient` 已處理逾時、跨網域、JSON 解析與 `ok` 判讀。錯誤訊息用 `describeAppsScriptError()` 轉成可以直接顯示的句子。

## 新增作品

1. 在 `src/app/features/<作品名稱>/` 建立 `<name>.ts` / `.html` / `.css`，目錄名稱使用全小寫、連字號分隔。
2. 在 [`app.routes.ts`](./src/app/app.routes.ts) 加一條 **靜態** 路由（不能有 route param，否則 prerender 找不到它）：

   ```ts
   {
     path: 'pages/new-experiment',
     loadComponent: () => import('@features/new-experiment/new-experiment').then((m) => m.NewExperiment)
   }
   ```

3. 在元件的 constructor 呼叫 `setPageMeta()` 設定該頁的 `<title>` 與描述。
4. 在 [`projects.data.ts`](./src/app/features/home/projects.data.ts) 的 `PROJECTS` 加一筆，首頁就會自動出現卡片：

   ```ts
   {
     slug: 'new-experiment',        // 對應 /pages/new-experiment
     type: 'INTERACTIVE TOY',
     title: 'New Experiment',
     summary: '一到兩句話的說明。'
   }
   ```

   還沒做完時加上 `draft: true`，首頁就不會列出，但頁面仍可直接開啟。

5. 顏色、字型、圓角一律使用 `src/styles/tokens.css` 的變數；能用 `ui.css` 的元件就不要重寫。
6. 為互動元件補上鍵盤操作、焦點狀態與必要的 ARIA 標記。
7. 若作品有值得說明的參數或後端行為，在該 feature 目錄放一份 `README.md`，並在上方「作品」表格加一列。

其餘規則（Signals、Signal Forms、命名、邊界）見 [CLAUDE.md](./CLAUDE.md)。

## 後端

前端是純靜態的，沒有伺服器。需要寫入 Google Sheet、保管 API 金鑰之類的能力時，由 Google Apps Script Web App 承接。

**所有作品共用一個 Apps Script 專案與一組部署網址**，靠請求中的 `app` 欄位分流。新增作品不需要再開新專案、也不需要再記一組網址。

後端也負責保管 API 金鑰。Deep Talk 用它呼叫 Gemini 生成新題目，以及在使用者按下按鈕時生幾個追問 —— 金鑰只存在 Apps Script 的指令碼屬性，不會出現在前端。

部署步驟、日常維護、新增作品要改哪裡、除錯方式與已知限制（不支援串流、冷啟動、配額、無法辨識用戶端 IP）見 [apps-script/README.md](./apps-script/README.md)。

程式碼可以用 clasp 直接從這個儲存庫推送，不必手動複製貼上到編輯器。改完 `.gs` 之後：

```powershell
npm run gs:push
```

```powershell
npm run gs:deploy -- "改了什麼"
```

網址不變，前端不用動。完整速查表見 [apps-script/README.md](./apps-script/README.md#改了-gs-之後要跑什麼)。

## 本機開發

### 需求

- Node.js 24 LTS 以上（Angular 22 需要 `^22.22.3 || ^24.15.0 || >=26.0.0`）
- 網路連線：載入 Google Fonts 與測試 Apps Script Web App 時需要

```powershell
npm install
```

### 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm start` | 開發伺服器（<http://localhost:4200/>） |
| `npm run build` | production build，含 prerender |
| `npm test` | 前端 + 後端全部測試 |
| `npm run test:frontend` | Angular 單元測試（Vitest） |
| `npm run test:backend` | Apps Script 回歸測試 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

開發伺服器走根路徑，production build 才會掛上 `/web-toybox/` 的 base href。

## 修改與測試流程

提交前至少跑過：

```powershell
npm run lint
```

```powershell
npm test
```

```powershell
npm run build
```

自動化測試蓋不到的部分，手動確認：

- 首頁與更動到的作品在桌面、窄螢幕（375px）下皆可正常顯示，沒有水平捲軸。
- 鍵盤可以完成整個互動流程。
- 啟用「減少動態效果」後不會出現不必要動畫。
- 瀏覽器主控台沒有未處理錯誤。
- build 產物裡每個公開路徑都有實體 `index.html`，且各自帶正確的 `<title>` 與描述。

作品各自的測試重點寫在該作品的 README，例如[邀請卡的測試清單](./src/app/features/invitation-card/README.md#測試清單)。

後端測試的寫法與涵蓋範圍見 [apps-script/README.md](./apps-script/README.md#測試)。

## 部署至 GitHub Pages

部署由 [GitHub Actions](./.github/workflows/deploy.yml) 負責：推送到 `main` 就會自動 lint、測試、build，並把 `dist/web-toybox/browser/` 發布出去。

首次啟用需要在儲存庫的 **Settings → Pages → Build and deployment** 把 Source 設為 **GitHub Actions**（不是從分支部署）。

一般更新流程：

```powershell
git add .
git commit -m "描述本次變更"
git push origin main
```

## 隱私與安全

- 不要把 API 私鑰、存取權杖或帳號密碼放進前端檔案。Apps Script Web App 網址會出現在瀏覽器端程式碼中，**不應視為私密金鑰**。
- 網址查詢參數都是使用者可以修改的公開資料，不能當作身分驗證。
- 分享網址中不要放真實姓名、Email、電話或其他敏感資訊。
- 伺服器寫入時間只適合一般紀錄，不應作為正式稽核時間。
- Google Sheet 與 Apps Script 是第三方服務；正式收集資料前，應確認其配額、資料保存與隱私設定符合需求。

## 授權

本專案採用 [MIT License](./LICENSE)。
