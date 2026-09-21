import {
  createTicketBox,
  formatProbability,
  markTicketsDrawn,
  probabilityAtLeastOne,
  selectTickets
} from './ichiban.engine';
import type { PrizeDefinition } from './ichiban.types';

const PRIZES: readonly PrizeDefinition[] = [
  { id: 'a', label: 'A', name: 'A 賞', quantity: 1 },
  { id: 'b', label: 'B', name: 'B 賞', quantity: 2 },
  { id: 'c', label: 'C', name: 'C 賞', quantity: 3 }
];

describe('一番賞抽獎引擎', () => {
  it('依獎項數量建立完整票池，且每個票號唯一', () => {
    const tickets = createTicketBox(PRIZES, () => 0);

    expect(tickets).toHaveLength(6);
    expect(new Set(tickets.map((ticket) => ticket.id)).size).toBe(6);
    expect(tickets.filter((ticket) => ticket.prizeId === 'a')).toHaveLength(1);
    expect(tickets.filter((ticket) => ticket.prizeId === 'b')).toHaveLength(2);
    expect(tickets.filter((ticket) => ticket.prizeId === 'c')).toHaveLength(3);
  });

  it('批次抽取不會重複，已抽出的票也不會再次出現', () => {
    const tickets = createTicketBox(PRIZES, () => 0);
    const first = selectTickets(tickets, 3, () => 0);
    const updated = markTicketsDrawn(tickets, first);
    const second = selectTickets(updated, 3, () => 0);

    expect(new Set(first.map((ticket) => ticket.id)).size).toBe(3);
    expect(second.map((ticket) => ticket.id)).not.toEqual(
      expect.arrayContaining(first.map((ticket) => ticket.id))
    );
    expect([...first, ...second]).toHaveLength(6);
  });

  it('抽取張數超過剩餘票時只會抽完現有票', () => {
    const tickets = createTicketBox(PRIZES, () => 0);

    expect(selectTickets(tickets, 100, () => 0)).toHaveLength(6);
  });

  it('計算一次與多次抽取的超幾何機率', () => {
    expect(probabilityAtLeastOne(80, 1, 1)).toBeCloseTo(1 / 80);
    expect(probabilityAtLeastOne(80, 1, 10)).toBeCloseTo(10 / 80);
    expect(probabilityAtLeastOne(5, 2, 4)).toBe(1);
    expect(probabilityAtLeastOne(5, 0, 4)).toBe(0);
  });

  it('機率文字保留小機率所需精度', () => {
    expect(formatProbability(1 / 200)).toBe('0.50%');
    expect(formatProbability(1 / 80)).toBe('1.3%');
    expect(formatProbability(1)).toBe('100%');
  });
});
