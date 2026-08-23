# Google Apps Script 後端

靜態網站沒有後端，需要伺服器端能力（寫入 Google Sheet、保管 API 金鑰）時，由 Apps Script Web App 承接。

目前每個作品各有一份原始碼，例如 [`invitation-card/Code.gs`](./invitation-card/Code.gs)。

## 部署方式

原始碼同步保存在這個目錄，但**不會自動同步到 Google**。更新後需要：

1. 把 `.gs` 內容複製到 Google Apps Script 編輯器。
2. 建立新的部署版本。
3. 確認前端使用的 `/exec` 網址仍然正確。

> 作品變多後建議改用 [`clasp`](https://github.com/google/clasp) 直接從儲存庫推送，避免手動複製貼上。`.clasp.json` 含 script ID，已列入 `.gitignore`。

## 指令碼屬性

試算表 ID 本身不是存取密碼，但會暴露文件識別資訊，因此不寫進公開儲存庫。請在 Apps Script 的「專案設定 → 指令碼屬性」設定：

| 屬性 | 值 |
| --- | --- |
| `INVITATION_RESPONSES_SPREADSHEET_ID` | Google Sheet 網址中 `/d/` 與 `/edit` 之間的檔案 ID |

未來若要串接 Google AI 等服務，API 金鑰也放在指令碼屬性，前端看不到。

Google Sheet 仍應保持私人，僅分享給需要查看結果的帳號。指令碼屬性只負責避免在 Git 中留下 ID，**不能取代 Google Sheet 本身的權限設定**。

## 前端如何呼叫

### 跨網域

`/exec` 會以 302 轉址到 `script.googleusercontent.com`，最終回應帶有 `Access-Control-Allow-Origin: *`。因此前端可以用一般的 CORS 請求直接讀到 JSON 結果，**不需要 `mode: 'no-cors'`**，也不必用等待時間猜測是否成功。

請求必須維持「簡單請求」，否則瀏覽器會先送出 Apps Script 不支援的 CORS 預檢而失敗：

```js
fetch(ENDPOINT, {
  method: 'POST',
  redirect: 'follow',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(payload)
});
```

### 回應約定

Apps Script 即使驗證失敗也會回傳 HTTP 200，因此必須檢查 body 的 `ok` 欄位：

| 回應 | 意義 |
| --- | --- |
| `{"ok": true}` | 已寫入工作表 |
| `{"ok": false, "error": "invalid_request"}` | 欄位驗證失敗，未寫入任何資料 |

## 撰寫 `.gs` 時的注意事項

- **驗證所有欄位並限制長度。** Web App 網址會出現在瀏覽器端程式碼中，任何人都能對它送出請求。
- **防止公式注入。** 以 `=`、`+`、`-`、`@` 開頭的字串在 Google Sheet 會被當成公式，寫入前要加上前綴單引號。
- **用 `LockService` 序列化寫入**，避免多人同時送出時資料交錯。
- **用伺服器時間**（`new Date()`）而不是前端傳來的時間。
- **不要回傳詳細錯誤內容給前端**，避免洩漏內部結構。
- 不要透過這類表單收集密碼、證件號碼或其他敏感資料。

## 已知限制

規劃新功能前需要先接受的天花板：

| 項目 | 限制 |
| --- | --- |
| 回應方式 | `ContentService` 只能一次回傳完整內容，**不支援串流**。AI 類功能無法做逐字浮現的效果 |
| 冷啟動 | 閒置後首次呼叫可能要數秒，前端 timeout 需放寬（目前邀請卡設 30 秒） |
| 執行時間 | 免費帳號單次上限約 6 分鐘 |
| `UrlFetchApp` | 免費帳號每日約 20,000 次 |
| 授權範圍 | OAuth 範圍是整個專案共用。需要 Gmail、Calendar、Drive 權限的功能應獨立成另一個專案，不要和其他作品混在一起 |

需要串流回應、更高流量或真正的 CORS 控制時，替代方案是 Cloudflare Workers（免費額度較高、原生支援 SSE 串流）。前端只要把送出邏輯集中在一處，之後更換後端只需改動那一個檔案。
