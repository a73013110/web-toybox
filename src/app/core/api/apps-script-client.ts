import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';

import { APPS_SCRIPT_ENDPOINT, APPS_SCRIPT_TIMEOUT_MS } from './apps-script-config';
import { AppsScriptError } from './apps-script-error';

/** 後端一律回傳這個外殼，驗證失敗時 HTTP 仍是 200，只有 ok 會是 false。 */
interface AppsScriptEnvelope {
  readonly ok?: boolean;
  readonly error?: string;
}

/*
 * 呼叫 Apps Script 後端的傳輸層。
 *
 * 這一層只處理「怎麼送」：endpoint、逾時、JSON、ok 判斷、錯誤代碼。
 * 「送什麼」屬於各作品的 Feature API（<name>.api.ts），
 * 因此 app 與 action 這類欄位名稱不會出現在元件裡。
 *
 * 日後若要換掉後端（例如改用 Cloudflare Workers），只需要改這一個檔案。
 */
@Injectable({ providedIn: 'root' })
export class AppsScriptClient {
  private readonly _http = inject(HttpClient);

  /*
   * 送出一筆資料並取回結果。
   *
   * ⚠️ body 必須自己 JSON.stringify() 成字串再交給 HttpClient。
   *    直接傳物件的話 Angular 會把 Content-Type 蓋成 application/json，
   *    瀏覽器就會先送出 Apps Script 不支援的 CORS 預檢，請求直接失敗。
   */
  async send<T>(app: string, payload: Record<string, unknown>): Promise<T> {
    const request = this._http.post<T & AppsScriptEnvelope>(
      APPS_SCRIPT_ENDPOINT,
      JSON.stringify({ app, payload }),
      {
        headers: {
          // 維持「簡單請求」，避免瀏覽器先送出 Apps Script 不支援的 CORS 預檢。
          'Content-Type': 'text/plain;charset=utf-8'
        },
        responseType: 'json'
      }
    );

    let result: (T & AppsScriptEnvelope) | null;

    try {
      // Apps Script 的 /exec 會 302 轉到 script.googleusercontent.com，
      // 最終回應帶有 Access-Control-Allow-Origin: *，因此可以直接讀取結果。
      result = await firstValueFrom(request.pipe(timeout({ each: APPS_SCRIPT_TIMEOUT_MS })));
    } catch (error) {
      throw this._toAppsScriptError(error);
    }

    // Apps Script 驗證失敗時仍回傳 200，必須看 ok 欄位才知道是否真的寫入。
    if (!result?.ok) {
      throw new AppsScriptError(result?.error ?? 'bad_response');
    }

    return result;
  }

  /*
   * 在頁面關閉的當下送出資料。
   *
   * 用 sendBeacon：瀏覽器會在頁面卸載後自行完成請求，一般的 fetch 到這個時機
   * 多半會被中斷。代價是拿不到結果，因此只適合「送不到也無所謂」的補送。
   * 型別必須是 text/plain，才不會觸發 Apps Script 不支援的 CORS 預檢。
   *
   * 刻意不經過 HttpClient：sendBeacon 是瀏覽器排程的 fire-and-forget，
   * 沒有 Observable 可以訂閱，interceptor 也幫不上忙。
   */
  beacon(app: string, payload: Record<string, unknown>): boolean {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;

    const body = new Blob([JSON.stringify({ app, payload })], {
      type: 'text/plain;charset=utf-8'
    });

    return navigator.sendBeacon(APPS_SCRIPT_ENDPOINT, body);
  }

  private _toAppsScriptError(error: unknown): AppsScriptError {
    if (error instanceof TimeoutError) {
      return new AppsScriptError('timeout');
    }

    if (error instanceof HttpErrorResponse) {
      return new AppsScriptError('http_error', `HTTP ${error.status}`);
    }

    return new AppsScriptError('bad_response', error instanceof Error ? error.message : undefined);
  }
}
