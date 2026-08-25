import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ProjectCard } from './project-card';
import type { Project } from './projects.types';

const project: Project = {
  slug: 'deep-talk',
  type: 'CONVERSATION DECK',
  title: 'Deep Talk',
  summary: '抽一疊由淺入深的問題。'
};

/*
 * 元件測試的最小示範：用 componentRef.setInput() 餵 signal input，
 * 讀 nativeElement 驗證畫面。不必碰內部欄位，換掉實作也不會弄壞測試。
 */
describe('ProjectCard', () => {
  // routerLink 需要一個 router，路由表空的就夠了。
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  function render(index: number) {
    const fixture = TestBed.createComponent(ProjectCard);

    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('index', index);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  it('序號補成兩位數', () => {
    expect(render(2).querySelector('.project-number')?.textContent).toBe('02');
  });

  it('連結指向 /pages/<slug>，並帶上看得懂的無障礙標籤', () => {
    const link = render(1).querySelector('a.project-link');

    expect(link?.getAttribute('href')).toBe('/pages/deep-talk');
    expect(link?.getAttribute('aria-label')).toBe('開始體驗 Deep Talk');
  });

  it('index 改變時序號跟著更新', () => {
    const fixture = TestBed.createComponent(ProjectCard);

    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('index', 9);
    fixture.detectChanges();

    fixture.componentRef.setInput('index', 10);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.project-number')?.textContent
    ).toBe('10');
  });
});
