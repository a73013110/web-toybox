import type {
  ActivityOption,
  DeclineReaction,
  InvitationModel,
  TimingOption
} from './invitation-card.types';

export const TIMING_OPTIONS: readonly TimingOption[] = [
  { value: '突然有空就走', index: '01', title: '突然有空就走', hint: '不問原因，先離開工作現場。' },
  { value: '提前三天通知', index: '02', title: '提前三天通知', hint: '給行事曆一點心理準備。' },
  { value: '深夜限定', index: '03', title: '深夜限定', hint: '白天屬於生活，晚上才屬於我們。' },
  { value: '看到訊息再說', index: '04', title: '看到訊息再說', hint: '一切取決於當時的電量。' },
  {
    value: '交給命運安排',
    index: '05',
    title: '交給命運安排',
    hint: '同時有空的那天，就是黃道吉日。'
  }
];

export const ACTIVITY_OPTIONS: readonly ActivityOption[] = [
  {
    key: 'meal',
    label: '用餐',
    hint: '先研究菜單，最後還是點招牌。',
    paths: [
      'M7 2v6a2 2 0 0 0 2 2v12M7 2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2M17 2c-2 0-3 2-3 5v3c0 1.5 1 2 2 2v10'
    ]
  },
  {
    key: 'walk',
    label: '散步',
    hint: '走著走著，也許就不想回家。',
    paths: [
      'M13 5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 9l-2 5-4 2M10 9l4 3 4-1M8 14l3 2-1 6M11 16l4 6'
    ]
  },
  {
    key: 'yourCall',
    label: '由妳安排',
    hint: '我負責準時出現，驚喜交給妳。',
    paths: [
      'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8'
    ]
  },
  {
    key: 'lateNight',
    label: '深夜暢談',
    hint: '手機翻面，聊到城市慢慢安靜。',
    paths: ['M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z', 'M9 12h.01M13 12h.01M17 12h.01']
  },
  {
    key: 'secrets',
    label: '交換心事',
    hint: '一人一個秘密，先從不尷尬的開始。',
    paths: [
      'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z'
    ]
  },
  {
    key: 'future',
    label: '未來藍圖',
    hint: '不急著定答案，先把想像攤開聊。',
    paths: ['M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6', 'M17 4h4v4']
  }
];

export const CUSTOM_ACTIVITY_ICON = 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z';

/** 按下「先不要」時依序出現，用完就停手，不再無限鬧下去。 */
export const DECLINE_REACTIONS: readonly DeclineReaction[] = [
  { message: '再考慮一下嘛，飲料我請', label: '你確定？' },
  { message: '這可能只是你的手滑了一下', label: '剛剛不算' },
  { message: '拒絕鍵開始懷疑自己的存在', label: '再想三秒' },
  { message: '它正在嘗試低調離開現場', label: '怎麼還在' },
  { message: '好啦，不勉強。邀請會一直保留', label: '本按鈕已下班' }
];

/** 送出過場時循環播放的等待文字。 */
export const CONFIRMATION_REACTIONS: readonly string[] = [
  '先把工作行程請到旁邊坐。',
  '正在和臨時加班進行和平談判…',
  '檢查放鳥罰則是否具有嚇阻力…',
  '最後替這次出門蓋個章。'
];

export const DEFAULT_SUB_TEXT = '誠摯邀請，共度一段時光';
export const DEFAULT_DECLINE_LABEL = '先不要';

/** 送出很快時仍讓過場走完，避免畫面一閃而過。 */
export const MIN_CONFIRMATION_MS = 1900;

/** 姓名與自訂活動的長度上限，與 Apps Script 端一致。 */
export const MAX_NAME_LENGTH = 40;
export const MAX_CUSTOM_ACTIVITY_LENGTH = 50;

/** 空白的表單 model。restart 時也用同一份，確保沒有殘留欄位。 */
export function createInvitationModel(): InvitationModel {
  return {
    inviteeName: '',
    timing: '',
    activities: {
      meal: false,
      walk: false,
      yourCall: false,
      lateNight: false,
      secrets: false,
      future: false
    },
    customEnabled: false,
    customActivity: ''
  };
}
