#!/usr/bin/env node
/**
 * 作品集 v0.1 — 零依赖构建脚本
 *
 * 职责：
 *   1. 读 data/projects.json，渲染作品卡片，注入 portfolio.html 的
 *      <!-- PROJECTS:START --> … <!-- PROJECTS:END --> 之间；
 *      同时注入精选区 <!-- FEATURED:START --> … <!-- FEATURED:END -->。
 *      每张卡片整块是一个 <a>，指向 work/<slug>.html（详情页）。
 *   2. 同一份数据里 featured: true 的前三条，再以入口页的紧凑结构注入
 *      index.html 的 <!-- FEATURED:START --> … <!-- FEATURED:END -->；
 *      这样 file:// / 无 JS 时看到的是构建时的正确内容，HTTP 下
 *      js/orbital.js 还会按 JSON 再校一次。
 *   3. 读 data/numbers.json，渲染口径总表行，注入
 *      <!-- NUMBERS:START --> … <!-- NUMBERS:END --> 之间。
 *   4. 打印渲染结果。
 *
 * 只用 Node 内置模块，不装任何包。
 * 用法：node assets/build.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORTFOLIO = join(ROOT, 'portfolio.html');
const INDEX = join(ROOT, 'index.html');
const PROJECTS = join(ROOT, 'data', 'projects.json');
const NUMBERS = join(ROOT, 'data', 'numbers.json');

const TYPES = ['技术', '产品', '商业', '服务'];

/* --------------------------------------------------------------------------
   项目来路（分类）。
   data/projects.json 里没有 category 字段，这里用 slug 归组并在构建时校验：
   每个项目必须且只能落进一个分类，否则构建失败——避免入口页和筛选器各说各话。
   顺序即入口页与筛选器的显示顺序；「全部」由构建时补项目数。
   -------------------------------------------------------------------------- */
const CATEGORIES = [
  {
    id: 'all',
    name: '全部',
    desc: '六个项目，四种来路。把反复判断的事交给机器，并留下能复算的痕迹。',
    slugs: null
  },
  {
    id: 'intern',
    name: '实习交付',
    desc: '在真实工位上交付，同事每天在用的工具。',
    slugs: ['price-patrol', 'cs-quality']
  },
  {
    id: 'business',
    name: '商业实践',
    desc: '自己开店、分销、定价、售后，全流程走一遍。',
    slugs: ['pdd-store', 'gym-bd']
  },
  {
    id: 'product',
    name: '个人产品',
    desc: '从产品定义到公网部署，一个人做完。',
    slugs: ['jianhe']
  },
  {
    id: 'public',
    name: '公益项目',
    desc: '不收费的交付，流程要能被别人接手。',
    slugs: ['weiguang']
  }
];

/* 静态文案里的中文数字，跟着 data 走，避免项目计数这类手写字样过期 */
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function cnNumber(value) {
  if (value < 10) { return CN_NUM[value]; }
  if (value === 10) { return '十'; }
  if (value < 20) { return `十${CN_NUM[value % 10]}`; }
  return `${CN_NUM[Math.floor(value / 10)]}十${value % 10 ? CN_NUM[value % 10] : ''}`;
}

const MARK_STYLES = {
  实测: { cls: 'mark--measured', hint: '有日志、后台导出或可复算的记录' },
  估算: { cls: 'mark--estimated', hint: '基数可查、假设写明的推导值' },
  推算: { cls: 'mark--inferred', hint: '由已有口径推导，未逐项核对' },
  待核实: { cls: 'mark--pending', hint: '来源互斥或缺失，暂不作为结论' }
};

/* 入口页的深色口径标记：类名与 orbital.js 运行时渲染保持一致 */
const SPACE_MARKS = {
  实测: 'space-mark--measured',
  估算: 'space-mark--estimated',
  推算: 'space-mark--inferred',
  待核实: 'space-mark--pending'
};

const esc = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`读取失败：${file}`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
};

/* --------------------------------------------------------------------------
   口径标记：形态区分，单一强调色
   -------------------------------------------------------------------------- */
function renderMark(mark, note) {
  const style = MARK_STYLES[mark];
  if (!style) {
    throw new Error(`未知口径标记「${mark}」，只允许 ${Object.keys(MARK_STYLES).join(' / ')}`);
  }
  const title = note ? `${mark} · ${note}` : `${mark} · ${style.hint}`;
  return `<span class="mark ${style.cls}" title="${esc(title)}">${esc(mark)}</span>`;
}

