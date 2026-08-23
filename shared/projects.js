/*
 * 作品清單：新增作品時只需要在這裡加一筆，首頁卡片與計數會自動更新。
 *
 * slug     必填，對應 pages/<slug>/ 目錄名稱，也用來組出連結。
 * type     必填，卡片上方的英文分類標籤。
 * title    必填，作品名稱。
 * summary  必填，一到兩句話的說明。
 * draft    選填，設為 true 時不會出現在首頁目錄（但頁面仍可直接開啟）。
 *
 * 陣列順序就是首頁的顯示順序，編號會自動產生。
 */
export const PROJECTS = [
  {
    slug: 'invitation-card',
    type: 'INTERACTIVE CARD',
    title: 'Invitation Card',
    summary: '用五個小步驟，完成一張專屬的約會邀請。包含日期、活動選擇與行程確認。'
  }
];

export const publishedProjects = () => PROJECTS.filter((project) => !project.draft);
