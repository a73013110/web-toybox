import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild
} from '@angular/core';

import type { DrawResult, RevealPhase } from './ichiban.types';

@Component({
  selector: 'app-ichiban-result',
  styleUrl: './result-reveal.css',
  host: { 'data-modal-root': '' },
  template: `
    <div class="result-backdrop" animate.enter="result-backdrop-enter">
      <section
        class="result-dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        [attr.aria-label]="phase() === 'revealed' ? null : '抽獎結果已鎖定'"
        [attr.aria-labelledby]="phase() === 'revealed' ? 'resultTitle' : null"
        [class.is-opening]="phase() === 'opening'"
        [class.is-revealed]="phase() === 'revealed'"
        (keydown.escape)="closeRequested.emit()"
      >
        <button class="result-dismiss" type="button" (click)="closeRequested.emit()">關閉</button>

        <div class="result-content" [attr.aria-hidden]="phase() === 'revealed' ? null : 'true'">
          <p class="result-kicker">抽獎結果</p>
          <h2 #resultTitle id="resultTitle" tabindex="-1">{{ heading() }}</h2>

          <div class="result-grid">
            @for (result of results(); track result.drawNumber) {
              <article class="result-card" [class.has-last-one]="result.winsLastOne">
                <span class="result-tier">{{ result.prizeLabel }}</span>
                <div>
                  <p>{{ result.prizeName }}</p>
                  <small>票券 #{{ result.ticketLabel }}</small>
                </div>
                @if (result.winsLastOne) {
                  <div class="last-one-award">
                    <span>LAST ONE</span>
                    <strong>{{ lastOneName() }}</strong>
                  </div>
                }
              </article>
            }
          </div>

          @if (phase() === 'revealed') {
            <button class="result-close" type="button" (click)="closeRequested.emit()">
              {{ isComplete() ? '查看完整結果' : '繼續抽獎' }}
            </button>
          }
        </div>

        @if (phase() !== 'revealed') {
          <button
            class="ticket-cover"
            type="button"
            data-initial-focus
            [disabled]="phase() === 'opening'"
            (click)="openRequested.emit()"
            (animationend)="_onRevealAnimationEnd($event)"
          >
            <span class="cover-index">{{ countLabel() }}</span>
            <span class="cover-copy">
              <strong>結果已鎖定</strong>
              <small>沿虛線撕開票券</small>
            </span>
            <span class="tear-line" aria-hidden="true"></span>
          </button>
        }
      </section>
    </div>
  `
})
export class ResultReveal {
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _resultTitle = viewChild<ElementRef<HTMLHeadingElement>>('resultTitle');

  readonly phase = input.required<RevealPhase>();
  readonly results = input.required<readonly DrawResult[]>();
  readonly lastOneName = input.required<string>();
  readonly isComplete = input.required<boolean>();

  readonly openRequested = output<void>();
  readonly revealFinished = output<void>();
  readonly closeRequested = output<void>();

  protected readonly countLabel = computed(() => String(this.results().length).padStart(2, '0'));
  protected readonly heading = computed(() => {
    const results = this.results();
    if (results.length === 1) return `${results[0]?.prizeLabel ?? ''} 賞`;
    return `本次抽出 ${results.length} 張`;
  });

  constructor() {
    afterNextRender(() => {
      this._host.nativeElement.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    });

    effect(() => {
      if (this.phase() === 'revealed') this._resultTitle()?.nativeElement.focus();
    });
  }

  protected _onRevealAnimationEnd(event: AnimationEvent): void {
    if (event.target === event.currentTarget) this.revealFinished.emit();
  }
}