/* --------------------------------------------------------------------------
   数据校验：宁可在构建时炸掉，也不要静默生成半成品
   -------------------------------------------------------------------------- */
function validateProjects(projects) {
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error('data/projects.json 必须是非空数组');
  }

  const required = [
    'slug', 'title', 'alias', 'type', 'year', 'scene',
    'status', 'oneliner', 'roleWhat', 'roleWhatNot', 'metrics'
  ];

  projects.forEach((project, index) => {
    const where = `projects[${index}]${project.slug ? ` (${project.slug})` : ''}`;

    required.forEach((field) => {
      if (project[field] === undefined || project[field] === null || project[field] === '') {
        throw new Error(`${where} 缺少字段「${field}」`);
      }
    });

    if (!TYPES.includes(project.type)) {
      throw new Error(`${where} 的 type 必须是：${TYPES.join(' / ')}`);
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(project.slug)) {
      throw new Error(`${where} 的 slug 只能用小写字母、数字和连字符，且不能以连字符开头`);
    }

    if (!Array.isArray(project.metrics) || project.metrics.length === 0) {
      throw new Error(`${where} 至少需要一个指标`);
    }

    project.metrics.forEach((metric, metricIndex) => {
      if (!metric.value || !metric.label) {
        throw new Error(`${where}.metrics[${metricIndex}] 需要 value 与 label`);
      }
      if (!MARK_STYLES[metric.mark]) {
        throw new Error(
          `${where}.metrics[${metricIndex}] 的 mark 必须是：${Object.keys(MARK_STYLES).join(' / ')}`
        );
      }
    });
  });
}

/* --------------------------------------------------------------------------
   分类：校验 + slug → 分类名（渲染期用）
   -------------------------------------------------------------------------- */
function resolveCategoryMap(projects) {
  const bySlug = new Map(projects.map((project) => [project.slug, project]));
  const seen = new Map();

  CATEGORIES.filter((category) => category.slugs).forEach((category) => {
    category.slugs.forEach((slug) => {
      if (!bySlug.has(slug)) {
        throw new Error(`分类「${category.name}」里的 slug「${slug}」在 data/projects.json 里不存在`);
      }
      if (seen.has(slug)) {
        throw new Error(`项目「${slug}」同时被分到「${seen.get(slug)}」和「${category.name}」`);
      }
      seen.set(slug, category.name);
    });
  });

  projects.forEach((project) => {
    if (!seen.has(project.slug)) {
      throw new Error(`项目「${project.slug}」没有归入任何分类，请在 assets/build.mjs 的 CATEGORIES 里补上`);
    }
  });

  return seen;
}

/* --------------------------------------------------------------------------
   作品卡片
   -------------------------------------------------------------------------- */
function renderCard(project, index, total, options = {}) {
  const lead = Boolean(options.lead);
  const category = options.category || '';
  const variant = (index % 7) + 1;
  const number = String(index + 1).padStart(2, '0');
  const classes = ['card', 'reveal', 'card--dark'];
  if (lead) { classes.push('card--lead'); }

  const metrics = project.metrics.map((metric) => {
    return [
      '              <li class="metric">',
      `                <span class="metric__value">${esc(metric.value)}${renderMark(metric.mark, metric.note)}</span>`,
      `                <span class="metric__label">${esc(metric.label)}</span>`,
      '              </li>'
    ].join('\n');
  }).join('\n');

  // 整张卡片就是一个链接：外层用 <a>，内层仍是 .card__body 等现有结构。
  // 筛选依赖 .card[data-type]，类名不变；href 只在构建时生成。
  const href = `work/${project.slug}.html`;

  return [
    `        <a class="${classes.join(' ')}" href="${esc(href)}" data-type="${esc(project.type)}" data-cat="${esc(category)}" data-slug="${esc(project.slug)}" aria-label="查看项目案例：${esc(project.title)}">`,
    `          <div class="plate plate--v${variant}">`,
    '            <span class="plate__cap">截图占位 · 待替换</span>',
    '          </div>',
    '          <div class="card__body">',
    '            <div class="card__top">',
    `              <span class="card__no">${number} / ${String(total).padStart(2, '0')}</span>`,
    `              <span class="card__type">${esc(project.type)} · ${esc(project.scene)}</span>`,
    `              <span class="card__year">${esc(project.year)}</span>`,
    '            </div>',
    `            <h3 class="card__title">${esc(project.title)}</h3>`,
    `            <p class="card__alias">${esc(project.alias)}</p>`,
    `            <p class="card__oneliner">${esc(project.oneliner)}</p>`,
    '            <ul class="metrics">',
    metrics,
    '            </ul>',
    '            <dl class="role">',
    `              <div><dt>做了什么</dt><dd>${esc(project.roleWhat)}</dd></div>`,
    `              <div><dt>没做什么</dt><dd>${esc(project.roleWhatNot)}</dd></div>`,
    '            </dl>',
    '            <div class="card__foot">',
    `              <span class="card__status">${esc(project.status)}</span>`,
    '              <span class="card__go">查看案例 <span aria-hidden="true">→</span></span>',
    '            </div>',
    '          </div>',
    '        </a>'
  ].join('\n');
}

