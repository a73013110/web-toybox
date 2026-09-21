import type { LotteryTicket, PrizeDefinition } from './ichiban.types';

export type RandomIndex = (maxExclusive: number) => number;

const UINT32_RANGE = 0x1_0000_0000;

/**
 * 以 Web Crypto 產生 [0, maxExclusive) 的均勻整數。
 * 超過最大完整倍數的值會重抽，避免直接取餘數造成 modulo bias。
 */
export function secureRandomIndex(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
    throw new RangeError('隨機範圍必須是 1 到 2^32 之間的整數。');
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error('這個瀏覽器不支援安全亂數。');

  const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);

  while (true) {
    cryptoApi.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % maxExclusive;
  }
}

/** 建立一盒票，並把獎項以 Fisher–Yates 均勻洗入各票號。 */
export function createTicketBox(
  prizes: readonly PrizeDefinition[],
  randomIndex: RandomIndex = secureRandomIndex
): readonly LotteryTicket[] {
  const prizeIds = prizes.flatMap((prize) =>
    Array.from({ length: prize.quantity }, () => prize.id)
  );

  for (let index = prizeIds.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [prizeIds[index], prizeIds[target]] = [prizeIds[target]!, prizeIds[index]!];
  }

  return prizeIds.map((prizeId, index) => ({ id: index + 1, prizeId, drawn: false }));
}

/** 從仍在盒內的票中抽出指定張數；回傳順序就是本批揭票順序。 */
export function selectTickets(
  tickets: readonly LotteryTicket[],
  requestedCount: number,
  randomIndex: RandomIndex = secureRandomIndex
): readonly LotteryTicket[] {
  const available = tickets.filter((ticket) => !ticket.drawn);
  const count = Math.min(Math.max(0, Math.trunc(requestedCount)), available.length);
  const selected: LotteryTicket[] = [];

  for (let index = 0; index < count; index += 1) {
    const target = randomIndex(available.length);
    const [ticket] = available.splice(target, 1);
    if (ticket) selected.push(ticket);
  }

  return selected;
}

export function markTicketsDrawn(
  tickets: readonly LotteryTicket[],
  selected: readonly LotteryTicket[]
): readonly LotteryTicket[] {
  const selectedIds = new Set(selected.map((ticket) => ticket.id));
  return tickets.map((ticket) =>
    selectedIds.has(ticket.id) ? { ...ticket, drawn: true } : ticket
  );
}

/**
 * 有限票池中，抽 k 張至少出現一次目標獎項的精確機率。
 * 使用超幾何分布的補事件，並以連乘避免組合數溢位。
 */
export function probabilityAtLeastOne(
  totalRemaining: number,
  targetRemaining: number,
  drawCount: number
): number {
  const total = Math.max(0, Math.trunc(totalRemaining));
  const target = Math.min(total, Math.max(0, Math.trunc(targetRemaining)));
  const draws = Math.min(total, Math.max(0, Math.trunc(drawCount)));

  if (target === 0 || draws === 0) return 0;
  if (draws > total - target) return 1;

  let missProbability = 1;
  for (let index = 0; index < draws; index += 1) {
    missProbability *= (total - target - index) / (total - index);
  }

  return 1 - missProbability;
}

export function formatProbability(probability: number): string {
  if (probability <= 0) return '0%';
  if (probability >= 1) return '100%';

  const percentage = probability * 100;
  return percentage < 1 ? `${percentage.toFixed(2)}%` : `${percentage.toFixed(1)}%`;
}
