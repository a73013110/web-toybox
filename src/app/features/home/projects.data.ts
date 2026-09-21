import type { Project } from './projects.types';

/*
 * 作品清單。新增作品時要動兩個地方：這裡（首頁卡片與件數）與 app.routes.ts（路由）。
 * prerender 會自動探索靜態路由，不需要第三份清單。
 *
 * 陣列順序就是首頁的顯示順序，編號自動產生。
 */
const PROJECTS: readonly Project[] = [
  {
    slug: 'invitation-card',
    type: 'INTERACTIVE CARD',
    title: 'Invitation Card',
    summary: '用五個小步驟，完成一張專屬的約會邀請。包含日期、活動選擇與行程確認。'
  },
  {
    slug: 'deep-talk',
    type: 'CONVERSATION DECK',
    title: 'Deep Talk',
    summary:
      '挑好關係、深度與想聊的主題，抽一疊由淺入深的問題。熱門度由真實使用者投票決定，不是誰猜的。'
  },
  {
    slug: 'ichiban',
    type: 'FINITE LOTTERY',
    title: '一番賞模擬器',
    summary: '建立有限賞池，以不放回抽樣抽票；每一張被抽走後，下一抽與批次命中率都會即時改變。'
  }
];

/** 首頁顯示的作品。draft 的作品仍可直接開網址，只是不出現在目錄。 */
export const PUBLISHED_PROJECTS: readonly Project[] = PROJECTS.filter((project) => !project.draft);
