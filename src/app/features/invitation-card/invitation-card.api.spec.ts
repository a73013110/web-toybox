import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { APPS_SCRIPT_ENDPOINT } from '@core/api/apps-script-config';

import { InvitationCardApi } from './invitation-card.api';

describe('InvitationCardApi', () => {
  let api: InvitationCardApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    api = TestBed.inject(InvitationCardApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function submitAndCapture(
    overrides: Partial<Parameters<InvitationCardApi['submitInvitation']>[0]> = {}
  ) {
    const pending = api.submitInvitation({
      inviteeName: '小明',
      declineCount: 2,
      timing: '深夜限定',
      activities: ['用餐', '散步'],
      page: 'https://example.test/pages/invitation-card/',
      ...overrides
    });
    const req = httpMock.expectOne(APPS_SCRIPT_ENDPOINT);

    return { pending, req, body: JSON.parse(req.request.body as string) };
  }

  it('送出 Apps Script 預期的欄位', async () => {
    const { pending, req, body } = submitAndCapture();

    expect(body).toEqual({
      app: 'invitation-card',
      payload: {
        schemaVersion: 1,
        invite: '小明',
        declineCount: 2,
        timing: '深夜限定',
        activities: ['用餐', '散步'],
        page: 'https://example.test/pages/invitation-card/'
      }
    });

    req.flush({ ok: true });
    await pending;
  });

  it('沒有名字時填入「未指定」，不送出空字串', async () => {
    const { pending, req, body } = submitAndCapture({ inviteeName: '' });

    expect(body.payload.invite).toBe('未指定');

    req.flush({ ok: true });
    await pending;
  });

  it('後端拒絕時把錯誤往外拋，不會靜靜當成成功', async () => {
    const { pending, req } = submitAndCapture();

    req.flush({ ok: false, error: 'rate_limited' });

    await expect(pending).rejects.toMatchObject({ code: 'rate_limited' });
  });
});
