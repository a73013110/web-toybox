# Web Toybox 前端

Angular 22（standalone、zoneless、build 期 prerender）的互動網頁作品集，部署在 GitHub Pages。
後端是 Google Apps Script（`apps-script/`），前端不改動它的契約。

> 遷移自原生 HTML/JS 版本，過程與當時的判斷記在 `docs/angular-migration.md`。

---

## 鐵律

### 後端契約

- **禁止**修改 Apps Script 的 API 契約（`app` / `action` / payload 欄位）與 `apps-script/*.gs`，
  除非需求明確要求；改動後 `npm run test:backend` 必須同步通過
- **禁止**把物件直接當 body 交給 HttpClient 送往 Apps Script——Angular 會自動蓋上
  `Content-Type: application/json`，觸發 Apps Script 不支援的 CORS preflight。
  一律先 `JSON.stringify()` 成 string 再傳，並手動保留 `text/plain;charset=utf-8`
- Apps Script 驗證失敗時仍回 HTTP 200，**必須**檢查回應的 `ok` 欄位才算成功
- **禁止**把任何金鑰放進 `src/`。Apps Script endpoint 是公開設定、不是秘密，
  但正因如此，所有驗證一律在後端做

### 網址與部署

- **禁止**變更既有公開網址：`/web-toybox/`、`/web-toybox/pages/invitation-card/`、
  `/web-toybox/pages/deep-talk/`，以及 invitation-card 的 query parameter 行為
- 路由**必須是靜態路徑（無 route param）**，prerender 才會自動探索並產出實體 `index.html`；
  一旦引入動態路由，就得同時補 prerender 清單，否則該頁直接進入或重新整理會 404
- 每個公開頁**必須**有自己的 `<title>` 與 `<meta name="description">`，於元件 render 期間設定
  （prerender 會把它序列化進 HTML）。**禁止**在 `afterNextRender()` 裡設 meta——那只在瀏覽器跑，
  prerender 產物會抓不到，分享預覽就會全部變成首頁
- **禁止**使用 SPA 的 404 轉址 hack。`404.html` 只負責真正的找不到頁面

### Angular 語法

- **禁止** `*ngIf` / `*ngFor` / `*ngSwitch`，改用 `@if` / `@for` / `@switch`
- **禁止** `@Input()` / `@Output()` / constructor 參數注入，改用 `input()` / `output()` / `model()` / `inject()`（constructor **本體**可以寫初始化邏輯，例如呼叫 `setPageMeta()`）
- **不寫** `changeDetection`：Angular 22 起 OnPush 即框架預設（舊 `Default` 更名 `Eager`），
  顯式宣告是 v21 遺留寫法
- **不寫** `provideZonelessChangeDetection()`：v22 起 zoneless 即預設
- **禁止** output 名稱與 DOM 原生事件同名（`click`、`change`、`blur`、`submit`⋯）——
  output 不存在時會靜默退回原生監聽，payload 型別錯亂且編譯期零警告
- **禁止**在 template 能表達的地方碰 DOM。只有這五類允許直接操作 DOM：
  Canvas 產圖、檔案下載、Clipboard、focus 管理、`sendBeacon`
- **禁止**用「先卸下 class、下一次 render 再掛上」重播 CSS 動畫。
  一次性動畫用 `(animationend)` 把 class 卸掉（`animationend` 會冒泡，
  祖先元素上要確認 `event.target === event.currentTarget`）；
  真正的進出場用 `animate.enter` / `animate.leave`，class 由框架掛與收
- **禁止**在 template 裡呼叫方法產生顯示值。要算的東西先用 `computed()` 算成 view model，
  否則每次變更偵測都會整份重算

### 邊界

- feature 之間**禁止**互相 import；`core/`、`shared/` **禁止** import feature
- `shared/` **禁止**帶 invitation-card 或 deep-talk 的業務語意。
  放進去前先問：「拿掉這兩個作品，這段程式碼還成立嗎？」不成立就留在 feature
- 一段程式**被兩個 feature 實際用到**才移入 `shared/`。不為假想需求預先抽象
  （目前唯一的住戶是 `shared/timing.ts`，因為兩個作品都要「會自動取消的 setTimeout」）

### 樣式

- **禁止** hardcode 顏色與 inline style，一律使用 `src/styles/tokens.css` 的語意 token
- **禁止**為了套樣式而多包一層 Angular component
- 現有無障礙行為不得退化：`:focus-visible` 外框、`.sr-only`、`prefers-reduced-motion`
- CSS 一律**一個選擇器一行**（宣告寫在同一行的大括號內）。這是刻意的：
  樣式檔因此能一眼掃完。`.prettierignore` 已把 `*.css` 排除，`npm run format` 不會動它們

---

## 慣例

