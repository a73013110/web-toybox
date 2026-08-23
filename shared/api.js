/*
 * 呼叫 Apps Script 後端的共用送出層。
 *
 * 所有作品都經由這裡送出，日後若要換掉後端（例如改用 Cloudflare Workers），
 * 只需要改這一個檔案。
 */

import { APPS_SCRIPT_ENDPOINT, SUBMIT_TIMEOUT_MS } from './config.js';

export class SubmitError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.name = 'SubmitError';
    this.code = code;
  }
}

/*
 * 送出一筆資料到指定作品的處理函式。
 *
 * app     對應 apps-script/main.gs 的 routeRequest()，例如 'invitation-card'
 * payload 該作品自己的欄位，由對應的 handler 驗證
 *
 * 成功時 resolve；失敗時 throw SubmitError（或逾時的 AbortError）。
 */
export async function submitToAppsScript(app, payload, options = {}) {
  const {
    endpoint = APPS_SCRIPT_ENDPOINT,
    timeoutMs = SUBMIT_TIMEOUT_MS
  } = options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Apps Script 的 /exec 會 302 轉到 script.googleusercontent.com，
    // 最終回應帶有 Access-Control-Allow-Origin: *，因此可以直接讀取結果。
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal, // 避免網路無回應時讓按鈕永久停在傳送狀態。
      redirect: 'follow',
      headers: {
        // 維持「簡單請求」，避免瀏覽器先送出 Apps Script 不支援的 CORS 預檢。
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ app, payload })
    });

    if (!response.ok) {
      throw new SubmitError('http_error', `HTTP ${response.status}`);
    }

    const result = await response.json();

    // Apps Script 驗證失敗時仍回傳 200，必須看 ok 欄位才知道是否真的寫入。
    if (!result?.ok) {
      throw new SubmitError(result?.error || 'unknown_error');
    }

    return result;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/*
 * 在頁面關閉的當下送出資料。
 *
 * 用 sendBeacon：瀏覽器會在頁面卸載後自行完成請求，一般的 fetch 到這個時機
 * 多半會被中斷。代價是拿不到結果，因此只適合「送不到也無所謂」的補送。
 * 型別必須是 text/plain，才不會觸發 Apps Script 不支援的 CORS 預檢。
 */
export function beaconToAppsScript(app, payload, options = {}) {
  const { endpoint = APPS_SCRIPT_ENDPOINT } = options;

  if (!navigator.sendBeacon) return false;

  const body = new Blob([JSON.stringify({ app, payload })], { type: 'text/plain;charset=utf-8' });

  return navigator.sendBeacon(endpoint, body);
}

/*
 * 把送出失敗轉成可以直接顯示給使用者的訊息。
 * 作品可以自行覆寫，但預設涵蓋共通的幾種情況。
 */
export function describeSubmitError(error) {
  if (error?.name === 'AbortError') {
    return '等太久都沒有回應，請確認網路後再試一次。';
  }

  switch (error?.code) {
    case 'rate_limited':
      return '目前送出的人有點多，請稍等一下再試。';
    case 'unknown_app':
    case 'unknown_action':
    case 'unsupported_schema':
      return '這個頁面的版本太舊了，請重新整理後再試一次。';
    default:
      return '回覆剛剛沒有送達，請檢查網路後再試一次。';
  }
}
