import { Injectable, computed, signal } from '@angular/core';

import { injectTimers } from '@shared/timing';

import { DRAW_COUNTS, PRIZE_SETUP_ROWS } from './ichiban.data';
import {
  createTicketBox,
  formatProbability,
  markTicketsDrawn,
  probabilityAtLeastOne,
  selectTickets
} from './ichiban.engine';
import type {
  DrawResult,
  IchibanScreen,
  IchibanSetupModel,
  LotteryTicket,
  PrizeDefinition,
  PrizeView,
  RevealPhase,
  TicketView
} from './ichiban.types';

const RESET_CONFIRM_MS = 4000;
const DRAW_ANIMATION_FALLBACK_MS = 1100;
const REVEAL_ANIMATION_FALLBACK_MS = 1000;

@Injectable()
export class IchibanStore {
  private readonly _timers = injectTimers();

  readonly screen = signal<IchibanScreen>('setup');
  readonly revealPhase = signal<RevealPhase>('idle');
  readonly boxTitle = signal('');
  readonly lastOneEnabled = signal(false);
  readonly lastOneName = signal('');
  readonly prizes = signal<readonly PrizeDefinition[]>([]);
  readonly tickets = signal<readonly LotteryTicket[]>([]);
  readonly drawCount = signal(1);
  readonly trackedPrizeId = signal('');
  readonly highlightedTicketIds = signal<ReadonlySet<number>>(new Set());
  readonly results = signal<readonly DrawResult[]>([]);
  readonly history = signal<readonly DrawResult[]>([]);
  readonly resetArmed = signal(false);

  private _pendingTickets: readonly LotteryTicket[] = [];
  private _resetToken = 0;

  readonly totalTickets = computed(() => this.tickets().length);
  readonly remainingTickets = computed(() =>
    this.tickets().reduce((total, ticket) => total + (ticket.drawn ? 0 : 1), 0)
  );
  readonly drawnTickets = computed(() => this.totalTickets() - this.remainingTickets());
  readonly progressPercent = computed(() =>
    this.totalTickets() === 0 ? 0 : (this.drawnTickets() / this.totalTickets()) * 100
  );

  readonly ticketViews = computed<readonly TicketView[]>(() => {
    const highlighted = this.highlightedTicketIds();
    return this.tickets().map((ticket) => ({
      ...ticket,
      highlighted: highlighted.has(ticket.id),
      numberLabel: pad(ticket.id)
    }));
  });

  readonly prizeViews = computed<readonly PrizeView[]>(() => {
    const tickets = this.tickets();
    const remainingTotal = this.remainingTickets();

    return this.prizes().map((prize) => {
      const remaining = tickets.reduce(
        (count, ticket) => count + (!ticket.drawn && ticket.prizeId === prize.id ? 1 : 0),
        0
      );
      const odds = remainingTotal === 0 ? 0 : remaining / remainingTotal;

      return {
        ...prize,
        remaining,
        odds,
        oddsLabel: formatProbability(odds),
        progressPercent: prize.quantity === 0 ? 0 : (remaining / prize.quantity) * 100
      };
    });
  });

  readonly trackedPrize = computed(
    () => this.prizeViews().find((prize) => prize.id === this.trackedPrizeId()) ?? null
  );
  readonly singleChanceLabel = computed(() => this.trackedPrize()?.oddsLabel ?? '0%');
  readonly batchChanceLabel = computed(() => {
    const prize = this.trackedPrize();
    if (!prize) return '0%';

    return formatProbability(
      probabilityAtLeastOne(this.remainingTickets(), prize.remaining, this.effectiveDrawCount())
    );
  });

  readonly effectiveDrawCount = computed(() => Math.min(this.drawCount(), this.remainingTickets()));
  readonly canDraw = computed(() => this.revealPhase() === 'idle' && this.remainingTickets() > 0);
  readonly drawButtonLabel = computed(() => {
    if (this.remainingTickets() === 0) return '本盒已抽完';
    return `抽 ${this.effectiveDrawCount()} 張`;
  });
  readonly drawStatus = computed(() =>
    this.revealPhase() === 'drawing' ? `正在從剩餘 ${this.remainingTickets()} 張票中抽取…` : ''
  );
  readonly showResultDialog = computed(() =>
    ['sealed', 'opening', 'revealed'].includes(this.revealPhase())
  );
  readonly recentHistory = computed(() => [...this.history()].reverse().slice(0, 12));
  readonly lastOneWinner = computed(
    () => this.history().find((result) => result.winsLastOne) ?? null
  );
  readonly isComplete = computed(() => this.totalTickets() > 0 && this.remainingTickets() === 0);
  readonly resetLabel = computed(() => (this.resetArmed() ? '確定重新開盒' : '調整賞池設定'));
  readonly drawCounts = DRAW_COUNTS;

