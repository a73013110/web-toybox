import { Injectable, inject } from '@angular/core';

import { AppsScriptClient } from '@core/api/apps-script-client';

import type { InvitationSubmission } from './invitation-card.types';

@Injectable({ providedIn: 'root' })
export class InvitationCardApi {
  private readonly _client = inject(AppsScriptClient);

  /*
   * 送出一份邀請結果。成功即 resolve，失敗會拋出 AppsScriptError。
   *
   * 欄位名稱由 apps-script/app-invitation-card.gs 驗證，不可自行更名。
   */
  async submitInvitation(submission: InvitationSubmission): Promise<void> {
    await this._client.send('invitation-card', {
      schemaVersion: 1, // 只在資料結構改版時遞增，不與前端選項內容綁定。
      invite: submission.inviteeName || '未指定',
      declineCount: submission.declineCount, // 這次流程按下「先不要」及其變化按鈕的總次數。
      timing: submission.timing,
      activities: [...submission.activities], // 保留陣列格式，交由 Apps Script 驗證並寫入試算表。
      page: submission.page
    });
  }
}
