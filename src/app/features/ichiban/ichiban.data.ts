import type { IchibanSetupModel, PrizeKey } from './ichiban.types';

export const MAX_PRIZE_QUANTITY = 80;
export const MAX_POOL_SIZE = 200;
export const DRAW_COUNTS = [1, 3, 5, 10] as const;

export interface PrizeSetupRow {
  readonly key: PrizeKey;
  readonly label: string;
}

export const PRIZE_SETUP_ROWS: readonly PrizeSetupRow[] = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
  { key: 'd', label: 'D' },
  { key: 'e', label: 'E' },
  { key: 'f', label: 'F' },
  { key: 'g', label: 'G' }
];

export function createIchibanSetup(): IchibanSetupModel {
  return {
    title: '示範賞池',
    prizes: {
      a: { name: '主視覺模型', quantity: 1 },
      b: { name: '角色模型', quantity: 2 },
      c: { name: '收藏掛畫', quantity: 3 },
      d: { name: '玻璃杯', quantity: 4 },
      e: { name: '壓克力立牌', quantity: 10 },
      f: { name: '橡膠吊飾', quantity: 20 },
      g: { name: '迷你毛巾', quantity: 40 }
    },
    lastOneEnabled: true,
    lastOneName: '特別配色模型'
  };
}
