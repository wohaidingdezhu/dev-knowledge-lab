import type { Card } from './types'

export const PITFALL_TEMPLATE = `## 现象

发生了什么？写下实际结果、预期结果与复现步骤。

## 原因

问题出在哪里？记录排查过程与关键线索。

## 解决方法

如何修复？在右侧实验室保存一份最小可运行示例。

## 下次注意

- 如何避免再次踩坑？
`

export function makeSeedCards(now = new Date().toISOString()): Card[] {
  const base = { createdAt: now, updatedAt: now, revision: 1 }
  return [
    {
      ...base,
      id: 'welcome-css-grid',
      title: 'Grid：让卡片布局自己适应宽度',
      tags: ['CSS', '布局'],
      source:
        'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout',
      body: `## 一个值得记住的布局配方

用 \`repeat(auto-fit, minmax(...))\` 让列数随容器宽度变化。无需为每种设备写断点。

\`\`\`css
grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
\`\`\`

### 为什么再加一层 min？

\`min(100%, 140px)\` 可以避免容器比最小列宽更窄时产生横向溢出。

### 动手试试

点击 **运行代码**，再拖动浏览器宽度。把示例中的 \`140px\` 改成 \`180px\`，观察列数变化。

> 这是一张可以随意编辑或删除的示例卡片。所有修改仅保存在当前浏览器。`,
      html: `<main>\n  <span class="eyebrow">CSS EXPLORER</span>\n  <h1>空间，交给 Grid。</h1>\n  <div class="grid">\n    <article><b>01</b><h2>记录</h2><p>留下有用的发现。</p></article>\n    <article><b>02</b><h2>实验</h2><p>让想法运行起来。</p></article>\n    <article><b>03</b><h2>积累</h2><p>搭建自己的工具箱。</p></article>\n  </div>\n</main>`,
      css: `* { box-sizing: border-box; }\nbody { margin: 0; padding: 28px; background: #f5f6f8; color: #263345; font-family: system-ui, sans-serif; }\nmain { max-width: 720px; margin: auto; }\n.eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .18em; color: #6479dd; }\nh1 { font-size: 26px; margin: 12px 0 24px; }\n.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr)); gap: 12px; }\narticle { padding: 20px; border: 1px solid #e1e4ec; border-radius: 14px; background: white; }\nb { color: #6479dd; font-size: 12px; }\nh2 { font-size: 17px; }\np { font-size: 12px; color: #788293; }`,
      js: `const cards = document.querySelectorAll('article');\nconsole.log('Grid 已准备好，共', cards.length, '张卡片。');`,
    },
    {
      ...base,
      id: 'welcome-event-delegation',
      title: '事件委托：给动态列表只绑一次事件',
      tags: ['JavaScript', 'DOM'],
      source:
        'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling',
      body: `## 现象

列表新增了一项，但新按钮点了没有反应。原来只在初始化时给已有按钮绑定了监听器。

## 原因

新增的 DOM 不会自动继承其他节点的事件监听器。

## 解决方法

把监听器绑定在稳定存在的父节点上，再用 \`event.target.closest('button')\` 找到实际按钮。利用**事件冒泡**，动态添加的按钮也能响应。

## 下次注意

- 用 \`closest\`，点击按钮内部的图标或文字也能正确识别。
- 检查目标是否仍在当前容器内。
- 不会冒泡的事件需要单独考虑。`,
      html: `<main>\n  <h1>今天的小目标</h1>\n  <p>点击任意一项，标记完成。</p>\n  <div id="tasks">\n    <button>读一段好代码 <span>↗</span></button>\n    <button>解决一个小问题 <span>↗</span></button>\n  </div>\n  <button id="add">＋ 添加一个目标</button>\n</main>`,
      css: `body { font-family: system-ui, sans-serif; background: #f5f6f8; color: #263345; padding: 24px; }\nmain { max-width: 340px; margin: auto; }\nh1 { font-size: 24px; }\np { color: #7a8494; font-size: 13px; }\nbutton { display: flex; justify-content: space-between; width: 100%; border: 1px solid #e0e4ec; border-radius: 10px; background: white; color: #344154; padding: 14px; margin: 10px 0; cursor: pointer; font: inherit; font-size: 13px; }\nbutton.done { background: #eef1ff; color: #6379dd; text-decoration: line-through; }\n#add { background: transparent; border-style: dashed; color: #6379dd; justify-content: center; }`,
      js: `const tasks = document.querySelector('#tasks');\nlet count = 0;\n\ntasks.addEventListener('click', (event) => {\n  const button = event.target.closest('button');\n  if (!button || !tasks.contains(button)) return;\n  button.classList.toggle('done');\n  console.log('目标状态：', button.textContent.trim());\n});\n\ndocument.querySelector('#add').addEventListener('click', () => {\n  const button = document.createElement('button');\n  button.textContent = '新目标 ' + ++count + ' ↗';\n  tasks.append(button);\n});`,
    },
    {
      ...base,
      id: 'welcome-array-map',
      title: '数组转换：用 map 保持原始数据不变',
      tags: ['JavaScript', '数据处理'],
      source:
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
      body: `## 把转换写成一个清晰的步骤

\`map\` 根据已有数组产生一个新数组，适合“每一项变成另一种形状”的任务。

\`\`\`js
const labels = items.map(item => item.name);
\`\`\`

### 一个容易忽略的细节

返回新数组并不等于深拷贝。如果在回调中直接修改对象，原来的对象仍会改变。

\`\`\`js
// 使用展开语法返回新对象
const next = items.map(item => ({ ...item, done: true }));
\`\`\`

### 在实验室里验证

右侧示例为每本书计算阅读进度。修改已读页数，运行后观察结果与控制台记录。`,
      html: `<main>\n  <small>READING NOTES</small>\n  <h1>把一点点，变成进步。</h1>\n  <div id="books"></div>\n</main>`,
      css: `body { font-family: system-ui, sans-serif; background: #f7f8fa; color: #263345; padding: 26px; }\nmain { max-width: 430px; margin: auto; }\nsmall { letter-spacing: .15em; color: #6479dd; font-size: 10px; }\nh1 { font-size: 23px; margin-bottom: 28px; }\n.book { margin-bottom: 22px; }\n.label { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; }\n.label span { color: #6479dd; }\n.track { height: 6px; border-radius: 6px; background: #e5e8ef; overflow: hidden; }\n.fill { height: 100%; background: #6479dd; border-radius: inherit; }`,
      js: `const books = [\n  { name: 'JavaScript 语言精粹', read: 96, total: 160 },\n  { name: 'CSS 揭秘', read: 80, total: 400 },\n  { name: '重构', read: 150, total: 450 },\n];\n\nconst progress = books.map(book => ({\n  ...book,\n  percent: Math.round(book.read / book.total * 100),\n}));\n\nconst container = document.querySelector('#books');\nprogress.forEach(book => {\n  const row = document.createElement('div');\n  row.className = 'book';\n  const label = document.createElement('div');\n  label.className = 'label';\n  label.textContent = book.name;\n  const amount = document.createElement('span');\n  amount.textContent = book.percent + '%';\n  label.append(amount);\n  const track = document.createElement('div');\n  track.className = 'track';\n  const fill = document.createElement('div');\n  fill.className = 'fill';\n  fill.style.width = book.percent + '%';\n  track.append(fill);\n  row.append(label, track);\n  container.append(row);\n});\nconsole.log('转换结果：', progress);\nconsole.log('原数组没有 percent 属性：', !('percent' in books[0]));`,
    },
  ]
}