### Signal 與生命週期

- `signal()` 存可變 UI 狀態，`computed()` 存衍生狀態
- 「平常可以自己寫入、但來源一變就該重設」的狀態用 `linkedSignal()`
  （例如換一疊牌就把 index 歸零）。這正是 `effect()` 最常被誤用的場景
- **`effect()` 只用於外部副作用**（計時器排程、localStorage、Canvas）。
  禁止用 `effect()` 把一個 signal 的值抄到另一個 signal——那是 `computed()` 或 `linkedSignal()` 的工作
- ⚠️ `effect()` 在 prerender 期間也會執行。裡面若有計時器或 `matchMedia`，
  要自己用一個「已進瀏覽器」的旗標擋掉（見 `ambient-backdrop.ts`）
- 計時器一律走 `@shared/timing` 的 `injectTimers()`，銷毀時自動取消；
  不要在元件裡散落 `setTimeout` + 手動 `clearTimeout`
- 陣列與物件一律不可變更新（`[...arr, item]`、`{ ...obj, k: v }`）
- 清理用 `inject(DestroyRef).onDestroy(...)`，與初始化邏輯寫在一起；DOM 操作用 `afterNextRender()`

### 路由

- query parameter 與 route param 一律靠 `withComponentInputBinding()` 綁進 `input()`，
  **禁止**在元件裡注入 `ActivatedRoute` 自己解析網址
- 換頁過場交給 `withViewTransitions()`，不自己寫轉場動畫
- 純裝飾、而且會開計時器或監聽器的區塊用 `@defer (on idle)` 延後載入
  （例如 invitation-card 的 `ambient-backdrop`），讓它自己成為一個 lazy chunk

### 表單（Signal Forms）

- 表單一律用 `@angular/forms/signals`，不用 Reactive Forms：
  `signal(model)` 是唯一資料源，`form(model, schema)` 集中宣告驗證，template 用 `[formField]` 綁定
- **禁止**在綁了 `[formField]` 的控制項上另寫 `[disabled]` / `[readonly]`——
  `[formField]` 已經在管；要控制請用 schema 裡的 `disabled()` / `readonly()` rule 加 `when`
- 送出走 `submit()`：它會 `markAsTouched`、驗證失敗就不執行 action，
  並把後端回傳的欄位錯誤映射回對應 field
- ⚠️ Signal Forms 目前是 Angular 的 experimental API，升版可能有 breaking change。
  這是為了與 `EDoc.Web.GDWeb` 對齊而刻意接受的成本，不是疏忽

### 非同步

- Apps Script 全部是一次性請求：API service 內部用 `HttpClient`，
  **對 feature 只暴露 Promise**（`firstValueFrom`），讓呼叫端維持 `async/await`
- **讀取**用 `resource()`：載入中／成功／失敗三種狀態交給它管，不要自己開三個 signal 去同步。
  條件式載入讓 `params` 回傳 `undefined`，resource 就會維持 idle 不打後端
- ⚠️ `resource` 失敗時 `value()` 會**丟出錯誤**，不是回傳 `defaultValue`。
  畫面要「安靜地當作沒有資料」時，一律先問 `hasValue()`
- 使用者觸發、且會產生副作用或消耗配額的動作（送出、叫 AI）維持命令式 `async/await`，
  不要硬塞進 `resource`——那是為讀取設計的
- 逾時用 rxjs `timeout(30_000)`，不要在 HttpClient 上另接 `AbortController`
- 若真的手動 `subscribe()`，一律 `takeUntilDestroyed(destroyRef)`

### API 分層

只有兩層，Component 與 Store **不得**知道 endpoint、`app`、`action` 或原始 `ok` 欄位：

| 層          | 位置                             | 職責                                                                       |
| ----------- | -------------------------------- | -------------------------------------------------------------------------- |
| Transport   | `core/api/apps-script-client.ts` | endpoint、逾時、POST、`sendBeacon`、JSON 解析、`ok` 判斷、共用錯誤碼       |
| Feature API | `features/<name>/<name>.api.ts`  | 具業務語意的具名方法：`loadDeck()`、`sendFeedback()`、`submitInvitation()` |

### 命名與檔案

- Component 檔名無後綴（`deep-talk.ts`），其餘帶類型後綴（`.api.ts`、`.store.ts`、`.types.ts`、`.data.ts`）
- 目錄與檔名 kebab-case
- 元件內部 protected / private 成員一律 `_` 前綴；事件處理器再加 `on`（`_onCardFlip()`）
- template 專用成員用 `protected`
- Feature page 拆成同名的 `.ts` + `.html` + `.css` 三檔；小型子元件可 inline template
- 跨區塊 import 用 alias（`@app/*`、`@core/*`、`@shared/*`），禁止兩層以上 `../../`

