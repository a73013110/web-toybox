import { Component, input } from '@angular/core';

import type { TrendingCard } from '../deep-talk.types';

@Component({
  selector: 'app-trending-list',
  styleUrl: './trending-list.css',
  template: `
    <ol class="rank-list">
      @for (card of cards(); track $index; let i = $index) {
        <li class="rank-item">
          <span class="rank-number">{{ rankOf(i) }}</span>
          <div class="rank-body">
            <p class="rank-question">{{ card.text }}</p>
            <p class="rank-meta">{{ metaOf(card) }}</p>
          </div>
        </li>
      }
    </ol>
    <p class="rank-empty" [hidden]="!emptyMessage()">{{ emptyMessage() }}</p>
  `
})
export class TrendingList {
  readonly cards = input.required<readonly TrendingCard[]>();
  /** 載入中、載入失敗或沒有資料時要顯示的一行字。 */
  readonly emptyMessage = input.required<string>();

  protected rankOf(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  protected metaOf(card: TrendingCard): string {
    const votes = card.likes + card.skips;
    const loved = votes > 0 ? Math.round((card.likes / votes) * 100) : 0;

    return `${loved}% 說很讚 · ${votes} 票 · ${card.depth}`;
  }
}
