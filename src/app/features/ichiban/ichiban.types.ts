export const PRIZE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

export type PrizeKey = (typeof PRIZE_KEYS)[number];

export interface PrizeSetup {
  name: string;
  quantity: number;
}

export interface IchibanSetupModel {
  title: string;
  prizes: Record<PrizeKey, PrizeSetup>;
  lastOneEnabled: boolean;
  lastOneName: string;
}

export interface PrizeDefinition {
  readonly id: PrizeKey;
  readonly label: string;
  readonly name: string;
  readonly quantity: number;
}

export interface PrizeView extends PrizeDefinition {
  readonly remaining: number;
  readonly odds: number;
  readonly oddsLabel: string;
  readonly progressPercent: number;
}

export interface LotteryTicket {
  readonly id: number;
  readonly prizeId: PrizeKey;
  readonly drawn: boolean;
}

export interface TicketView extends LotteryTicket {
  readonly highlighted: boolean;
  readonly numberLabel: string;
}

export interface DrawResult {
  readonly drawNumber: number;
  readonly drawLabel: string;
  readonly ticketId: number;
  readonly ticketLabel: string;
  readonly prizeId: PrizeKey;
  readonly prizeLabel: string;
  readonly prizeName: string;
  readonly winsLastOne: boolean;
}

export type IchibanScreen = 'setup' | 'play';
export type RevealPhase = 'idle' | 'drawing' | 'sealed' | 'opening' | 'revealed';
