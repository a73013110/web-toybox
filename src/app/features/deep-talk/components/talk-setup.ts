import { Component, computed, input, output } from '@angular/core';

import type { TopicPreference, TopicSelection } from '../deep-talk.types';
import { DEPTHS, STAGES, TOPICS } from '../taxonomy';

const TOPIC_STATE_LABEL: Record<TopicPreference | 'none', string> = {
  want: '想聊',
  skip: '不要',
  none: '未指定'
};

/*
 * 開場的三個步驟：關係、深度、主題。
 *
 * 這個元件不認識 Store，只把使用者的選擇往外送。
 */
@Component({
  selector: 'app-talk-setup',
  styleUrl: './talk-setup.css',
  template: `
    <div class="panel">
      <div class="progress" aria-hidden="true">
        <span [style.width.%]="progressPercent()"></span>
      </div>

      @if (step() > 1) {
        <button class="step-back" type="button" aria-label="回到上一步" (click)="back.emit()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
          <span>上一步</span>
        </button>
      }

      <div class="step" [class.is-active]="step() === 1">
        <div class="mark" aria-hidden="true">
          <svg viewBox="0 0 34 34" fill="none">
            <circle cx="12" cy="17" r="8" />
            <circle cx="22" cy="17" r="8" />
          </svg>
        </div>
        <p class="eyebrow">Step One</p>
        <h2>你們是什麼關係？</h2>
        <p class="sub">同一個問題，在不同階段問起來完全不一樣。</p>
        <div class="choice-grid" role="radiogroup" aria-label="關係階段">
          @for (option of stages; track option.value) {
            <label class="choice">
              <!--
                聽 click 而不是 change：從下一步倒回來時，原本挑的那一顆已經是選中狀態，
                再點一次不會觸發 change，使用者就卡在這一步——但他的意思明明是「就這個，繼續」。
              -->
              <input
                type="radio"
                name="stage"
                [value]="option.value"
                [checked]="option.value === stage()"
                (click)="stagePicked.emit(option.value)"
              />
              <span class="choice-body">
                <strong>{{ option.value }}</strong>
                <small>{{ option.hint }}</small>
              </span>
            </label>
          }
        </div>
      </div>

      <div class="step" [class.is-active]="step() === 2">
        <div class="mark" aria-hidden="true">
          <svg viewBox="0 0 34 34" fill="none">
            <path d="M5 11h24M8 17h18M12 23h10M15 29h4" />
          </svg>
        </div>
        <p class="eyebrow">Step Two</p>
        <h2>今天想聊多深？</h2>
        <p class="sub">這是這一疊的天花板。前面幾張會先暖場，聊開了才往下走。</p>
        <div class="choice-grid" role="radiogroup" aria-label="深度上限">
          @for (option of depths; track option.value) {
            <label class="choice">
              <input
                type="radio"
                name="depth"
                [value]="option.value"
                [checked]="option.value === depth()"
                (click)="depthPicked.emit(option.value)"
              />
              <span class="choice-body">
                <strong>{{ option.value }}</strong>
                <small>{{ option.hint }}</small>
              </span>
            </label>
          }
        </div>
      </div>

      <div class="step" [class.is-active]="step() === 3">
        <div class="mark" aria-hidden="true">
          <svg viewBox="0 0 34 34" fill="none">
            <path d="M17 5l3.6 7.9 8.4.9-6.3 5.8 1.8 8.4L17 23.8 9.5 28l1.8-8.4L5 13.8l8.4-.9z" />
          </svg>
        </div>
        <p class="eyebrow">Step Three</p>
        <h2>有什麼想聊、什麼不想碰？</h2>
        <p class="sub">點一下標成「想聊」，再點一下標成「不要」。不標就是隨緣。</p>

        <div class="topic-grid">
          @for (chip of topicChips(); track chip.topic) {
            <button
              class="topic"
              type="button"
              [attr.data-state]="chip.state"
              [attr.aria-label]="chip.ariaLabel"
              (click)="topicCycled.emit(chip.topic)"
            >
              <span class="topic-name">{{ chip.topic }}</span>
              <span class="topic-state" aria-hidden="true">{{ chip.badge }}</span>
            </button>
          }
        </div>

        <p class="topic-summary" aria-live="polite">{{ topicSummary() }}</p>
        <p class="field-error" aria-live="polite">{{ error() }}</p>
        <button class="btn btn-primary btn-wide start-btn" type="button" (click)="started.emit()">
          開始
        </button>
      </div>
    </div>

    <p class="panel-foot">
      <button class="btn btn-link" type="button" (click)="trendingRequested.emit()">
        看看大家最愛聊的題目
      </button>
    </p>
  `
})
export class TalkSetup {
  readonly step = input.required<number>();
  readonly stage = input.required<string>();
  readonly depth = input.required<string>();
  readonly topics = input.required<TopicSelection>();
  readonly topicSummary = input.required<string>();
  readonly progressPercent = input.required<number>();
  readonly error = input('');

  readonly stagePicked = output<string>();
  readonly depthPicked = output<string>();
  readonly topicCycled = output<string>();
  readonly back = output<void>();
  readonly started = output<void>();
  readonly trendingRequested = output<void>();

  protected readonly stages = STAGES;
  protected readonly depths = DEPTHS;

  /** 主題徽章一次算好，template 就不必為每顆按鈕呼叫三個方法。 */
  protected readonly topicChips = computed(() =>
    TOPICS.map((topic) => {
      const state = this.topics()[topic] ?? 'none';
      const label = TOPIC_STATE_LABEL[state];

      return {
        topic,
        state,
        ariaLabel: `${topic}：${label}`,
        badge: state === 'none' ? '' : label
      };
    })
  );
}