/* --------------------------------------------------------------------------
   入口页精选三条：与 js/orbital.js 的 renderProject 输出保持一致
   -------------------------------------------------------------------------- */
function renderSpaceProject(project, index) {
  const number = String(index + 1).padStart(2, '0');

  const metrics = project.metrics.slice(0, 3).map((metric) => {
    const title = metric.mark + (metric.note ? ` · ${metric.note}` : '');
    return [
      '                <li class="space-metric">',
      `                  <span class="space-metric__value">${esc(metric.value)}<span class="space-mark ${SPACE_MARKS[metric.mark]}" title="${esc(title)}">${esc(metric.mark)}</span></span>`,
      `                  <span class="space-metric__label">${esc(metric.label)}</span>`,
      '                </li>'
    ].join('\n');
  }).join('\n');

  return [
    '          <article class="space-project">',
    `            <p class="space-project__no">${number}</p>`,
    '            <div>',
    `              <h3 class="space-project__title"><a href="work/${esc(project.slug)}.html">${esc(project.title)}</a></h3>`,
    `              <p class="space-project__line">${esc(project.oneliner)}</p>`,
    '              <ul class="space-metrics">',
    metrics,
    '              </ul>',
    '            </div>',
    '          </article>'
  ].join('\n');
}

/* --------------------------------------------------------------------------
   分类入口：作品集筛选器（按钮，data-filter 与 app.js 约定）
   -------------------------------------------------------------------------- */
function renderCatnav(projects, categoryOf) {
  return CATEGORIES.map((category) => {
    const count = category.slugs ? category.slugs.length : projects.length;
    const pressed = category.id === 'all' ? 'true' : 'false';
    return [
      `          <button class="catnav__item" type="button" data-filter="${esc(category.name)}" aria-pressed="${pressed}">`,
      `            <span class="catnav__name">${esc(category.name)}</span>`,
      `            <span class="catnav__count">${count} 个</span>`,
      `            <span class="catnav__desc">${esc(category.desc)}</span>`,
      '            <span class="catnav__go" aria-hidden="true">→</span>',
      '          </button>'
    ].join('\n');
  }).join('\n');
}

/* 入口页面板里的分类：直接跳到作品集并带上筛选参数 */
function renderSpaceCats(projects, categoryOf) {
  return CATEGORIES.map((category) => {
    const count = category.slugs ? category.slugs.length : projects.length;
    const isAll = !category.slugs;
    const href = isAll
      ? 'portfolio.html#work'
      : `portfolio.html?filter=${encodeURIComponent(category.name)}#work`;
    return [
      `          <a class="space-cat${isAll ? ' space-cat--all' : ''}" href="${esc(href)}">`,
      `            <span class="space-cat__name">${esc(category.name)}</span>`,
      `            <span class="space-cat__count">${count} 个</span>`,
      `            <span class="space-cat__desc">${esc(category.desc)}</span>`,
      '            <span class="space-cat__go" aria-hidden="true">→</span>',
      '          </a>'
    ].join('\n');
  }).join('\n');
}

/* 入口首屏底部的一行快捷入口：不进面板也能按来路跳 */
function renderGateCats() {
  return CATEGORIES.filter((category) => category.slugs).map((category) => {
    const href = `portfolio.html?filter=${encodeURIComponent(category.name)}#work`;
    return [
      `            <a href="${esc(href)}">`,
      `              <span>${esc(category.name)}</span>`,
      `              <span class="space-gate__cats-n">${category.slugs.length}</span>`,
      '            </a>'
    ].join('\n');
  }).join('\n');
}

