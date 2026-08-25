import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { FormField, form, maxLength, submit } from '@angular/forms/signals';

import { AppsScriptError } from '@core/api/apps-script-error';

import { DeepTalkApi } from '../deep-talk.api';

const MAX_DIRECTION_LENGTH = 40;

interface FollowupModel {
  direction: string;
}

/*
 * 「聊不下去了？」展開的那一區。
 *
 * 一顆按鈕分成兩段：展開時先顯示別人問過的追問 —— 那是讀試算表，不花配額也不用等；
 * 底下才是輸入框，想要新的再叫 AI。預設路徑不燒配額，是這個設計的重點。
 */
@Component({
  selector: 'app-followup-panel',
  imports: [FormField],
  styleUrl: './followup-panel.css',
  template: `
    @if (lead()) {
      <p class="followup-lead">{{ lead() }}</p>
    }
    <ul class="followup-list">
      @for (item of items(); track $index) {
        <li>{{ item }}</li>
      }
    </ul>

    <form class="followup-ask" (submit)="_onAsk($event)">
      <label class="sr-only" for="followupDirection">想往哪個方向追問</label>
      <input
        class="input followup-input"
        id="followupDirection"
        type="text"
        autocomplete="off"
        placeholder="想往哪個方向追問？可留空"
        [formField]="form.direction"
      />
      <button class="btn btn-link followup-submit" type="submit" [disabled]="asking()">
        讓 AI 想幾個
      </button>
    </form>

    <p class="followup-status" role="status">{{ status() }}</p>
  `
})
export class FollowupPanel {
  private readonly _api = inject(DeepTalkApi);

  /** 目前這張題目的 id。元件由外層在換題時重建，因此不需要監看變化。 */
  readonly cardId = input.required<string>();

  /*
   * 別人問過的追問。
   *
   * 用 resource 而不是在 ngOnInit 裡自己 await：載入中／成功／失敗三種狀態都由
   * resource 管，元件不必再開三個 signal 去同步它們；required input 也不會有
   * 「建構當下還沒綁定」的時序問題 —— params 是在 render 時才第一次求值。
   */
  private readonly _history = resource({
    params: () => this.cardId(),
    loader: ({ params }) => this._api.loadFollowupHistory(params),
    defaultValue: [] as readonly string[]
  });

  /** AI 想出來的那批。有了就蓋掉歷史清單。 */
  private readonly _generated = signal<readonly string[] | null>(null);
  private readonly _askStatus = signal('');

  protected readonly asking = signal(false);

  /*
   * ⚠️ resource 失敗時 value() 會直接丟出錯誤，不是回傳 defaultValue。
   *    要在畫面上「安靜地當作沒有資料」，一律先問 hasValue()。
   */
  private readonly _historyItems = computed<readonly string[]>(() =>
    this._history.hasValue() ? this._history.value() : []
  );

  protected readonly items = computed(() => this._generated() ?? this._historyItems());

  protected readonly lead = computed(() => {
    if (this._generated()) return 'AI 想到的：';
    return this._historyItems().length > 0 ? '別人問過的：' : '';
  });

  protected readonly status = computed(() => {
    if (this._askStatus()) return this._askStatus();
    if (this._history.isLoading()) return '看看別人問過什麼…';

    // 歷史讀不到不算什麼，輸入框還在，照樣可以叫 AI 想。
    if (this._history.error() || this.items().length > 0) return '';

    return '還沒有人問過這一題。要不要當第一個？';
  });

  private readonly _model = signal<FollowupModel>({ direction: '' });
  protected readonly form = form(this._model, (path) => {
    maxLength(path.direction, MAX_DIRECTION_LENGTH);
  });

  protected async _onAsk(event: Event): Promise<void> {
    event.preventDefault();
    if (this.asking()) return;

    this.asking.set(true);
    this._askStatus.set('AI 正在想…');

    await submit(this.form, {
      action: async () => {
        try {
          this._generated.set(
            await this._api.generateFollowups(this.cardId(), this._model().direction.trim())
          );
          this._askStatus.set('');
        } catch (failure) {
          // 追問只是加分項，失敗就說一聲，不要把人擋在這裡。
          this._askStatus.set(describeFollowupError(failure));
        }
      }
    });

    this.asking.set(false);
  }
}

function describeFollowupError(error: unknown): string {
  const code = error instanceof AppsScriptError ? error.code : undefined;

  return code === 'rate_limited'
    ? '現在有點忙，等一下再試。'
    : 'AI 這次沒想出來，換個方向再試一次。';
}
