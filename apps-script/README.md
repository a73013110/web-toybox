# Google Apps Script 後端

靜態網站沒有後端。需要伺服器端能力（寫入 Google Sheet、保管 API 金鑰）時，由 Google Apps Script Web App 承接。

**整個 Web Toybox 只維護這一個 Apps Script 專案**，所有作品共用同一組部署網址，靠請求裡的 `app` 欄位分流。

## 改了 `.gs` 之後要跑什麼

在儲存庫根目錄：

```bash
npm test                          # 確認沒改壞
npm run gs:push                   # 上傳程式碼（此時線上還沒變）
npm run gs:deploy -- "改了什麼"    # 生效，網址不變
```

**網址不變，前端不用動。**

說明可以省略：`npm run gs:deploy`。部署 ID 會自動從 `shared/config.js` 讀出來，不用去查。

改完記得一起 commit，儲存庫才不會落後。

### 其他情境

| 想做的事                     | 指令                     |
| ---------------------------- | ------------------------ |
| 跑測試                       | `npm test`               |
| 看會推送哪些檔案             | `npm run gs:status`      |
| 出錯了想看執行紀錄           | `npm run gs:logs`        |
| 在網頁編輯器改過，想拉回本地 | `npm run gs:pull`        |
| 開啟 Apps Script 專案        | `npm run gs:open`        |
| 開啟部署好的 Web App         | `npm run gs:web`         |
| 列出所有部署                 | `npm run gs:deployments` |

> ⚠️ **不要直接用 `npx clasp deploy`。** 那會建立全新部署與全新網址，前端就連不到了。
> `npm run gs:deploy` 走的是 `clasp redeploy`，更新現有部署、保留網址。

