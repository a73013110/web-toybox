/*
 * 活動選項的鍵。用英文鍵當 model 欄位名，送到後端的才是中文標籤，
 * 這樣改文案不會動到表單結構。
 */
export const ACTIVITY_KEYS = [
  'meal',
  'walk',
  'yourCall',
  'lateNight',
  'secrets',
  'future'
] as const;

export type ActivityKey = (typeof ACTIVITY_KEYS)[number];

/** 每個活動是否被勾選。刻意用固定鍵的物件而非陣列，讓 [formField] 能逐項綁定。 */
export type ActivitySelection = Record<ActivityKey, boolean>;

/** Signal Forms 的唯一資料源。 */
export interface InvitationModel {
  inviteeName: string;
  timing: string;
  activities: ActivitySelection;
  /** 是否勾選「自己填寫」。 */
  customEnabled: boolean;
  customActivity: string;
}

export interface TimingOption {
  /** 送到後端的值，同時也是 radio 的 value。 */
  readonly value: string;
  /** 卡片左側的序號。 */
  readonly index: string;
  readonly title: string;
  readonly hint: string;
}

export interface ActivityOption {
  readonly key: ActivityKey;
  /** 送到後端的標籤。 */
  readonly label: string;
  readonly hint: string;
  /** SVG path 的 d 屬性，可能不只一段。 */
  readonly paths: readonly string[];
}

/** 按下「先不要」時依序出現的反應。 */
export interface DeclineReaction {
  readonly message: string;
  readonly label: string;
}

/** 送給 Apps Script 的內容。 */
export interface InvitationSubmission {
  readonly inviteeName: string;
  readonly declineCount: number;
  readonly timing: string;
  readonly activities: readonly string[];
  readonly page: string;
}
