# Web Toybox

一個以原生 HTML、CSS 與 JavaScript 製作的互動網頁作品集。無需建置工具或前端框架，可直接部署到 GitHub Pages。

- 線上首頁：[Web Toybox](https://a73013110.github.io/web-toybox/)
- 邀請卡：[Invitation Card](https://a73013110.github.io/web-toybox/pages/invitation-card/)
- 授權方式：[MIT License](./LICENSE)

## 特色

- **零建置流程**：不需要 Node.js、套件管理器或打包工具。
- **獨立作品結構**：每個作品放在 `pages/<作品名稱>/`，方便新增與維護。
- **響應式設計**：支援桌面與行動裝置。
- **無障礙考量**：提供語意化標籤、鍵盤焦點、讀屏提示與減少動態效果支援。
- **靜態部署**：可直接使用 GitHub Pages 託管。

## 目前作品

### Invitation Card

五步驟互動邀請卡：

1. 接受邀請或與趣味拒絕按鈕互動。
2. 確認邀請。
3. 選擇「空檔暗號」。
4. 複選想進行的活動。
5. 將結果透過 Google Apps Script 傳送至 Google Sheet，並顯示行程摘要。

完成送出後，Google Sheet 會記錄以下欄位：

| 欄位 | 說明 |
| --- | --- |
| `invite` | 分享網址中的對象代號；沒有提供時為 `未指定` |
| `timing` | 對方選擇的空檔暗號 |
| `activities` | 對方選擇的活動，以頓號分隔 |
| `receivedAt` | Apps Script 寫入資料時的伺服器時間 |
| `page` | 對方填寫時的完整頁面網址 |
| `schemaVersion` | 前後端資料結構版本，目前為 `1` |
| `declineCount` | 這次流程按下「先不要」及其變化按鈕的次數，目前範圍為 `0` 至 `5` |

## 分享邀請卡

### 基本網址

如果只分享給一個人，或不需要辨識填寫者，可以直接使用：

```text
https://a73013110.github.io/web-toybox/pages/invitation-card/
```

### 指定邀請對象

在網址加入 `invite` 查詢參數，可讓 Google Sheet 結果帶上對象代號：

```text
https://a73013110.github.io/web-toybox/pages/invitation-card/?invite=amy
```

分享給不同對象時，替換代號即可：

```text
https://a73013110.github.io/web-toybox/pages/invitation-card/?invite=bob
https://a73013110.github.io/web-toybox/pages/invitation-card/?invite=charlie
```

建議只使用不敏感的英文代號、暱稱或流水號。`invite` 只是方便辨識，使用者可以自行修改網址，因此**不能當作登入、授權或身分驗證機制**。

### 同時標記發布版本

可以加入 `v` 參數標記分享時使用的版本，建議填入 Git commit 的短雜湊：

```text
https://a73013110.github.io/web-toybox/pages/invitation-card/?v=55810ef&invite=amy
```

取得目前版本：

```powershell
git rev-parse --short HEAD
```

參數說明：

| 參數 | 必填 | 用途 |
| --- | --- | --- |
| `invite` | 否 | 在 Google Sheet 結果中辨識邀請對象 |
| `v` | 否 | 標記分享版本，方便追蹤與產生不同的頁面網址 |

> `v` 目前不會被 JavaScript 讀取，也不會改變頁面功能。它可作為版本識別，但無法嚴格保證 CSS 與 JavaScript 資源立即刷新；若要完整的快取失效策略，應替靜態資源檔名產生內容雜湊，或在資源網址上同步加入版本參數。

如果代號包含空白、中文或特殊字元，建立網址時應進行 URL 編碼：

```js
const invite = encodeURIComponent('Amy 測試'); // 避免特殊字元破壞網址。
const url = `https://a73013110.github.io/web-toybox/pages/invitation-card/?invite=${invite}`;
```

## 查看邀請結果

1. 開啟綁定 Apps Script 的 Google Sheet。
2. 進入 `responses` 工作表。
3. 查看每次送出的伺服器時間、邀請對象、空檔暗號、活動、頁面網址、資料版本與「先不要」點擊次數。

目前使用的 Web App Endpoint 設定於 [`pages/invitation-card/script.js`](./pages/invitation-card/script.js)：

```js
const GOOGLE_SHEETS_ENDPOINT = 'https://script.google.com/macros/s/.../exec'; // Apps Script 正式部署網址。
```

Apps Script Web App 網址會出現在瀏覽器端程式碼中，不應視為私密金鑰。Web App 必須驗證欄位與限制長度，並避免透過此表單收集密碼、證件號碼或其他敏感資料。

### 維護 Apps Script

Apps Script 原始碼同步保存在 [`apps-script/invitation-card/Code.gs`](./apps-script/invitation-card/Code.gs)。更新後需將內容複製至 Google Apps Script，建立新部署版本，前端才會使用更新後的程式。

試算表 ID 本身不是存取密碼，但會暴露文件識別資訊，因此不直接寫入公開儲存庫。請在 Apps Script 的「專案設定 → 指令碼屬性」新增：

| 屬性 | 值 |
| --- | --- |
| `INVITATION_RESPONSES_SPREADSHEET_ID` | Google Sheet 網址中 `/d/` 與 `/edit` 之間的試算表檔案 ID |

`responses` 工作表第一列應依序建立以下欄位：

```text
收件時間｜邀請對象｜空檔暗號｜活動｜頁面網址｜資料版本｜先不要點擊次數
```

Google Sheet 仍應保持私人，僅分享給需要查看結果的帳號。指令碼屬性只負責避免在 Git 中留下 ID，不能取代 Google Sheet 本身的權限設定。

## 專案結構

```text
web-toybox/
├── index.html                       # 作品集首頁
├── style.css                        # 首頁樣式
├── favicon.svg                      # 網站圖示
├── LICENSE
├── README.md
├── apps-script/
│   └── invitation-card/
│       └── Code.gs                  # Google Apps Script 後端原始碼
├── shared/
│   └── base.css                     # 共用基礎樣式
└── pages/
    └── invitation-card/
        ├── index.html               # 邀請卡結構
        ├── style.css                # 邀請卡樣式與動畫
        └── script.js                # 互動狀態與 Google Sheet 送出流程
```

## 本機開發

### 需求

- 任一現代瀏覽器
- Python 3，或其他可啟動靜態伺服器的工具
- 網路連線：載入 Google Fonts 與測試 Apps Script Web App 時需要

### 啟動本機伺服器

在專案根目錄執行：

```powershell
python -m http.server 8000
```

接著開啟：

```text
http://localhost:8000/
```

邀請卡測試網址：

```text
http://localhost:8000/pages/invitation-card/?invite=local-test
```

建議使用本機伺服器，而不是直接雙擊 HTML 檔案，以便更接近 GitHub Pages 的實際執行環境。

## 修改與測試流程

此專案目前沒有自動化測試或建置步驟。提交前至少手動確認：

- 首頁與邀請卡在桌面、窄螢幕下皆可正常顯示。
- 鍵盤可以完成整個互動流程。
- 未選擇時，按鈕和錯誤訊息狀態正確。
- Google Sheet 傳送期間不能重複提交。
- 傳送成功後才進入摘要畫面。
- 模擬離線或錯誤 Endpoint 時會顯示重試訊息。
- 啟用「減少動態效果」後不會出現不必要動畫。
- 瀏覽器主控台沒有未處理錯誤。

JavaScript 語法可使用 Node.js 額外檢查；此步驟非執行網站的必要條件：

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

部署完成後，可使用短 commit 雜湊更新分享網址的 `v` 參數：

```powershell
$version = git rev-parse --short HEAD
Write-Output "https://a73013110.github.io/web-toybox/pages/invitation-card/?v=$version&invite=amy"
```

## 新增作品

1. 在 `pages/` 下建立語意清楚、全小寫且以連字號分隔的目錄。
2. 至少提供獨立的 `index.html`；樣式與腳本放在同一作品目錄。
3. 優先使用 `shared/base.css` 中既有的重設與共用規則。
4. 使用相對路徑，確保專案部署在 GitHub Pages 子路徑時仍能運作。
5. 在根目錄 `index.html` 加入作品卡片，並同步更新本文件。
6. 為互動元件補上鍵盤操作、焦點狀態與必要的 ARIA 標記。

建議結構：

```text
pages/
└── new-experiment/
    ├── index.html
    ├── style.css
    └── script.js
```

## 隱私與安全

- 不要把 API 私鑰、存取權杖或帳號密碼放進前端檔案。
- `invite` 與 `v` 都是使用者可修改的公開參數。
- 分享網址中不要放真實姓名、Email、電話或其他敏感資訊。
- 收件時間由 Apps Script 寫入，仍只適合一般紀錄，不應作為正式稽核時間。
- Google Sheet 與 Apps Script 是第三方服務；正式收集資料前，應確認其配額、資料保存與隱私設定符合需求。

## 授權

本專案採用 [MIT License](./LICENSE)。