  startBox(setup: IchibanSetupModel): void {
    const prizes = PRIZE_SETUP_ROWS.flatMap((row) => {
      const configured = setup.prizes[row.key];
      if (configured.quantity <= 0) return [];

      return [
        {
          id: row.key,
          label: row.label,
          name: configured.name.trim(),
          quantity: configured.quantity
        } satisfies PrizeDefinition
      ];
    });

    this.boxTitle.set(setup.title.trim());
    this.lastOneEnabled.set(setup.lastOneEnabled);
    this.lastOneName.set(setup.lastOneName.trim());
    this.prizes.set(prizes);
    this.tickets.set(createTicketBox(prizes));
    this.drawCount.set(1);
    this.trackedPrizeId.set(prizes[0]?.id ?? '');
    this.highlightedTicketIds.set(new Set());
    this.results.set([]);
    this.history.set([]);
    this.resetArmed.set(false);
    this.revealPhase.set('idle');
    this.screen.set('play');
  }

  setDrawCount(count: number): void {
    if (this.revealPhase() !== 'idle') return;
    this.drawCount.set(Math.max(1, Math.trunc(count)));
  }

  trackPrize(id: string): void {
    this.trackedPrizeId.set(id);
  }

  draw(): void {
    if (!this.canDraw()) return;

    this._pendingTickets = selectTickets(this.tickets(), this.effectiveDrawCount());
    this.highlightedTicketIds.set(new Set(this._pendingTickets.map((ticket) => ticket.id)));
    this.revealPhase.set('drawing');

    // 動畫事件負責讓流程立即接續；計時器是保險，避免樣式未載入或動畫被中斷時卡死。
    this._timers.after(DRAW_ANIMATION_FALLBACK_MS, () => this.commitDraw());
  }

  /** 由抽票 CSS 動畫的 animationend 呼叫；結果到這裡才正式從盒內扣除。 */
  commitDraw(): void {
    if (this.revealPhase() !== 'drawing' || this._pendingTickets.length === 0) return;

    const remainingBefore = this.remainingTickets();
    const historyCount = this.history().length;
    const batchExhaustsBox = this._pendingTickets.length === remainingBefore;
    const prizes = this.prizes();

    const results = this._pendingTickets.map((ticket, index): DrawResult => {
      const prize = prizes.find((candidate) => candidate.id === ticket.prizeId);
      if (!prize) throw new Error('票券指向不存在的獎項。');

      return {
        drawNumber: historyCount + index + 1,
        drawLabel: pad(historyCount + index + 1),
        ticketId: ticket.id,
        ticketLabel: pad(ticket.id),
        prizeId: prize.id,
        prizeLabel: prize.label,
        prizeName: prize.name,
        winsLastOne:
          this.lastOneEnabled() && batchExhaustsBox && index === this._pendingTickets.length - 1
      };
    });

    this.tickets.update((tickets) => markTicketsDrawn(tickets, this._pendingTickets));
    this.history.update((history) => [...history, ...results]);
    this.results.set(results);
    this.highlightedTicketIds.set(new Set());
    this._pendingTickets = [];
    this.revealPhase.set('sealed');
  }

  openResults(): void {
    if (this.revealPhase() !== 'sealed') return;

    this.revealPhase.set('opening');
    this._timers.after(REVEAL_ANIMATION_FALLBACK_MS, () => this.finishReveal());
  }

  finishReveal(): void {
    if (this.revealPhase() === 'opening') this.revealPhase.set('revealed');
  }

  closeResults(): void {
    if (!this.showResultDialog()) return;

    this.results.set([]);
    this.revealPhase.set('idle');
    this.drawCount.set(Math.min(this.drawCount(), Math.max(1, this.remainingTickets())));
  }

  requestReset(): void {
    if (this.resetArmed()) {
      this._resetToSetup();
      return;
    }

    const token = ++this._resetToken;
    this.resetArmed.set(true);
    this._timers.after(RESET_CONFIRM_MS, () => {
      if (token === this._resetToken) this.resetArmed.set(false);
    });
  }

  private _resetToSetup(): void {
    this._resetToken += 1;
    this._pendingTickets = [];
    this.highlightedTicketIds.set(new Set());
    this.results.set([]);
    this.resetArmed.set(false);
    this.revealPhase.set('idle');
    this.screen.set('setup');
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
