import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { setPageMeta } from '@core/seo/page-meta';

@Component({
  selector: 'app-invitation-card',
  imports: [RouterLink],
  templateUrl: './invitation-card.html',
  styleUrl: './invitation-card.css'
})
export class InvitationCard {
  constructor() {
    setPageMeta({
      title: 'Invitation Card — Web Toybox',
      description: '五步驟互動邀請卡，結果寫入 Google Sheet。'
    });
  }
}
