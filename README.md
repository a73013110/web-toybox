# Web Toybox

一個以原生 HTML、CSS 與 JavaScript 製作的互動網頁作品集。無需建置工具或前端框架，可直接部署到 GitHub Pages。

- 線上首頁：<https://a73013110.github.io/web-toybox/>
- 授權方式：[MIT License](./LICENSE)

## 特色

- **零建置流程**：網站本體不需要 Node.js、套件管理器或打包工具。
- **共用設計層**：色票、字型與常用元件集中在 `shared/`，新增作品不必複製貼上。
- **獨立作品結構**：每個作品放在 `pages/<作品名稱>/`，互不干擾。
- **響應式設計**：支援桌面與行動裝置。
- **無障礙考量**：提供語意化標籤、鍵盤焦點、讀屏提示與減少動態效果支援。

## 作品

| 作品 | 說明 | 文件 |
| --- | --- | --- |
| [Invitation Card](https://a73013110.github.io/web-toybox/pages/invitation-card/) | 五步驟互動邀請卡，結果寫入 Google Sheet | [說明](./pages/invitation-card/README.md) |

作品清單由 [`shared/projects.js`](./shared/projects.js) 提供，首頁的卡片與件數會自動產生。

## 專案結構

```text
web-toybox/
├── index.html                       # 作品集首頁（卡片由 JavaScript 產生）
├── 404.html                         # 找不到頁面（樣式內嵌，任意路徑下都能正確顯示）
├── robots.txt
├── .nojekyll                        # 關閉 GitHub Pages 的 Jekyll 處理
├── package.json                     # 僅供開發工具（clasp），網站本體用不到
├── .clasp.json.example              # clasp 設定範本
├── LICENSE
├── README.md
├── assets/
│   ├── favicon.svg                  # 網站圖示
│   ├── home.css                     # 首頁專屬樣式
│   └── home.js                      # 依作品清單渲染首頁卡片
├── shared/                          # 全站共用
│   ├── tokens.css                   # 設計 token：色票、字型、版面尺寸
│   ├── base.css                     # 全域重設與無障礙基礎
│   ├── ui.css                       # 共用元件：按鈕、標籤、輸入欄、返回連結
│   ├── projects.js                  # 作品清單（新增作品時唯一要改的資料）
│   ├── config.js                    # 後端部署網址與逾時設定
│   └── api.js                       # 呼叫 Apps Script 的共用送出層
├── templates/
│   └── page-starter/                # 新作品骨架，複製到 pages/ 後改名即可
├── apps-script/                     # Google Apps Script 後端（單一專案，所有作品共用）
│   ├── README.md                    # 部署與維護手冊
│   ├── appsscript.json
│   ├── main.gs                      # 入口：路由、健康檢查、節流
│   ├── lib.gs                       # 共用：驗證、試算表寫入、防公式注入
│   └── app-invitation-card.gs       # 邀請卡的處理函式
└── pages/
    └── invitation-card/
        ├── README.md
        ├── index.html
        ├── style.css
        └── script.js
```

## 共用層

樣式分成三層，載入順序不能顛倒（`base.css` 與 `ui.css` 都依賴 `tokens.css` 的變數）：

| 檔案 | 內容 |
| --- | --- |
| `shared/tokens.css` | `--ink`、`--gold`、`--paper`、`--surface`、`--font-sans`、`--radius` 等變數。**全站唯一的色票來源**，作品目錄不應該再宣告色碼 |
| `shared/base.css` | box-sizing、邊界重設、focus 樣式、`prefers-reduced-motion` 支援 |
| `shared/ui.css` | `.btn` / `.btn-primary` / `.btn-link` / `.btn-wide`、`.eyebrow`、`.mark`、`.divider`、`.input`、`.field-error`、`.sr-only`、`.back-link` |

作品專屬的變化寫進該作品自己的 `style.css`，不要改共用檔。

需要把資料送到後端時，一律走 `shared/api.js` 的 `submitToAppsScript()`，不要在各作品自己寫 `fetch`：

```js
import { submitToAppsScript, describeSubmitError } from '../../shared/api.js';

try {
  await submitToAppsScript('my-toy', { schemaVersion: 1, value });
} catch (error) {
  errorLabel.textContent = describeSubmitError(error);
}
```

它已處理逾時、跨網域與回應判讀。使用時 `<script>` 需要加上 `type="module"`。

## 新增作品

1. 複製 `templates/page-starter/` 到 `pages/<作品名稱>/`，目錄名稱使用全小寫、連字號分隔。
2. 修改 `index.html` 的標題、描述與內容；樣式與腳本留在同一個作品目錄。
3. 顏色、字型、圓角一律使用 `shared/tokens.css` 的變數；能用 `shared/ui.css` 的元件就不要重寫。
4. 使用相對路徑，確保部署在 GitHub Pages 子路徑時仍能運作。
5. 在 [`shared/projects.js`](./shared/projects.js) 的 `PROJECTS` 加一筆，首頁就會自動出現卡片：

   ```js
   {
     slug: 'new-experiment',        // 對應 pages/new-experiment/
     type: 'INTERACTIVE TOY',
     title: 'New Experiment',
     summary: '一到兩句話的說明。'
   }
   ```

   還沒做完時加上 `draft: true`，首頁就不會列出，但頁面仍可直接開啟。

6. 為互動元件補上鍵盤操作、焦點狀態與必要的 ARIA 標記。
7. 若作品有值得說明的參數或後端行為，在作品目錄放一份 `README.md`，並在上方「作品」表格加一列。

## 後端

靜態網站沒有後端。需要寫入 Google Sheet、保管 API 金鑰之類的能力時，由 Google Apps Script Web App 承接。

**所有作品共用一個 Apps Script 專案與一組部署網址**，靠請求中的 `app` 欄位分流。新增作品不需要再開新專案、也不需要再記一組網址。

部署步驟、日常維護、新增作品要改哪裡、除錯方式與已知限制（不支援串流、冷啟動、配額、無法辨識用戶端 IP）見 [apps-script/README.md](./apps-script/README.md)。

程式碼可以用 clasp 直接從這個儲存庫推送，不必手動複製貼上到編輯器：

```powershell
npm run gs:push
npm run gs:redeploy -- <deploymentId> -d "說明"
```

## 本機開發

### 需求

- 任一現代瀏覽器
- Python 3，或其他可啟動靜態伺服器的工具
- 網路連線：載入 Google Fonts 與測試 Apps Script Web App 時需要

以上就是改網頁需要的全部。只有在要用 clasp 部署 Apps Script 時才需要 Node.js：

```powershell
npm install
```

`package.json` 與 `node_modules/` 只服務開發工具，GitHub Pages 部署完全不會用到。設定方式見 [apps-script/README.md](./apps-script/README.md#用-clasp-從儲存庫直接推送)。

### 啟動

在專案根目錄執行：

```powershell
python -m http.server 8000
```

接著開啟 <http://localhost:8000/>。

首頁使用 ES module 載入作品清單，**必須透過本機伺服器開啟**，直接雙擊 HTML 檔案會因為瀏覽器限制而無法載入。

## 修改與測試流程

此專案沒有自動化測試或建置步驟。提交前至少手動確認：

- 首頁與更動到的作品在桌面、窄螢幕（375px）下皆可正常顯示，沒有水平捲軸。
- 鍵盤可以完成整個互動流程。
- 啟用「減少動態效果」後不會出現不必要動畫。
- 瀏覽器主控台沒有未處理錯誤。

作品各自的測試重點寫在該作品的 README，例如[邀請卡的測試清單](./pages/invitation-card/README.md#測試清單)。

JavaScript 語法可用 Node.js 額外檢查；此步驟非執行網站的必要條件：

```powershell
node --check pages/invitation-card/script.js
```

## 部署至 GitHub Pages

1. 將變更提交並推送到 GitHub。
2. 進入儲存庫的 **Settings → Pages**。
3. 在 **Build and deployment** 選擇從分支部署。
4. 選擇 `main` 分支與根目錄 `/ (root)`。
5. 儲存並等待 GitHub Pages 完成發布。

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
