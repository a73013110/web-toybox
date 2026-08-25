import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { setPageMeta } from '@core/seo/page-meta';

import { ProjectCard } from './project-card';
import { PUBLISHED_PROJECTS } from './projects.data';

@Component({
  selector: 'app-home',
  imports: [RouterLink, ProjectCard],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
  /* 靜態資料，執行期不會變動，因此不需要包成 signal。 */
  protected readonly projects = PUBLISHED_PROJECTS;

  constructor() {
    setPageMeta({
      title: 'Web Toybox — 網頁玩具箱',
      description: '收集輕量、好玩又能直接在瀏覽器開啟的網頁小作品。'
    });
  }
}
