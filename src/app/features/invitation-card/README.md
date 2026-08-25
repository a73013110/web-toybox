# Invitation Card

五步驟互動邀請卡，完成後把結果寫入 Google Sheet。

- 線上版本：<https://a73013110.github.io/web-toybox/pages/invitation-card/>
- 後端說明：[apps-script/README.md](../../../../apps-script/README.md)

## 流程

1. 接受邀請，或與會閃避的拒絕按鈕互動。
2. 確認邀請。
3. 選擇「空檔暗號」。
4. 複選想進行的活動（可自行填寫一項）。
5. 送出結果並顯示行程摘要。

沒有帶 `invite` 參數時，會先跳出詢問稱呼的畫面，填完才進入邀請卡。

## Google Sheet 欄位

送出成功後，`responses` 工作表會新增一列：

| 欄位 | 說明 |
| --- | --- |
| `receivedAt` | Apps Script 寫入資料時的伺服器時間 |
| `invite` | 分享網址中的對象代號；沒有提供時為 `未指定` |
| `declineCount` | 這次流程按下「先不要」及其變化按鈕的次數，範圍為 `0` 至 `5` |
| `timing` | 對方選擇的空檔暗號 |
| `activities` | 對方選擇的活動，以頓號分隔 |
| `page` | 對方填寫時的完整頁面網址 |
| `schemaVersion` | 前後端資料結構版本，目前為 `1` |

工作表第一列的順序：

```text
收件時間｜邀請對象｜先不要點擊次數｜空檔暗號｜活動｜頁面網址｜資料版本
```

## 分享網址

### 基本網址

只分享給一個人，或不需要辨識填寫者時：

```text
https://a73013110.github.io/web-toybox/pages/invitation-card/
```

### 指定邀請對象

加入 `invite` 參數，結果會帶上對象代號：

```text
https://a73013110.github.io/web-toybox/pages/invitation-card/?invite=amy
https://a73013110.github.io/web-toybox/pages/invitation-card/?invite=bob
```

建議只使用不敏感的英文代號、暱稱或流水號。使用者可以自行修改網址，因此 `invite` **不能當作登入、授權或身分驗證機制**。

代號含空白、中文或特殊字元時要先編碼：

```js
const invite = encodeURIComponent('Amy 測試'); // 避免特殊字元破壞網址。
const url = `https://a73013110.github.io/web-toybox/pages/invitation-card/?invite=${invite}`;
```

### 標記發布版本

`v` 參數可標記分享時的版本，建議填 Git commit 短雜湊：

```powershell
$version = git rev-parse --short HEAD
Write-Output "https://a73013110.github.io/web-toybox/pages/invitation-card/?v=$version&invite=amy"
```

| 參數 | 必填 | 用途 |
| --- | --- | --- |
| `invite` | 否 | 在 Google Sheet 結果中辨識邀請對象 |
| `v` | 否 | 標記分享版本，方便追蹤與產生不同的頁面網址 |

> `v` 不會被 JavaScript 讀取，也不會改變頁面功能。頁面資源本身沒有掛手動的 `?v=` 參數：GitHub Pages 對靜態檔案的快取上限約 10 分鐘，更新後稍待即可生效。若日後需要即時失效，應改為替檔名產生內容雜湊，而不是手動維護版本參數。

## 送出行為

Endpoint 設定於 [`apps-script-config.ts`](../../core/api/apps-script-config.ts)，送出走 [`invitation-card.api.ts`](./invitation-card.api.ts)。送出時：

- 使用一般 CORS 請求並讀取 Apps Script 回傳的 JSON，確認寫入成功才進入摘要畫面。
- 等待過場的文字會持續循環，直到有結果為止；Apps Script 冷啟動可能要數秒。
- 逾時（30 秒）與一般失敗顯示不同訊息，選項會解鎖讓使用者直接重送。
- 同一份選擇送出後按鈕會變成「已送出」，避免重複提交；改動選擇後才會重新啟用。

回應格式與限制見 [apps-script/README.md](../../../../apps-script/README.md)。

## 測試清單

改動後至少手動確認：

- 桌面與窄螢幕（375px）皆可正常顯示，沒有水平捲軸。
- 鍵盤可以完成整個互動流程。
- 未選擇時，按鈕與錯誤訊息狀態正確。
- 傳送期間不能重複提交，成功後才進入摘要畫面。
- 模擬離線或錯誤 Endpoint 時顯示重試訊息，且選項會解鎖、可以直接重送。
- Apps Script 回應較慢時，等待過場的文字會持續輪替而不是提早停住。
- 啟用「減少動態效果」後不會出現不必要動畫。
- 瀏覽器主控台沒有未處理錯誤。