第一次使用需要先設定，見[用 clasp 從儲存庫直接推送](#用-clasp-從儲存庫直接推送)。

## 先搞懂三個名詞

| 名詞                   | 意思                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **專案（Project）**    | 一包 `.gs` 程式碼。可以是「綁定式」（掛在某張試算表底下，試算表刪掉就跟著消失）或「獨立式」（存在你的雲端硬碟，自己就是一個檔案）。本專案使用**獨立式** |
| **部署（Deployment）** | 把專案的某個版本發布成可以被呼叫的網址。同一個專案可以有多個部署                                                                                        |
| **版本（Version）**    | 程式碼的快照。**改完程式碼不會自動生效，必須建立新版本並更新部署**                                                                                      |

最容易踩的一點：**改完程式按儲存，線上服務不會變。** 一定要重新部署。

## 檔案結構

Apps Script 沒有真正的資料夾，所有 `.gs` 檔共用同一個全域範圍。

| 檔案                     | 用途                                                 |
| ------------------------ | ---------------------------------------------------- |
| `appsscript.json`        | 專案設定（時區、執行環境、Web App 權限、OAuth 範圍） |
| `main.gs`                | 入口：`doPost` 路由、`doGet` 健康檢查、節流上限      |
| `lib.gs`                 | 共用工具：回應格式、欄位驗證、試算表寫入、防公式注入 |
| `app-invitation-card.gs` | 邀請卡的處理函式                                     |
| `app-deep-talk.gs`       | Deep Talk：發牌、收回饋、熱門排行                    |
| `app-deep-talk-ai.gs`    | Deep Talk：用 Gemini 生成新題目                      |
| `test/`                  | 回歸測試，不會被推送到 Apps Script                   |

> **跨檔案的順序陷阱**：函式宣告會被提升，跨檔案呼叫沒問題；但「頂層的 `const` 引用另一個檔案的頂層 `const`」可能讀到 `undefined`，因為檔案執行順序不保證。所以路由寫成 `routeRequest()` 函式而不是物件常數表。在函式**內部**引用其他檔案的常數則是安全的。

## 首次建立（從綁定式遷移到獨立式）

原本的腳本掛在 Google Sheet 底下。以下步驟建立獨立專案，**舊的腳本先不要刪** —— 遷移期間它還在服務已經開啟的分頁。

### 1. 建立獨立專案

1. 開啟 <https://script.google.com/>
2. 左上角「**新專案**」
3. 點左上角專案名稱（預設 `未命名專案`），改成 `Web Toybox Backend`

### 2. 貼上程式碼

新專案預設有一個 `程式碼.gs`。依序建立四個檔案：

1. 點 `程式碼.gs` 右邊的三個點 → **重新命名** → 改成 `main`（不用打 `.gs`），把 [`main.gs`](./main.gs) 的內容整份貼進去
2. 左側「檔案」旁的 **+** → **指令碼** → 命名 `lib`，貼上 [`lib.gs`](./lib.gs)
3. 同樣新增 `app-invitation-card`，貼上 [`app-invitation-card.gs`](./app-invitation-card.gs)
4. 左側齒輪「**專案設定**」→ 勾選「**在編輯器中顯示 `appsscript.json` 資訊清單檔案**」，回到編輯器就會多一個 `appsscript.json`，用 [本目錄的版本](./appsscript.json)覆蓋

按 Ctrl+S 儲存。

### 3. 設定試算表 ID

試算表 ID 不寫進程式碼，避免提交到公開儲存庫。

1. 開啟你的 Google Sheet，網址長這樣：
   `https://docs.google.com/spreadsheets/d/`**`這一段就是 ID`**`/edit`
2. 回到 Apps Script → 左側齒輪「**專案設定**」→ 最下方「**指令碼屬性**」→ **新增指令碼屬性**

| 屬性                                  | 值                |
| ------------------------------------- | ----------------- |
| `INVITATION_RESPONSES_SPREADSHEET_ID` | 上面複製的那段 ID |

3. 儲存指令碼屬性

確認試算表裡有一個名為 `responses` 的工作表，第一列依序是：

```text
收件時間｜邀請對象｜先不要點擊次數｜空檔暗號｜活動｜頁面網址｜資料版本
```

### 4. 部署成 Web App

1. 右上角「**部署**」→「**新增部署作業**」
2. 左邊齒輪 → 選「**網頁應用程式**」
3. 設定：

| 欄位               | 選擇               | 為什麼                                                                             |
| ------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| 說明               | `v1` 之類          | 自己看的                                                                           |
| 執行身分           | **我（你的帳號）** | 訪客沒有你試算表的權限，必須以你的身分寫入                                         |
| 具有存取權的使用者 | **任何人**         | 要讓沒登入 Google 的訪客也能送出。選「任何擁有 Google 帳戶的使用者」會擋掉大部分人 |

4. 「**部署**」

### 5. 通過授權畫面

第一次部署會要求授權，畫面有點嚇人，這是正常的：

1. 「**授予存取權**」→ 選你的帳號
2. 出現「**Google 尚未驗證這個應用程式**」→ 點左下「**進階**」
3. 點「**前往 Web Toybox Backend（不安全）**」
4. 「**允許**」

會顯示這個警告，是因為這個應用程式沒有送 Google 審核 —— 它是你自己寫、只給自己用的腳本，不是第三方程式。

### 6. 複製網址並驗證

部署完成後會顯示「**網頁應用程式**」網址，長這樣：

```text
https://script.google.com/macros/s/AKfycb.../exec
```

**先用瀏覽器直接開這個網址**，應該看到：

```json
{ "ok": true, "service": "web-toybox", "apps": ["invitation-card"] }
```

看到這段就代表部署成功。這是 `doGet` 健康檢查，不會寫入任何資料。

### 7. 更新前端

把網址填進 [`shared/config.js`](../shared/config.js) 的 `APPS_SCRIPT_ENDPOINT`。

> **順序很重要**：新的前端送出的是 `{ app, payload }` 格式，舊的綁定式腳本看不懂。
> 請先完成部署、換好網址，再 `git push`。GitHub Pages 沒有更新前，線上版仍走舊流程，不會中斷。

### 8. 收尾

確認新流程正常運作幾天後，再回到原本的 Google Sheet →「擴充功能 → Apps Script」→ 把舊腳本的部署「**封存**」。兩邊寫的是同一張試算表，資料不會分家。

## 日常維護

### 改完程式碼要做什麼

1. 在編輯器改好，Ctrl+S 儲存
2. 右上角「**部署**」→「**管理部署作業**」
3. 找到現有部署，點右上角的**鉛筆圖示（編輯）**
4. 「版本」下拉選「**新版本**」
5. 「**部署**」

**網址不會變**，前端不用改。

> 如果你點的是「**新增部署作業**」，會拿到一組**全新的網址**，舊網址仍指向舊程式。這是最常見的困惑來源 —— 要更新現有服務，一律走「管理部署作業 → 編輯」。

記得把改動同步回這個目錄的 `.gs` 檔並提交，否則儲存庫的版本會落後。

設定好 clasp 之後，這整段可以縮成兩行，也不會有「忘記同步回儲存庫」的問題 —— 見文件開頭的[改了 `.gs` 之後要跑什麼](#改了-gs-之後要跑什麼)。

### 新增一個作品

1. 在本目錄建立 `app-<作品名稱>.gs`，實作 `handle<作品名稱>(payload)`
2. 在 `main.gs` 的 `routeRequest()` 加一個 `case`，並在 `supportedApps()` 加一筆
3. 若需要新的試算表，在指令碼屬性加一個 ID 屬性
4. 把三個檔案的內容同步到 Apps Script 編輯器，重新部署（同上）
5. 前端用 `submitToAppsScript('<作品名稱>', payload)` 送出

處理函式的形狀：

```js
function handleMyToy(payload) {
  const schemaVersion = normalizeInteger(payload.schemaVersion ?? 1, 'schema_version', 1, 999);
  const value = normalizeText(payload.value, 100);

  if (!value) throw requestError('missing_value');

  const sheet = openSheet('MY_TOY_SPREADSHEET_ID', 'responses');
  appendRowSafely(sheet, [new Date(), value, schemaVersion]);
}
```

`normalizeText` / `normalizeInteger` / `normalizeTextList` / `openSheet` / `appendRowSafely` / `requestError` 都由 `lib.gs` 提供，不需要重寫。

處理函式如果**回傳一個物件**，那個物件會被併進回應裡（`{ ...回傳值, ok: true }`）。只負責寫入的作品回傳 `undefined` 就好。需要回傳資料的例子見 `app-deep-talk.gs`。

需要快取、管理密鑰或洗牌時，`lib.gs` 另外提供 `readCachedJson` / `writeCachedJson` / `clearCachedJson`（會自動分塊，繞過 CacheService 每個 key 100KB 的上限）、`requireAdminKey`、`shuffled`。

### 測試

Apps Script 沒辦法在本機執行，正常只能「部署 → 手動送一筆 → 去試算表看」，而且測防公式注入、節流、長度上限這些路徑會在試算表留下垃圾資料。

`test/harness.js` 在 Node 裡把 `SpreadsheetApp`、`CacheService`、`LockService` 等全域物件換成假的，讓 `.gs` 的邏輯可以直接在本機驗證：

```bash
npm test
```

目前涵蓋 40 項：路由、欄位驗證、長度與數量上限、防公式注入、節流的時間分桶與快取存活時間，以及內部錯誤不外洩細節。

這些測試做過變異測試驗證 —— 刻意改壞防注入、節流上限、快取存活時間、路由 key、錯誤標記等 13 個地方，每一個都會讓測試失敗。

新增作品時，在 `test/` 建立 `<作品名稱>.test.js`，沿用同一個 harness：

```js
import { createGatewayHarness } from './harness.js';

const gs = createGatewayHarness({
  properties: { MY_TOY_SPREADSHEET_ID: 'FAKE' },
  sheets: ['responses']
});

gs.post({ app: 'my-toy', payload: { schemaVersion: 1, value: 'x' } }); // → 已解析的 JSON
gs.rows('responses'); // → 寫入的列
gs.advanceTime(60_000); // → 測試節流
```

至少涵蓋：欄位驗證失敗時**不寫入**、長度上限、以及該作品特有的規則。

### 除錯

- **健康檢查**：用瀏覽器開 `/exec`，看得到 JSON 就代表部署活著
- **執行紀錄**：Apps Script 左側「**執行作業**」，可以看到每次 `doPost` 的狀態與 `console.error` 的內容
- 前端拿到的錯誤一律是簡短代碼（見下表），詳細訊息只留在執行紀錄，避免洩漏內部結構

## Deep Talk 題庫

Deep Talk 的題目不在程式碼裡，而是在一張 Google Sheet。加題目、改題目、下架題目都只要編輯試算表，不用碰程式也不用重新部署。

### 試算表欄位

工作表名稱必須是 `questions`，第一列是標題列，欄位順序不能換（順序定義在 `app-deep-talk.gs` 的 `DEEPTALK_COLUMN`）。

| 欄  | 標題     | 內容                                   | 說明                         |
| --- | -------- | -------------------------------------- | ---------------------------- |
| A   | id       | `q001`                                 | 回饋靠它對應，不要重複       |
| B   | 題目     | 你什麼時候開始覺得，爸媽也只是普通人？ |                              |
| C   | 主題標籤 | `童年與家庭、價值觀`                   | 可多值，頓號分隔             |
| D   | 深度     | `深入`                                 | 單選：破冰／認識／深入／坦白 |
| E   | 關係階段 | `曖昧中、交往中`                       | 可多值。**留空代表通用**     |
| F   | 上架     | 核取方塊                               | 打勾才會出現在網站上         |
| G   | 來源     | `AI` 或 `手寫`                         | 方便你觀察 AI 生的品質       |
| H   | 建立時間 |                                        | AI 寫入時自動填              |
| I   | 讚       | `42`                                   | 程式回寫，不要手動改         |
| J   | 跳過     | `7`                                    | 程式回寫，不要手動改         |

C、D、E 三欄建議用「資料驗證 → 下拉式選單」，避免打錯字。選項必須與 `pages/deep-talk/taxonomy.js` 完全一致。

### 追問工作表

同一份試算表還要再開一張工作表，名稱是 `followups`，同樣第一列是標題列（順序定義在 `app-deep-talk-ai.gs` 的 `DEEPTALK_FOLLOWUP_COLUMN`）。

| 欄  | 標題         | 內容                           | 說明                                               |
| --- | ------------ | ------------------------------ | -------------------------------------------------- |
| A   | 題目id       | `q001`                         | 對應 `questions` 的 id                             |
| B   | 題目         | 你上一次為錢焦慮，是什麼時候？ | 冗餘存一份，讓你在這張表上直接看得懂               |
| C   | 想追問的方向 | 想聊他當時的心情               | **使用者打的字。不會顯示給任何人看**，只留給你稽核 |
| D   | 追問         | 你記得那天身上剩多少錢嗎？     | AI 生的。這一欄才是會被展示的內容                  |
| E   | 建立時間     |                                | 程式寫入時自動填                                   |
| F   | 顯示         | 核取方塊                       | 預設打勾。取消勾選就不再出現在別人的卡片上         |

一次生成會寫三列（一則追問一列），三列共用同一個方向。分開存是為了讓你可以單獨下架其中一則，而不是整批。

**C 欄不會被展示是刻意的。** 使用者的自由文字若直接給下一個人看，等於在這個作品上開了一個沒有審核的留言板；AI 的輸出至少經過結構化 schema 與提示詞的約束。你在這張表上看得到原文，是為了發現有人在亂用。

### 指令碼屬性

| 屬性                       | 必要                       | 用途                                                                 |
| -------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `DEEP_TALK_SPREADSHEET_ID` | 是                         | 題庫試算表的 ID                                                      |
| `DEEP_TALK_ADMIN_KEY`      | 是                         | 清快取與觸發 AI 生成用，自己隨便設一組長字串                         |
| `GEMINI_API_KEY`           | 要用 AI 生題目或追問就需要 | 從 Google AI Studio 申請。**全站共用一把**                           |
| `GEMINI_MODEL`             | 否                         | 預設 `gemini-3.5-flash-lite`。兩條路徑都只用結構化輸出、不開任何工具 |

`DEEP_TALK_GEMINI_API_KEY` 與 `DEEP_TALK_GEMINI_MODEL` 是作品專屬的覆寫，設了就蓋過共用的那組。平常不用設。

**為什麼是共用一把，不是每個作品一把**：Gemini 的速率限制綁在 Google Cloud 專案上，不是綁在金鑰上 —— 同一個專案底下開幾把金鑰都吃同一份額度，分開只是多一個要輪替的東西。而且所有作品共用同一個 Apps Script 專案與同一份指令碼屬性，金鑰外洩是整份一起沒，分開也縮不了爆炸半徑。真要隔離額度得開不同的 Cloud 專案，那是另一個層級的決定。

申請金鑰時記得在 Cloud Console 把它**限制成只能呼叫 Generative Language API**。IP 限制在這裡用不了：Apps Script 的對外 IP 不固定。

### 動作

前端一律送 `{ app: 'deep-talk', payload: { action: ... } }`。

| action             | 誰用   | 說明                              |
| ------------------ | ------ | --------------------------------- |
| `deck`             | 網站   | 依條件回傳一疊 8 張，含票數       |
| `feedback`         | 網站   | 一場結束時批次回寫讚／跳過        |
| `trending`         | 網站   | 熱門排行                          |
| `followup-history` | 網站   | 這一題最近被問過的追問，最多 3 則 |
| `followup`         | 網站   | 叫 Gemini 生 3 個追問並累積起來   |
| `flush`            | 只有你 | 清掉題庫與追問的快取，需要 `key`  |
| `generate`         | 只有你 | 叫 Gemini 生一批題目，需要 `key`  |

`followup` 是唯一一個「不需要密鑰、卻會花掉你的配額也會寫進試算表」的動作，防守見下面〈追問〉。

### 快取

整份題庫會快取 5 分鐘（`DEEPTALK_CACHE_SECONDS`），所以**改完試算表不會立刻生效**。想立刻生效：

```bash
curl -L -X POST "<你的 /exec 網址>" -H "Content-Type: text/plain;charset=utf-8" -d '{"app":"deep-talk","payload":{"action":"flush","key":"<你的 DEEP_TALK_ADMIN_KEY>"}}'
```

或者等五分鐘。用 AI 生成題目時會自動清快取，不用手動清。

### 用 Gemini 生新題目

刻意做成**手動觸發**，不是排程 —— 生成要花好幾秒又燒配額，你按一次才跑一次。

最簡單的方式是在 Apps Script 編輯器裡打開 `app-deep-talk-ai.gs`，改 `deepTalkGenerateFromEditor()` 裡的主題與深度，按執行，再去試算表看結果。

生出來的題目**「上架」欄一律留空**，你自己掃過一遍、勾起來才會出現在網站上。這道人工關卡是刻意保留的：AI 生的東西品質會飄，而且會一直想生出跟既有題目八成像的東西。程式只擋得掉「一模一樣」與「只差標點」的重複，語意相近的還是要靠你的眼睛。

同主題的既有題目會被餵回去當「不要重複這些」的反例，所以題庫越大、生出來的越不容易撞題，但提示詞也越長（上限 60 題）。

提示詞裡最重要的是 `deepTalkStyleRules()` —— 六種允許的句型、四種禁止的句型，加上七組「爛題 → 好題」對照。少了這一段，模型預設會寫出「你怎麼看待○○？」這種當場答不出來的論說文題目。改題庫或加新主題時，這段規則跟著一起看：[`pages/deep-talk/README.md`](../pages/deep-talk/README.md#怎麼寫一題好題目)。

**免費層送出去的內容 Google 會拿去改進產品，真人也可能看到。** 這個用途沒差（生的本來就是要公開的題目），但別拿同一把金鑰去送私人資料。

### 追問

卡片上那顆「聊不下去了？」按鈕。展開後分成兩段：先顯示**別人問過的追問**（讀 `followups` 工作表，不花配額也不用等），底下才是輸入框，想要新的才會叫 Gemini。預設路徑不燒配額，是這個設計的重點。

這是整個後端唯一一個一般使用者叫得動、又會花錢的動作，所以防守分成四層：

1. **只收題目 id。** 題目文字由後端自己去題庫查，而且只認已上架的題目。前端傳什麼文字都不算數 —— 否則這支 API 等於把你的金鑰做成一台公開的免費 LLM 代理。
2. **使用者輸入的方向限長 40 字**，而且在提示詞裡被夾在分隔線之間、明確標成題材參考，並告訴模型裡面的指示一律不算數。
3. **輸出被結構化 schema 限制成字串陣列**，就算真的被注入，模型也只能吐出追問。
4. **同一題配同一個方向，60 秒內重複點直接回上一次的結果**，擋掉手滑與好奇連點。

再加上 `main.gs` 全站每分鐘 60 次的節流，就是全部的防線了。

生出來的追問**不進待審區**，預設就給下一個人看得到 —— 這跟題目的做法相反，因為追問是即時的，等你審完再上架就沒有意義了。代價是你要偶爾掃一下 `followups`，把不妥的那幾列取消勾選。

#### 為什麼不再自動生時事題

曾經有第三條路徑 `deepTalkGenerateNews()`：一次請求同時開搜尋、讀網頁與結構化輸出，連網找出最近被討論的事再轉成題目，題目上帶著摘要與出處，還會隨時間過期。整條連同資料層都已經移除。

原因是計價：**Google Search grounding 是分開計價的**，不含在一般的 token 費用裡，而且免費層（沒開帳單）拿不到。為了一週幾題時事去開帳單划不來。

要找回那段程式（含題材黑名單、新鮮度權重、90 天下架、前端的摘要與出處）：`git show 18d999d` 與 `git show bedf0b3`。

### 題目不夠時會怎樣

一疊固定 8 張。某一層題目不夠時會從計畫涵蓋的其他層補，但絕不會超過使用者選的深度上限；真的湊不滿就發幾張算幾張。完全沒有符合條件的題目時前端會提示使用者放寬條件。

被跳過的比例超過 60%（且累積至少 10 票）的題目會自動停止出牌，也不會上熱門榜。要救回來就把票數歸零。

## 前端如何呼叫

前端統一走 [`shared/api.js`](../shared/api.js) 的 `submitToAppsScript()`，不要在各作品自己寫 `fetch`。

### 請求格式

```json
{
  "app": "invitation-card",
  "payload": { "schemaVersion": 1, "timing": "深夜限定", "activities": ["散步"] }
}
```

### 跨網域

`/exec` 會以 302 轉址到 `script.googleusercontent.com`，最終回應帶有 `Access-Control-Allow-Origin: *`。因此可以用一般的 CORS 請求直接讀到 JSON 結果，**不需要 `mode: 'no-cors'`**，也不必用等待時間猜測是否成功。

請求必須維持「簡單請求」（`Content-Type: text/plain;charset=utf-8`），否則瀏覽器會先送出 Apps Script 不支援的 CORS 預檢而失敗。

### 回應

Apps Script 即使驗證失敗也會回傳 HTTP 200，因此必須檢查 body 的 `ok` 欄位：

| 回應                                           | 意義                               |
| ---------------------------------------------- | ---------------------------------- |
| `{"ok": true}`                                 | 已寫入工作表                       |
| `{"ok": false, "error": "unknown_app"}`        | `app` 欄位不在路由表裡             |
| `{"ok": false, "error": "rate_limited"}`       | 超過每分鐘上限                     |
| `{"ok": false, "error": "unsupported_schema"}` | 資料結構版本不支援                 |
| `{"ok": false, "error": "missing_*"}`          | 必填欄位是空的                     |
| `{"ok": false, "error": "invalid_request"}`    | 其他錯誤（詳細內容只留在執行紀錄） |

## 撰寫 `.gs` 時的注意事項

- **驗證所有欄位並限制長度。** Web App 網址會出現在瀏覽器端程式碼中，任何人都能對它送出請求。
- **防止公式注入。** 以 `=`、`+`、`-`、`@` 開頭的字串在 Google Sheet 會被當成公式。用 `appendRowSafely()` 寫入即可，它已經處理過。
- **用伺服器時間**（`new Date()`）而不是前端傳來的時間。
- **不要回傳詳細錯誤內容給前端。** 可回報的錯誤用 `requestError('code')`，其他一律變成 `invalid_request`。
- 不要透過這類表單收集密碼、證件號碼或其他敏感資料。

## 安全性與權限

- Web App 網址**不是密鑰**。它會出現在公開的 JavaScript 裡，任何人都能呼叫。所有防護都必須做在 `.gs` 裡。
- 指令碼屬性只負責避免在 Git 中留下試算表 ID，**不能取代 Google Sheet 本身的權限設定**。試算表仍應保持私人。
- `appsscript.json` 只宣告 `spreadsheets` 這一個 OAuth 範圍。加入需要更多權限的功能前先想清楚 —— **範圍是整個專案共用的**。

## 已知限制

規劃新功能前需要先接受的天花板：

| 項目          | 限制                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| 回應方式      | `ContentService` 只能一次回傳完整內容，**不支援串流**。AI 類功能無法做逐字浮現的效果，只能等整段回來                  |
| 冷啟動        | 閒置後首次呼叫可能要數秒，前端 timeout 需放寬（目前設 30 秒）                                                         |
| 執行時間      | 免費帳號單次上限約 6 分鐘                                                                                             |
| `UrlFetchApp` | 免費帳號每日約 20,000 次                                                                                              |
| 節流          | Apps Script **讀不到用戶端 IP**，只能做全站共用的粗略上限（見 `lib.gs` 的 `withinRateLimit`），無法針對個別使用者限制 |
| 授權範圍      | OAuth 範圍整個專案共用。需要 Gmail、Calendar、Drive 權限的作品應獨立成另一個專案                                      |

需要串流回應、更高流量或真正的用戶端識別時，替代方案是 Cloudflare Workers（免費額度較高、原生支援 SSE 串流）。前端的送出邏輯已集中在 `shared/api.js`，屆時只需要改那一個檔案。

## 用 clasp 從儲存庫直接推送

手動複製貼上 `.gs` 到編輯器很快就會變成負擔。[`clasp`](https://github.com/google/clasp) 讓你直接從這個儲存庫推送程式碼。

clasp 已列為開發相依，**不需要全域安裝**：

```bash
npm install
```

> `package.json` 與 `node_modules/` 只服務開發工具。網站本體維持零建置，部署到 GitHub Pages 完全用不到它們。

### 首次設定

**1. 開啟 Apps Script API**

到 <https://script.google.com/home/usersettings>，把「Google Apps Script API」打開。沒開的話 clasp 所有動作都會失敗。

**2. 登入**

```bash
npx clasp login
```

會開瀏覽器要求授權，憑證存在 `~/.clasprc.json`（已列入 `.gitignore`）。

**3. 建立 `.clasp.json`**

複製範本並填入指令碼 ID。**這個檔必須放在 `apps-script/` 裡面**：

```bash
cp apps-script/.clasp.json.example apps-script/.clasp.json
```

指令碼 ID 在 Apps Script 的「**專案設定 → 指令碼 ID**」。

```json
{
  "scriptId": "貼在這裡",
  "rootDir": ".",
  "fileExtension": "gs"
}
```

> **為什麼是這個位置**：把 `.clasp.json` 放在儲存庫根目錄並設 `rootDir: "apps-script"` 時，
> 實測 clasp 3.4.0 在 `pull` 寫檔時會把 `rootDir` 套用兩次，拉出多一層的
> `apps-script/apps-script/`。放在 `apps-script/` 內並設 `rootDir: "."` 就不會有這個問題。
>
> 這只影響本地檔案位置，遠端的檔名一直都是扁平的 `main`、`lib`、`app-invitation-card`。
>
> `package.json` 的 `gs:*` 指令已經包含 `cd apps-script`，所以你在儲存庫根目錄執行就好。
>
> `fileExtension` 決定 `pull` 寫出的副檔名，少了它會拉成 `.js` 而跟現有的 `.gs` 並存。

**4. 確認要推送的檔案**

```bash
npm run gs:status
```

應該只看到四個 Tracked 檔案，其餘都在 Untracked：

```text
Tracked files:
└─ app-invitation-card.gs
└─ lib.gs
└─ main.gs
└─ appsscript.json
Untracked files:
└─ .clasp.json
└─ .clasp.json.example
└─ .claspignore
└─ README.md
```

`clasp status` 是唯一可靠的事實來源 —— 第一次推送前一定要先看這個，不要只相信 `.claspignore`。

**5. 先確認遠端與本地一致**

`clasp push` 會**用本地覆蓋遠端**。如果你曾經直接在網頁編輯器裡改過東西，那些改動會被蓋掉。用 git 當安全網：

```bash
git status              # 必須是乾淨的
npm run gs:pull         # 用遠端覆蓋本地
git diff                # 空的 → 兩邊一致，安全
```

`git diff` 有東西，就代表你在編輯器裡改過而沒同步回來 —— 這時看清楚內容再決定要保留哪一邊（`git checkout .` 保留本地版本）。

### 日常流程

見文件開頭的[改了 `.gs` 之後要跑什麼](#改了-gs-之後要跑什麼)。

### 監看模式

```bash
cd apps-script && npx clasp push -w
```

存檔就自動推送，開發時方便。但仍需要 `npm run gs:deploy` 才會生效。

### 常見問題

| 症狀                                              | 原因                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project settings not found`                      | 沒有 `.clasp.json`，或不在專案根目錄執行                                                                                                              |
| `User has not enabled the Apps Script API`        | 步驟 1 沒做                                                                                                                                           |
| 推送成功但線上沒變                                | 只 `push` 沒 `redeploy`。push 只更新程式碼，不會更新部署                                                                                              |
| 前端突然全部失敗                                  | 可能誤用 `clasp deploy` 產生了新網址，舊網址指向舊版本。用 `gs:deployments` 確認                                                                      |
| `pull` 之後多出 `apps-script/apps-script/`        | `.clasp.json` 放錯位置（見設定步驟 3）。刪掉多出來的目錄，把設定改成 `apps-script/.clasp.json` + `rootDir: "."` 即可。遠端沒有被改壞，不需要重新 push |
| `Security Error: srcDir ... escapes project root` | `.clasp.json` 少了 `rootDir`，或用了 `-P` 搭配相對路徑。clasp 3 的路徑穿越防護要求明確指定 `rootDir`                                                  |
| `pull` 拉出 `.js` 而不是 `.gs`                    | `.clasp.json` 少了 `"fileExtension": "gs"`                                                                                                            |
