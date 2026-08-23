/*
 * Web Toybox 後端入口。
 *
 * 所有作品共用這一個 Web App 部署，靠 payload 的 app 欄位分流到各自的處理函式。
 * 這樣新增作品時不需要再開一個 Apps Script 專案、也不需要再記一組 /exec 網址。
 *
 * 新增作品的步驟：
 *   1. 建立 app-<作品名稱>.gs，實作 handle<作品名稱>(payload)
 *   2. 在 routeRequest() 加一個 case
 *
 * 例外：需要 Gmail、Calendar、Drive 等額外授權範圍的作品，
 * 應該獨立成另一個 Apps Script 專案。OAuth 範圍是整個專案共用的，
 * 不該為了一個作品讓其他作品也拿到那些權限。
 */

// 一分鐘內全站可接受的請求數。Apps Script 讀不到用戶端 IP，
// 因此這是全站共用的粗略上限，只用來擋暴衝、不是針對個別使用者的限制。
const RATE_LIMIT_PER_MINUTE = 60;

/*
 * 注意：Apps Script 的所有 .gs 檔共用同一個全域範圍，
 * 但檔案的「執行順序」不保證。函式宣告會被提升，跨檔案呼叫沒問題；
 * 頂層的 const 若在另一個檔案的頂層被引用，可能會讀到 undefined。
 * 因此路由寫成函式，而不是一張物件常數表。
 */
function routeRequest(app) {
  switch (app) {
    case 'invitation-card':
      return handleInvitationCard;
    case 'deep-talk':
      return handleDeepTalk;
    default:
      return null;
  }
}

function supportedApps() {
  return ['invitation-card', 'deep-talk'];
}

/*
 * 健康檢查：直接用瀏覽器開啟 /exec 就會看到這段 JSON。
 * 可以用來確認部署是否成功、以及目前這個部署認得哪些作品，
 * 而且不會寫入任何資料。
 */
function doGet() {
  return jsonResponse({
    ok: true,
    service: 'web-toybox',
    apps: supportedApps()
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e?.postData?.contents || '{}');
    const app = normalizeText(body.app, 40);
    const handler = routeRequest(app);

    if (!handler) {
      throw requestError('unknown_app');
    }

    if (!withinRateLimit(app)) {
      throw requestError('rate_limited');
    }

    // handler 可以回傳一個物件當作回應內容（例如題庫要回傳一疊題目）;
    // 只負責寫入的 handler 回傳 undefined，展開後不影響結果。
    const result = handler(body.payload || {});

    return jsonResponse({ ...result, ok: true });
  } catch (error) {
    console.error(error); // 詳細內容只留在執行紀錄，不回傳給前端。

    return jsonResponse({
      ok: false,
      error: error && error.isRequestError ? error.message : 'invalid_request'
    });
  }
}
