import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { InvitationCard } from './invitation-card';
import { InvitationCardApi } from './invitation-card.api';
import type { InvitationSubmission } from './invitation-card.types';

class FakeApi {
  readonly submissions: InvitationSubmission[] = [];

  submitInvitation(submission: InvitationSubmission): Promise<void> {
    this.submissions.push(submission);
    return Promise.resolve();
  }
}

describe('InvitationCard', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true)
    }));

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: InvitationCardApi, useValue: api }]
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render(invite: string | undefined): Promise<ComponentFixture<InvitationCard>> {
    const fixture = TestBed.createComponent(InvitationCard);
    fixture.componentRef.setInput('invite', invite);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ComponentFixture<InvitationCard>): Promise<void> {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  function hostOf(fixture: ComponentFixture<InvitationCard>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function submit(form: HTMLFormElement): void {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  async function advanceToActivities(fixture: ComponentFixture<InvitationCard>): Promise<void> {
    const host = hostOf(fixture);
    host.querySelector<HTMLButtonElement>('.yes-btn')!.click();
    await settle(fixture);
    host.querySelector<HTMLButtonElement>('section.active .btn-primary')!.click();
    await settle(fixture);
    host.querySelector<HTMLInputElement>('.timing-option input')!.click();
    submit(host.querySelector<HTMLFormElement>('section.active form')!);
    await settle(fixture);
  }

  it('未帶 invite 參數時安全地開啟姓名關卡', async () => {
    const fixture = await render(undefined);
    const gate = hostOf(fixture).querySelector<HTMLElement>('.name-gate');

    expect(gate?.hidden).toBe(false);
    expect(hostOf(fixture).querySelector('main')?.hasAttribute('inert')).toBe(true);
  });

  it('帶入 invite 時會先正規化，並直接顯示邀請卡', async () => {
    const fixture = await render('  小明  ');
    const host = hostOf(fixture);

    expect(host.querySelector<HTMLElement>('.name-gate')?.hidden).toBe(true);
    expect(host.querySelector('.invitee-name')?.textContent?.trim()).toBe('小明，');
  });

  it('從姓名輸入到確認選擇可完整送出並顯示摘要', async () => {
    const fixture = await render(undefined);
    const host = hostOf(fixture);
    const nameInput = host.querySelector<HTMLInputElement>('.name-input')!;

    nameInput.value = '  小明  ';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    submit(host.querySelector<HTMLFormElement>('.name-panel')!);
    await settle(fixture);

    await advanceToActivities(fixture);

    host.querySelector<HTMLInputElement>('.activity-option input')!.click();
    await settle(fixture);
    const confirm = host.querySelector<HTMLButtonElement>('.confirm-btn')!;
    expect(confirm.disabled).toBe(false);

    submit(host.querySelector<HTMLFormElement>('section.active form')!);
    await settle(fixture);

    expect(api.submissions).toHaveLength(1);
    expect(api.submissions[0]).toMatchObject({
      inviteeName: '小明',
      activities: ['用餐']
    });
    expect(host.querySelector<HTMLElement>('[aria-labelledby="scene5Title"]')?.hidden).toBe(false);
    expect(host.querySelector('.summary-box')?.textContent).toContain('用餐');
  });

  it('提交時若前置資料失效，會回到真正需要修正的姓名關卡', async () => {
    const fixture = await render('小明');
    const host = hostOf(fixture);
    await advanceToActivities(fixture);

    const nameInput = host.querySelector<HTMLInputElement>('.name-input')!;
    nameInput.value = '';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    host.querySelector<HTMLInputElement>('.activity-option input')!.click();
    await settle(fixture);

    submit(host.querySelector<HTMLFormElement>('section.active form')!);
    await settle(fixture);

    expect(api.submissions).toHaveLength(0);
    expect(host.querySelector<HTMLElement>('.name-gate')?.hidden).toBe(false);
    expect(host.querySelector('#nameError')?.textContent).toContain('請填入姓名或稱呼。');
  });
});
