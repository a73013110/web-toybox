import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { DeepTalkApi } from '../deep-talk.api';
import { FollowupPanel } from './followup-panel';

class FakeApi {
  asked: { id: string; direction: string }[] = [];

  history: readonly string[] = ['他後來怎麼決定的？'];
  historyError: unknown = null;
  generated: readonly string[] = ['那件事現在還會影響你嗎？'];

  loadFollowupHistory(): Promise<readonly string[]> {
    return this.historyError ? Promise.reject(this.historyError) : Promise.resolve(this.history);
  }

  generateFollowups(id: string, direction: string): Promise<readonly string[]> {
    this.asked.push({ id, direction });
    return Promise.resolve(this.generated);
  }
}

/*
 * resource() 的測試示範。
 *
 * 不需要 flush 任何東西：resource 的載入會登記成 pending task，
 * fixture.whenStable() 等它結束之後畫面就是最終狀態。
 */
describe('FollowupPanel', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: DeepTalkApi, useValue: api }] });
  });

  async function render(): Promise<ComponentFixture<FollowupPanel>> {
    const fixture = TestBed.createComponent(FollowupPanel);

    fixture.componentRef.setInput('cardId', 'q-1');
    await fixture.whenStable();

    return fixture;
  }

  function textOf(fixture: ComponentFixture<FollowupPanel>, selector: string): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim() ?? ''
    );
  }

  function itemsOf(fixture: ComponentFixture<FollowupPanel>): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.followup-list li')].map(
      (item) => item.textContent?.trim() ?? ''
    );
  }

  it('展開時先列出別人問過的，不需要動到 AI', async () => {
    const fixture = await render();

    expect(itemsOf(fixture)).toEqual(['他後來怎麼決定的？']);
    expect(textOf(fixture, '.followup-lead')).toBe('別人問過的：');
    expect(api.asked).toHaveLength(0);
  });

  it('沒有人問過時邀請使用者當第一個', async () => {
    api.history = [];

    expect(textOf(await render(), '.followup-status')).toBe('還沒有人問過這一題。要不要當第一個？');
  });

  it('歷史讀不到就安靜略過，輸入框照樣能用', async () => {
    api.historyError = new Error('offline');
    const fixture = await render();

    expect(itemsOf(fixture)).toEqual([]);
    expect(textOf(fixture, '.followup-status')).toBe('');
  });

  it('送出後改列 AI 想到的，並把方向一起帶給後端', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input')!;

    input.value = '往未來問';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    host.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(api.asked).toEqual([{ id: 'q-1', direction: '往未來問' }]);
    expect(itemsOf(fixture)).toEqual(['那件事現在還會影響你嗎？']);
    expect(textOf(fixture, '.followup-lead')).toBe('AI 想到的：');
  });
});
