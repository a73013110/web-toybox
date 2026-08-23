import { publishedProjects } from '../shared/projects.js';

const list = document.getElementById('projectList');
const template = document.getElementById('projectCardTemplate');
const countLabel = document.getElementById('projectCount');
const projects = publishedProjects();

// 用 <template> 複製標記、再以 textContent 填值，
// 讓卡片結構留在 HTML，也避免作品文案被當成 HTML 解析。
const cards = projects.map((project, index) => {
  const card = template.content.firstElementChild.cloneNode(true);
  const link = card.querySelector('.project-link');

  card.querySelector('.project-number').textContent = String(index + 1).padStart(2, '0');
  card.querySelector('.project-type').textContent = project.type;
  card.querySelector('.project-title').textContent = project.title;
  card.querySelector('.project-summary').textContent = project.summary;
  link.href = `./pages/${project.slug}/`;
  link.setAttribute('aria-label', `開始體驗 ${project.title}`);

  return card;
});

list.replaceChildren(...cards);
countLabel.textContent = `${projects.length} 件作品`;
