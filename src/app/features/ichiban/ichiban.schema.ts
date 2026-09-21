import { maxLength, required, schema, validate } from '@angular/forms/signals';

import { MAX_POOL_SIZE, MAX_PRIZE_QUANTITY } from './ichiban.data';
import { PRIZE_KEYS } from './ichiban.types';
import type { IchibanSetupModel } from './ichiban.types';

export const ichibanSchema = schema<IchibanSetupModel>((path) => {
  required(path.title, { message: '請替這盒賞池命名。' });
  maxLength(path.title, 40, { message: '賞池名稱最多 40 個字。' });

  for (const key of PRIZE_KEYS) {
    validate(path.prizes[key].quantity, ({ value }) => {
      const quantity = value();
      return Number.isInteger(quantity) && quantity >= 0 && quantity <= MAX_PRIZE_QUANTITY
        ? undefined
        : { kind: 'quantity', message: `數量需為 0 到 ${MAX_PRIZE_QUANTITY} 的整數。` };
    });

    validate(path.prizes[key].name, ({ value, valueOf }) =>
      valueOf(path.prizes[key].quantity) === 0 || value().trim()
        ? undefined
        : { kind: 'required', message: '啟用的獎項需要名稱。' }
    );
    maxLength(path.prizes[key].name, 40, { message: '獎項名稱最多 40 個字。' });
  }

  validate(path.prizes, ({ value }) => {
    const total = PRIZE_KEYS.reduce((sum, key) => sum + value()[key].quantity, 0);
    if (total === 0) return { kind: 'emptyPool', message: '至少需要一張票。' };
    return total <= MAX_POOL_SIZE
      ? undefined
      : { kind: 'poolTooLarge', message: `整盒最多 ${MAX_POOL_SIZE} 張票。` };
  });

  validate(path.lastOneName, ({ value, valueOf }) =>
    !valueOf(path.lastOneEnabled) || value().trim()
      ? undefined
      : { kind: 'required', message: '啟用最後賞時需要填寫名稱。' }
  );
  maxLength(path.lastOneName, 40, { message: '最後賞名稱最多 40 個字。' });
});
