/*
 * Apps Script 呼叫失敗時統一拋出的錯誤。
 *
 * code 有兩個來源：
 *   1. 後端回傳的 error 欄位（rate_limited、unknown_app⋯，見 apps-script/main.gs）
 *   2. 傳輸層自己判斷的狀況（timeout、http_error、bad_response）
 * Feature 只需要看 code，不必知道錯誤是從哪一層來的。
 */
export type AppsScriptErrorCode =
  | 'timeout'
  | 'http_error'
  | 'bad_response'
  | 'rate_limited'
  | 'unknown_app'
  | 'unknown_action'
  | 'unsupported_schema'
  | 'invalid_request'
  | (string & {});

export class AppsScriptError extends Error {
  readonly code: AppsScriptErrorCode;

  constructor(code: AppsScriptErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = 'AppsScriptError';
    this.code = code;
  }
}

/*
 * 把送出失敗轉成可以直接顯示給使用者的訊息。
 * 作品可以自行覆寫，但預設涵蓋共通的幾種情況。
 */
export function describeAppsScriptError(error: unknown): string {
  const code = error instanceof AppsScriptError ? error.code : undefined;

  switch (code) {
    case 'timeout':
      return '等太久都沒有回應，請確認網路後再試一次。';
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