/* 精选三件：作品集页顶部的索引条，不重复正文卡片 */
function renderPicks(featured, projects, categoryOf) {
  return featured.slice(0, 3).map((project) => {
    const index = projects.indexOf(project);
    const number = String(index + 1).padStart(2, '0');
    const shortTitle = project.title.replace(/（[^）]*）/g, '').trim();
    return [
      `          <a class="pick" href="work/${esc(project.slug)}.html" title="${esc(project.title)}">`,
      `            <span class="pick__no">${number}</span>`,
      `            <span class="pick__title">${esc(shortTitle)}</span>`,
      `            <span class="pick__cat">${esc(categoryOf.get(project.slug) || '')}</span>`,
      '            <span class="pick__go" aria-hidden="true">→</span>',
      '          </a>'
    ].join('\n');
  }).join('\n');
}

/* --------------------------------------------------------------------------
   口径总表行
   -------------------------------------------------------------------------- */
function renderNumberRow(entry) {
  return [
    '              <tr>',
    `                <td data-label="数字">${esc(entry.value)} ${renderMark(entry.mark, entry.caliber)}</td>`,
    `                <td data-label="口径">${esc(entry.caliber)}</td>`,
    `                <td data-label="时间窗">${esc(entry.window)}</td>`,
    `                <td data-label="来源">${esc(entry.source)}</td>`,
    '              </tr>'
  ].join('\n');
}

/* --------------------------------------------------------------------------
   注入
   -------------------------------------------------------------------------- */
function inject(html, name, block, file = 'portfolio.html') {
  const pattern = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!pattern.test(html)) {
    throw new Error(`${file} 里找不到 ${name} 的注入标记`);
  }
  return html.replace(pattern, (_match, start, end) => `${start}\n${block}\n${end}`);
}

/* 注入区之外的静态计数：匹配不到就报错，避免静默留下过期文案 */
function replaceStatic(html, pattern, block, label) {
  if (!pattern.test(html)) {
    throw new Error(`portfolio.html 里找不到${label}`);
  }
  return html.replace(pattern, block);
}

/* --------------------------------------------------------------------------
   深色外壳：作品集页是构建产物，导航 / 页脚 / 章节类名也由构建保证
   全部替换都幂等，连续跑两次结果一致。
   -------------------------------------------------------------------------- */
const NIGHT_NAV = [
  '      <div class="nav__links">',
  '        <a class="nav__link" href="index.html">首页</a>',
  '        <a class="nav__link" href="#work" data-spy="work all" aria-current="page">作品</a>',
  '        <a class="nav__link" href="method.html">方法</a>',
  '        <a class="nav__link" href="resume.html">简历</a>',
  '        <a class="nav__link" href="#about" data-spy="about">关于</a>',
  '        <a class="nav__link" href="#contact" data-spy="contact">联系</a>',
  '      </div>'
].join('\n');

const NIGHT_FOOTER = [
  '      <div class="footer__bottom">',
  '        <span>黄启康 · <a href="tel:15976479396">15976479396</a> · <a href="mailto:2856174805@qq.com">2856174805@qq.com</a> · <a href="https://github.com/big-niuNiu929" target="_blank" rel="noopener">github.com/big-niuNiu929</a></span>',
  '        <span>本站由手写 HTML/CSS 构建，无框架无构建工具 · 数字口径见 <a href="method.html">方法页</a></span>',
  '      </div>'
].join('\n');

function patchShell(html) {
  html = html.replace(
    /<meta name="theme-color" content="#[0-9A-Fa-f]{6}">/,
    '<meta name="theme-color" content="#05080E">'
  );

  if (!html.includes('site-stars')) {
    html = html.replace(
      /<body>/,
      '<body>\n  <div class="site-stars" aria-hidden="true"></div>'
    );
  }

  html = html.replace(
    /^[ \t]*<a class="nav__brand"[^>]*>[\s\S]*?<\/a>/m,
    '      <a class="nav__brand" href="index.html"><span class="nav__brand-mark" aria-hidden="true"></span>作品集 2026</a>'
  );

  html = html.replace(
    /^[ \t]*<div class="nav__links">[\s\S]*?<\/div>/m,
    NIGHT_NAV
  );

  html = html.replace(
    /<div class="sec-head">/g,
    '<div class="sec-head sec-head--dark">'
  );

  html = html.replace(
    /<div class="allgrid">/g,
    '<div class="allgrid allgrid--dark">'
  );

  html = html.replace(
    /<div class="featured">/g,
    '<div class="featured featured--dark">'
  );

  html = html.replace(
    /^[ \t]*<div class="footer__bottom">[\s\S]*?<\/div>/m,
    NIGHT_FOOTER
  );

  return html;
}

