import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AppsScriptClient } from './apps-script-client';
import { APPS_SCRIPT_ENDPOINT, APPS_SCRIPT_TIMEOUT_MS } from './apps-script-config';
import { AppsScriptError, describeAppsScriptError } from './apps-script-error';

describe('AppsScriptClient', () => {
  let client: AppsScriptClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    client = TestBed.inject(AppsScriptClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('請求格式', () => {
    it('body 是字串而非物件，Content-Type 維持 text/plain', async () => {
      const pending = client.send('deep-talk', { action: 'deck' });
      const req = httpMock.expectOne(APPS_SCRIPT_ENDPOINT);

      // 傳物件會讓 Angular 蓋成 application/json，觸發 Apps Script 不支援的 CORS 預檢。
      expect(typeof req.request.body).toBe('string');
      expect(req.request.headers.get('Content-Type')).toBe('text/plain;charset=utf-8');
      expect(req.request.method).toBe('POST');

      req.flush({ ok: true });
      await pending;
    });

    it('把 app 與 payload 包成後端預期的外殼', async () => {
      const pending = client.send('invitation-card', { name: '小明', step: 3 });
      const req = httpMock.expectOne(APPS_SCRIPT_ENDPOINT);

      expect(JSON.parse(req.request.body as string)).toEqual({
        app: 'invitation-card',
        payload: { name: '小明', step: 3 }
      });

      req.flush({ ok: true });
      await pending;
    });
  });

  describe('回應處理', () => {
    it('ok 為 true 時回傳整包結果', async () => {
      const pending = client.send<{ ok: boolean; cards: string[] }>('deep-talk', {});
      httpMock.expectOne(APPS_SCRIPT_ENDPOINT).flush({ ok: true, cards: ['a', 'b'] });

      await expect(pending).resolves.toEqual({ ok: true, cards: ['a', 'b'] });
    });

    it('HTTP 200 但 ok 為 false 時，用後端的 error 當錯誤代碼', async () => {
      const pending = client.send('deep-talk', {});
      httpMock.expectOne(APPS_SCRIPT_ENDPOINT).flush({ ok: false, error: 'rate_limited' });

      await expect(pending).rejects.toMatchObject({
        name: 'AppsScriptError',
        code: 'rate_limited'
      });
    });

    it('回應缺少 ok 欄位時視為 bad_response', async () => {
      const pending = client.send('deep-talk', {});
      httpMock.expectOne(APPS_SCRIPT_ENDPOINT).flush({ cards: [] });

      await expect(pending).rejects.toMatchObject({ code: 'bad_response' });
    });

    it('HTTP 錯誤轉成 http_error 並帶上狀態碼', async () => {
      const pending = client.send('deep-talk', {});
      httpMock
        .expectOne(APPS_SCRIPT_ENDPOINT)
        .flush('boom', { status: 500, statusText: 'Server Error' });

      await expect(pending).rejects.toMatchObject({
        code: 'http_error',
        message: 'HTTP 500'
      });
    });
  });

  describe('逾時', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('超過逾時上限後轉成 timeout', async () => {
      const pending = client.send('deep-talk', {});
      const req = httpMock.expectOne(APPS_SCRIPT_ENDPOINT);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });

      await vi.advanceTimersByTimeAsync(APPS_SCRIPT_TIMEOUT_MS + 1);
      await assertion;

      // 逾時會取消訂閱，底層請求也要跟著中止，否則連線會一直掛著。
      expect(req.cancelled).toBe(true);
    });
  });
});

describe('describeAppsScriptError', () => {
  it.each([
    ['timeout', '等太久都沒有回應，請確認網路後再試一次。'],
    ['rate_limited', '目前送出的人有點多，請稍等一下再試。'],
    ['unknown_app', '這個頁面的版本太舊了，請重新整理後再試一次。'],
    ['unknown_action', '這個頁面的版本太舊了，請重新整理後再試一次。'],
    ['unsupported_schema', '這個頁面的版本太舊了，請重新整理後再試一次。']
  ])('%s 有專屬訊息', (code, expected) => {
    expect(describeAppsScriptError(new AppsScriptError(code))).toBe(expected);
  });

  it('未知代碼與非 AppsScriptError 都退回通用訊息', () => {
    const fallback = '回覆剛剛沒有送達，請檢查網路後再試一次。';

    expect(describeAppsScriptError(new AppsScriptError('invalid_request'))).toBe(fallback);
    expect(describeAppsScriptError(new Error('隨便什麼錯'))).toBe(fallback);
    expect(describeAppsScriptError(undefined)).toBe(fallback);
  });
});
