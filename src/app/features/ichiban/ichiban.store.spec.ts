import { TestBed } from '@angular/core/testing';

import { createIchibanSetup } from './ichiban.data';
import { IchibanStore } from './ichiban.store';

describe('IchibanStore', () => {
  let store: IchibanStore;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [IchibanStore] });
    store = TestBed.inject(IchibanStore);
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  function startTwoTicketBox(): void {
    const setup = createIchibanSetup();
    setup.prizes.a.quantity = 1;
    setup.prizes.b.quantity = 1;
    setup.prizes.c.quantity = 0;
    setup.prizes.d.quantity = 0;
    setup.prizes.e.quantity = 0;
    setup.prizes.f.quantity = 0;
    setup.prizes.g.quantity = 0;
    store.startBox(setup);
  }

  it('抽票動畫事件遺失時，保險計時器仍會完成扣票', async () => {
    startTwoTicketBox();
    store.setDrawCount(1);

    store.draw();
    expect(store.revealPhase()).toBe('drawing');

    await vi.advanceTimersByTimeAsync(1100);

    expect(store.revealPhase()).toBe('sealed');
    expect(store.remainingTickets()).toBe(1);
    expect(store.results()).toHaveLength(1);
    expect(store.history()).toHaveLength(1);
  });

  it('撕票動畫事件遺失時，保險計時器仍會顯示結果', async () => {
    startTwoTicketBox();
    store.draw();
    store.commitDraw();

    store.openResults();
    expect(store.revealPhase()).toBe('opening');

    await vi.advanceTimersByTimeAsync(1000);

    expect(store.revealPhase()).toBe('revealed');
  });

  it('整盒一次抽完時，只有揭票順序最後一張取得最後賞', () => {
    startTwoTicketBox();
    store.setDrawCount(2);
    store.draw();
    store.commitDraw();

    expect(store.results()).toHaveLength(2);
    expect(store.results()[0]?.winsLastOne).toBe(false);
    expect(store.results()[1]?.winsLastOne).toBe(true);
    expect(store.remainingTickets()).toBe(0);
  });

  it('動畫事件與保險計時器都抵達時不會重複寫入紀錄', async () => {
    startTwoTicketBox();
    store.draw();
    store.commitDraw();

    await vi.advanceTimersByTimeAsync(1100);

    expect(store.history()).toHaveLength(1);
    expect(store.remainingTickets()).toBe(1);
  });
});