/* --------------------------------------------------------------------------
   主流程
   -------------------------------------------------------------------------- */
try {
  const projects = readJson(PROJECTS);
  const numbers = readJson(NUMBERS);

  validateProjects(projects);

  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error('data/numbers.json 必须是非空数组');
  }

  numbers.forEach((entry, index) => {
    ['value', 'mark', 'caliber', 'window', 'source'].forEach((field) => {
      if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
        throw new Error(`numbers[${index}] 缺少字段「${field}」`);
      }
    });
    if (!MARK_STYLES[entry.mark]) {
      throw new Error(`numbers[${index}] 的 mark 必须是：${Object.keys(MARK_STYLES).join(' / ')}`);
    }
  });

  const total = projects.length;
  const featured = projects.filter((project) => project.featured === true);
  const categoryOf = resolveCategoryMap(projects);
  const categoryCount = CATEGORIES.filter((category) => category.slugs).length;

  if (featured.length === 0) {
    throw new Error('至少需要一个 featured: true 的项目用来渲染精选区');
  }

  const projectsHtml = projects.map((project, index) => {
    return renderCard(project, index, total, {
      category: categoryOf.get(project.slug)
    });
  }).join('\n\n');

  const picksHtml = renderPicks(featured, projects, categoryOf);
  const catnavHtml = renderCatnav(projects, categoryOf);
  const numbersHtml = numbers.map(renderNumberRow).join('\n');
  const spaceFeaturedHtml = featured.slice(0, 3)
    .map((project, index) => renderSpaceProject(project, index))
    .join('\n\n');
  const spaceCatsHtml = renderSpaceCats(projects, categoryOf);

  let html = readFileSync(PORTFOLIO, 'utf8');
  html = inject(html, 'FEATURED', picksHtml);
  html = inject(html, 'CATNAV', catnavHtml);
  html = inject(html, 'PROJECTS', projectsHtml);
  html = inject(html, 'NUMBERS', numbersHtml);

  // 注入区之外的静态文案，同样按 data 同步，避免项目增减后说过期数字。
  html = replaceStatic(
    html,
    /(<h2 class="sec-title" id="all-title">)[\s\S]*?(<\/h2>)/,
    `$1${cnNumber(total)}个项目，${cnNumber(categoryCount)}类来路。$2`,
    '全部作品标题'
  );
  html = replaceStatic(
    html,
    /(<p class="indexbar__count" id="filter-count"[^>]*>)[\s\S]*?(<\/p>)/,
    `$1${total} / ${total} 个项目$2`,
    '筛选项计数'
  );

  html = patchShell(html);

  writeFileSync(PORTFOLIO, html, 'utf8');

  let indexHtml = readFileSync(INDEX, 'utf8');
  indexHtml = inject(indexHtml, 'FEATURED', spaceFeaturedHtml, 'index.html');
  indexHtml = inject(indexHtml, 'CATEGORIES', spaceCatsHtml, 'index.html');
  indexHtml = inject(indexHtml, 'GATECATS', renderGateCats(), 'index.html');
  indexHtml = replaceStatic(
    indexHtml,
    /(<p class="space-panel__label" id="space-project-count">)[\s\S]*?(<\/p>)/,
    `$1${String(total).padStart(2, '0')} projects$2`,
    '入口页面板项目数'
  );
  writeFileSync(INDEX, indexHtml, 'utf8');

  console.log(`渲染完成 → ${PORTFOLIO}`);
  console.log(`          → ${INDEX}（精选 ${Math.min(featured.length, 3)} 条）`);
  console.log(`  项目 ${total} 个（精选 ${featured.length} 个）`);
  console.log(`  口径记录 ${numbers.length} 条`);
  console.log('  改动 data/*.json 后重新运行：node assets/build.mjs');
} catch (error) {
  console.error(`构建失败：${error.message}`);
  process.exit(1);
}
