/**
 * 將路由參數與表單文字收斂成可安全使用的字串。
 *
 * 路由的 component input 在參數不存在時會收到 undefined；表單資料也可能因為
 * 瀏覽器自動填入或未來的資料遷移而不符合靜態型別。所有需要 trim 的地方都先走
 * 這個邊界，避免單一髒值讓整個互動流程中斷。
 */
export function normalizeInvitationText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
