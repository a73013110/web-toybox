import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';

import { copyText, downloadBlob, renderQuestionCard } from '../card-image';
import type { QuestionCard as Card } from '../deep-talk.types';
import { FollowupPanel } from './followup-panel';

/** 動作按鈕上的提示文字停留多久。 */
const LABEL_FLASH_MS = 1600;

const COPY_DEFAULT = '複製題目';
const IMAGE_DEFAULT = '存成卡片';

@Component({
  selector: 'app-question-card',
  imports: [FollowupPanel],
  styleUrl: './question-card.css',
  template: `
    <div class="deck">
      <article class="card" [class.is-turning]="turning()">
        <header class="card-top">
          <span class="card-depth">{{ card().depth }}</span>
          <span class="card-count">{{ count() }}</span>
        </header>

        <p class="card-question">{{ card().text }}</p>

        <ul class="card-topics">
          @for (topic of card().topics; track topic) {
            <li>{{ topic }}</li>
          }
        </ul>
        <p class="card-loved" [hidden]="!lovedLabel()">{{ lovedLabel() }}</p>

        <div class="card-share">
          <button class="chip-btn" type="button" (click)="_onCopy()">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
            <span>{{ copyLabel() }}</span>
          </button>
          <button class="chip-btn" type="button" [disabled]="savingImage()" (click)="_onSaveImage()">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m3 16 5-5 4 4 3-3 6 6" />
            </svg>
            <span>{{ imageLabel() }}</span>
          </button>
          <button
            class="chip-btn"
            type="button"
            aria-controls="followupPanel"
            [attr.aria-expanded]="followupOpen()"
            (click)="_onToggleFollowup()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l.9-5.4A8 8 0 1 1 21 12z" />
            </svg>
            <span>聊不下去了？</span>
          </button>
        </div>

        <!--
          追問區只在按下按鈕後才建立，卡片本身的版面完全不受影響。
          用 @if 而不是 hidden：這一區要在每次展開時重新讀資料，
          重建元件正好等於重置它的狀態。
        -->
        @if (followupOpen()) {
          <div class="followup" id="followupPanel">
            <app-followup-panel [cardId]="card().id" />
          </div>
        }
      </article>
    </div>

    <div class="vote">
      <button class="btn btn-primary" type="button" (click)="voted.emit('like')">很讚，下一題</button>
      <button class="btn btn-link" type="button" (click)="voted.emit('skip')">跳過這題</button>
    </div>
  `
})
export class QuestionCard {
  private readonly _destroyRef = inject(DestroyRef);

  readonly card = input.required<Card>();
  readonly count = input.required<string>();
  readonly lovedLabel = input.required<string>();
  /** 每次翻牌 +1，用來重播翻牌動畫。 */
  readonly turning = input(false);

  readonly voted = output<'like' | 'skip'>();

  protected readonly copyLabel = signal(COPY_DEFAULT);
  protected readonly imageLabel = signal(IMAGE_DEFAULT);
  protected readonly savingImage = signal(false);
  protected readonly followupOpen = signal(false);

  protected _onToggleFollowup(): void {
    this.followupOpen.update((open) => !open);
  }

  protected async _onCopy(): Promise<void> {
    const copied = await copyText(this.card().text);
    this._flash(this.copyLabel, copied ? '已複製' : '複製失敗', COPY_DEFAULT);
  }

  protected async _onSaveImage(): Promise<void> {
    const card = this.card();

    this.savingImage.set(true);
    this.imageLabel.set('產生中…');

    try {
      const blob = await renderQuestionCard(card);

      downloadBlob(blob, `deep-talk-${card.id}.png`);
      this._flash(this.imageLabel, '已存下', IMAGE_DEFAULT);
    } catch {
      this._flash(this.imageLabel, '沒能產生', IMAGE_DEFAULT);
    } finally {
      this.savingImage.set(false);
    }
  }

  private _flash(target: { set(value: string): void }, text: string, revert: string): void {
    target.set(text);

    const handle = setTimeout(() => target.set(revert), LABEL_FLASH_MS);
    this._destroyRef.onDestroy(() => clearTimeout(handle));
  }
}