### 拆 Component 的門檻

同時滿足才拆，不要每個 `<div>` 都拆：

- 有明確的 input / output
- 有自己的狀態或生命週期
- 可形成獨立的測試邊界

純粹「有 input、只負責畫」的區塊留在原本的 template 裡——那不是元件，是排版。

### 測試

- 元件測試用 `TestBed.createComponent()` + `componentRef.setInput()` 餵 signal input，
  斷言打在 `nativeElement` 上。**禁止**去戳元件的 protected 欄位——那會讓重構動不了
- `resource()` 的載入會登記成 pending task，`await fixture.whenStable()` 之後畫面就是最終狀態，
  不需要手動 flush
- Store 這類沒有畫面的東西直接 `TestBed.inject()`，用假的 API 物件取代 Feature API
- 有真實邏輯的東西才寫測試：驗證規則、Store 的狀態機、transport 層的錯誤對應。
  不為 getter 補測試

---

## 目錄

```
src/
├─ app/
│  ├─ core/api/            # AppsScriptClient、endpoint 設定、錯誤型別（不含 UI）
│  ├─ core/seo/            # setPageMeta()
│  ├─ shared/timing.ts     # injectTimers()：會自動取消的 setTimeout 與過場最短時間
│  ├─ features/
│  │  ├─ home/             # 首頁 + project-card + projects.data.ts
│  │  ├─ invitation-card/  # 頁面 + .api + .schema + .data + .types
│  │  │                    #   + ambient-backdrop / confetti-burst / waiting-message / reduced-motion
│  │  └─ deep-talk/        # 頁面 + .store + .api + .storage + taxonomy + card-image + components/
│  ├─ app.ts / app.config.ts / app.routes.ts
├─ styles/                 # tokens.css、base.css、ui.css
└─ main.ts / index.html
public/                    # favicon.svg、robots.txt、404.html、.nojekyll
apps-script/               # Apps Script 後端（原樣保留）
scripts/                   # gs-deploy.mjs
```

新增一個作品要動的地方有兩處：`features/home/projects.data.ts`（首頁卡片與件數）
與 `app.routes.ts`（路由）。prerender 會自動探索靜態路由，不需要第三份清單。

---

## 作品專屬規則

### Deep Talk

- Store 由 deep-talk 的 route 提供（`providers: [DeepTalkStore]`），**不掛 `providedIn: 'root'`**，
  離開頁面即釋放狀態
- ⚠️ **Store 銷毀時必須 flush 尚未送出的回饋。** 原生版本靠 `pagehide` + `sendBeacon`，
  但 SPA 化之後多了「使用者點返回鍵切回首頁」這個 `pagehide` 不會觸發的路徑。
  `DestroyRef.onDestroy()` 是主要保險，`pagehide` 退居備援
- 維持「選完條件才打一次後端」的設計，翻牌全部在前端跑
- `SEEN_LIMIT` 必須與 `apps-script/app-deep-talk.gs` 的上限一致

### Invitation Card

- 五個步驟共用一份 model signal 與一份 form schema，用 `disabled({ when })` 控制步驟推進，
  不要每一步各開一個 form
- URL query parameter 的既有行為必須完全保留

---

## 指令

```
npm start              # ng serve
npm run build          # ng build（含 prerender）
npm test               # 前端 + 後端全跑
npm run test:frontend  # ng test（Vitest）
npm run test:backend   # node --test apps-script/test/*.test.js
npm run lint
npm run gs:push        # clasp push
npm run gs:deploy      # 更新 Apps Script 部署
```

⚠️ `scripts/gs-deploy.mjs` 用 regex 從 `src/app/core/api/apps-script-config.ts` 讀部署 ID。
改動那個檔案裡 endpoint 那一行的格式時，要確認腳本還讀得到。

---

## 延伸文件

| 主題                                    | 位置                                                  |
| --------------------------------------- | ----------------------------------------------------- |
| Angular 22 語法在這個專案的落點對照     | `README.md`「Angular 22 語法地圖」                    |
| 遷移階段、驗收條件、已知風險            | `docs/angular-migration.md`                           |
| Apps Script 部署與維護                  | `apps-script/README.md`                               |
| 參考專案（同一套 Angular 慣例的企業版） | `D:\CoreProject\EDoc_HL\src\EDoc.Web.GDWeb\CLAUDE.md` |

---

## 非本階段目標

除非明確要求，**禁止**主動引入：PrimeNG、Tailwind、NgRx、TanStack Query、MSW、
OpenAPI codegen、自訂表單控制項基底、dark mode、SSR runtime、登入系統、全域 toast 平台。

理由：這些在 EDoc 有明確的規模需求，在只有兩個作品的 toybox 沒有。
先把 Angular 本身學透，出現真實痛點再加。
