import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Project } from './projects.types';

@Component({
  selector: 'app-project-card',
  imports: [RouterLink],
  styleUrl: './project-card.css',
  template: `
    <article class="project-card">
      <div class="project-number" aria-hidden="true">{{ paddedIndex() }}</div>
      <div class="project-details">
        <p class="project-type">{{ project().type }}</p>
        <h3>{{ project().title }}</h3>
        <p class="project-summary">{{ project().summary }}</p>
      </div>
      <a
        class="project-link"
        [routerLink]="['/pages', project().slug]"
        [attr.aria-label]="'開始體驗 ' + project().title"
      >
        開始體驗
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </a>
    </article>
  `
})
export class ProjectCard {
  readonly project = input.required<Project>();
  /** 顯示用的序號，從 1 開始。 */
  readonly index = input.required<number>();

  protected readonly paddedIndex = computed(() => String(this.index()).padStart(2, '0'));
}
