/*
 * 作品清單的型別。slug 同時是路由路徑的最後一段，與 app.routes.ts 的路由對應。
 */
export interface Project {
  /** 對應路由 /pages/<slug>，也是 prerender 產物的目錄名。 */
  readonly slug: string;
  /** 卡片上方的英文分類標籤。 */
  readonly type: string;
  readonly title: string;
  /** 一到兩句話的說明。 */
  readonly summary: string;
  /** 設為 true 時不出現在首頁目錄，但頁面仍可直接開啟。 */
  readonly draft?: boolean;
}
