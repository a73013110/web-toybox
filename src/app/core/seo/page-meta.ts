import { inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

/*
 * 設定單一頁面的 <title> 與 <meta name="description">。
 *
 * ⚠️ 必須在 injection context 內呼叫（元件的欄位初始化或 constructor），
 * 讓它在 render 期間執行，prerender 才會把結果序列化進 dist 的 HTML。
 * 若改放進 afterNextRender()，本機 ng serve 看起來完全正常，
 * 但 build 產物會沒有 meta，分享預覽會全部退回首頁的內容。
 */
export function setPageMeta(meta: { readonly title: string; readonly description: string }): void {
  inject(Title).setTitle(meta.title);
  inject(Meta).updateTag({ name: 'description', content: meta.description });
}
