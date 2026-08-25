import { maxLength, required, schema, validate } from '@angular/forms/signals';

import { MAX_CUSTOM_ACTIVITY_LENGTH, MAX_NAME_LENGTH } from './invitation-card.data';
import { ACTIVITY_KEYS } from './invitation-card.types';
import type { InvitationModel } from './invitation-card.types';

/*
 * 邀請卡的驗證規則。
 *
 * 抽成獨立的 schema 而不是寫在元件裡，是為了能單獨測試——
 * 驗證邏輯是這個作品最容易改壞、也最值得回歸測試的部分。
 */
export const invitationSchema = schema<InvitationModel>((path) => {
  required(path.inviteeName, { message: '請填入姓名或稱呼。' });
  maxLength(path.inviteeName, MAX_NAME_LENGTH);

  required(path.timing, { message: '請先選一個成行暗號。' });

  maxLength(path.customActivity, MAX_CUSTOM_ACTIVITY_LENGTH);
  required(path.customActivity, {
    when: ({ valueOf }) => valueOf(path.customEnabled),
    message: '請填寫自訂項目。'
  });

  // 跨欄位規則：預設項目與自訂項目至少要有一個成立。
  validate(path.activities, ({ value, valueOf }) => {
    const hasPreset = ACTIVITY_KEYS.some((key) => value()[key]);
    const hasCustom = valueOf(path.customEnabled) && valueOf(path.customActivity).trim().length > 0;

    return hasPreset || hasCustom
      ? undefined
      : { kind: 'noActivitySelected', message: '請至少選擇一個項目。' };
  });
});
