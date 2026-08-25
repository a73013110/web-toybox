import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import { createInvitationModel, MAX_CUSTOM_ACTIVITY_LENGTH } from './invitation-card.data';
import { invitationSchema } from './invitation-card.schema';
import type { InvitationModel } from './invitation-card.types';

/** form() 需要 injection context。 */
function createForm(overrides: Partial<InvitationModel> = {}) {
  const model = signal<InvitationModel>({ ...createInvitationModel(), ...overrides });
  const invitationForm = TestBed.runInInjectionContext(() => form(model, invitationSchema));

  return { model, form: invitationForm };
}

function firstMessage(errors: readonly { readonly message?: string }[]): string | undefined {
  return errors[0]?.message;
}

describe('invitationSchema', () => {
  describe('姓名', () => {
    it('空白不通過', () => {
      const { form: f } = createForm();

      expect(f.inviteeName().invalid()).toBe(true);
      expect(firstMessage(f.inviteeName().errors())).toBe('請填入姓名或稱呼。');
    });

    it('填了就通過', () => {
      const { form: f } = createForm({ inviteeName: '小明' });

      expect(f.inviteeName().invalid()).toBe(false);
    });
  });

  describe('成行暗號', () => {
    it('沒選不通過', () => {
      const { form: f } = createForm();

      expect(f.timing().invalid()).toBe(true);
      expect(firstMessage(f.timing().errors())).toBe('請先選一個成行暗號。');
    });

    it('選了就通過', () => {
      const { form: f } = createForm({ timing: '深夜限定' });

      expect(f.timing().invalid()).toBe(false);
    });
  });

  describe('活動至少一項', () => {
    it('什麼都沒勾時不通過', () => {
      const { form: f } = createForm();

      expect(f.activities().invalid()).toBe(true);
      expect(firstMessage(f.activities().errors())).toBe('請至少選擇一個項目。');
    });

    it('勾了預設項目就通過', () => {
      const { form: f } = createForm({
        activities: { ...createInvitationModel().activities, meal: true }
      });

      expect(f.activities().invalid()).toBe(false);
    });

    it('只勾自訂但沒填內容，仍然不算選了東西', () => {
      const { form: f } = createForm({ customEnabled: true, customActivity: '   ' });

      expect(f.activities().invalid()).toBe(true);
    });

    it('自訂項目填了內容就通過', () => {
      const { form: f } = createForm({ customEnabled: true, customActivity: '一起看展' });

      expect(f.activities().invalid()).toBe(false);
    });
  });

  describe('自訂項目', () => {
    it('沒勾選時不要求填寫', () => {
      const { form: f } = createForm({ customEnabled: false, customActivity: '' });

      expect(f.customActivity().invalid()).toBe(false);
    });

    it('勾選後就變成必填', () => {
      const { form: f } = createForm({ customEnabled: true, customActivity: '' });

      expect(f.customActivity().invalid()).toBe(true);
      expect(firstMessage(f.customActivity().errors())).toBe('請填寫自訂項目。');
    });

    it('超過長度上限不通過', () => {
      const { form: f } = createForm({
        customEnabled: true,
        customActivity: 'a'.repeat(MAX_CUSTOM_ACTIVITY_LENGTH + 1)
      });

      expect(f.customActivity().invalid()).toBe(true);
    });
  });

  it('欄位變動會即時反映到驗證結果', () => {
    const { form: f } = createForm();

    expect(f().invalid()).toBe(true);

    f.inviteeName().value.set('小明');
    f.timing().value.set('深夜限定');
    f.activities.meal().value.set(true);

    expect(f().invalid()).toBe(false);
  });
});
