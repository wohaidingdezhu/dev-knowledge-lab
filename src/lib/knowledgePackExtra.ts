import type { Card } from './types'

const demoStyle = `body{font-family:system-ui,sans-serif;padding:24px;background:#f6f7fb;color:#253149}main{max-width:520px;margin:auto}label{display:block;margin:12px 0 6px}input,button{font:inherit;padding:9px 12px;border:1px solid #aab4c4;border-radius:8px}input{max-width:100%;box-sizing:border-box}button{margin:6px 6px 6px 0;background:#6258bd;color:white;cursor:pointer}button:disabled{opacity:.6;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #b45b00;outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:14px;border-radius:8px}li{margin:8px 0}h1{font-size:22px}`

export const additionalLessons: Pick<
  Card,
  'id' | 'title' | 'tags' | 'source' | 'body' | 'html' | 'css' | 'js'
>[] = [
  {
    id: 'guide-js-debounce',
    title: '防抖：等输入停下来再处理一次',
    tags: ['JavaScript', '异步', '性能'],
    source: 'https://developer.mozilla.org/en-US/docs/Glossary/Debounce',
    body: `## 使用场景

搜索框连续输入时，每个字符都触发昂贵处理，会让界面变慢。尾沿防抖会取消上一次待执行的定时器，等最后一次输入后的等待期结束再运行。

## 核心写法

\`clearTimeout(timer)\` 取消旧任务，再用 \`setTimeout\` 安排新任务。输入框本身仍应立即更新，延迟的是后续工作。节流强调连续操作中的执行频率，和这里的“停下来再处理”不同。

## 动手试试

快速输入几个字符，比较输入事件数与处理次数；再输入后立刻点取消。这个实验只处理本地文字，不发送网络请求。离开组件时，也应清理尚未执行的任务。`,
    html: `<main><h1>停下输入后再处理</h1><label for="query">搜索词</label><input id="query" placeholder="连续输入几个字符"><p id="events">输入事件：0</p><p id="runs">处理次数：0</p><button id="cancel" type="button">取消待处理输入</button><p id="result" role="status">等待输入</p></main>`,
    css: demoStyle,
    js: `let timer;\nlet events = 0;\nlet runs = 0;\nconst input = document.querySelector('#query');\ninput.addEventListener('input', () => {\n  document.querySelector('#events').textContent = '输入事件：' + (++events);\n  clearTimeout(timer);\n  const value = input.value;\n  timer = setTimeout(() => {\n    document.querySelector('#runs').textContent = '处理次数：' + (++runs);\n    document.querySelector('#result').textContent = '处理结果：' + value;\n  }, 350);\n});\ndocument.querySelector('#cancel').addEventListener('click', () => {\n  clearTimeout(timer);\n  document.querySelector('#result').textContent = '已取消待处理输入';\n});`,
  },
  {
    id: 'guide-js-all-settled',
    title: 'allSettled：一个任务失败也能查看其他结果',
    tags: ['JavaScript', '异步'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled',
    body: `## 使用场景

页面同时读取几块相互独立的信息时，其中一项失败，不一定要放弃其余结果。\`Promise.allSettled\` 等待各项成功或失败后，给出每一项的状态。

## 读取结果

\`status\` 为 \`fulfilled\` 时读取 \`value\`，为 \`rejected\` 时读取 \`reason\`。结果数组沿用输入任务顺序，不是完成顺序。与之相比，\`Promise.all\` 遇到拒绝会让组合 Promise 拒绝；这不代表它自动取消其他任务。

## 动手试试

运行三个定时模拟任务，第二项故意失败且先完成。观察第一、第三项依然显示成功，列表仍按任务一、二、三排列。再修改延迟，验证排序不受完成时机影响。`,
    html: `<main><h1>独立任务汇总</h1><button id="run" type="button">开始三个任务</button><ol id="results"></ol><p id="status" role="status">尚未开始</p></main>`,
    css: demoStyle,
    js: `const button = document.querySelector('#run');\nbutton.addEventListener('click', async () => {\n  button.disabled = true;\n  document.querySelector('#status').textContent = '正在汇总';\n  const task = (delay, value, fail = false) => new Promise((resolve, reject) => setTimeout(() => fail ? reject(new Error(value)) : resolve(value), delay));\n  const results = await Promise.allSettled([task(120, '笔记已加载'), task(30, '模拟加载失败', true), task(70, '标签已加载')]);\n  const list = document.querySelector('#results');\n  list.replaceChildren();\n  results.forEach((result, index) => {\n    const row = document.createElement('li');\n    row.textContent = '任务 ' + (index + 1) + '：' + (result.status === 'fulfilled' ? '成功 · ' + result.value : '失败 · ' + result.reason.message);\n    list.append(row);\n  });\n  document.querySelector('#status').textContent = '汇总完成：2 项成功，1 项失败';\n  button.disabled = false;\n});`,
  },
  {
    id: 'guide-web-abort-controller',
    title: 'AbortController：取消旧任务，保留最新结果',
    tags: ['Web API', '异步'],
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/AbortController',
    body: `## 使用场景

切换页面或重新发起查询后，旧任务可能已不再需要。\`AbortController\` 提供一个 \`signal\`，调用 \`abort()\` 会发出取消信号。支持该信号的 API 或你自己写的任务需要处理它。

## 重要边界

取消信号不会自动停止任意 Promise 或已经执行的同步计算。这个模拟任务监听 \`abort\`，主动清除定时器并拒绝 Promise。正常完成时移除监听，避免留下无用回调；控制器取消后不能复用。

## 动手试试

开始后立即取消，再重新开始并等待完成；连续点击开始会先取消旧任务。结果更新还核对控制器身份，避免旧任务的取消反馈盖住新任务的状态。实验不访问网络，可离线运行。`,
    html: `<main><h1>可取消任务</h1><button id="start" type="button">开始模拟任务</button><button id="cancel" type="button">取消任务</button><p id="status" role="status">尚未开始</p></main>`,
    css: demoStyle,
    js: `let active;\nconst status = document.querySelector('#status');\nfunction simulate(signal) {\n  if (signal.aborted) return Promise.reject(new DOMException('已取消', 'AbortError'));\n  return new Promise((resolve, reject) => {\n    const cancel = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); };\n    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve('任务完成'); }, 1200);\n    signal.addEventListener('abort', cancel, { once: true });\n  });\n}\ndocument.querySelector('#start').addEventListener('click', async () => {\n  active?.abort();\n  const controller = new AbortController();\n  active = controller;\n  status.textContent = '任务进行中';\n  try {\n    const result = await simulate(controller.signal);\n    if (active === controller) status.textContent = result;\n  } catch (error) {\n    if (active === controller) status.textContent = error.name === 'AbortError' ? '任务已取消' : '任务失败';\n  }\n});\ndocument.querySelector('#cancel').addEventListener('click', () => active?.abort());`,
  },
  {
    id: 'guide-js-shallow-copy',
    title: '浅拷贝：展开对象后，嵌套状态仍可能共享',
    tags: ['JavaScript', '数据处理'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax',
    body: `## 现象

写了 \`const next = { ...original }\`，修改 \`next.profile.name\` 后原对象也变了。展开语法只复制一层，嵌套对象仍通过相同引用访问。

## 明确复制变化路径

如果只改个人资料，可以同时复制顶层与 \`profile\`：

\`\`\`js
const next = {
  ...original,
  profile: { ...original.profile, name: '新名字' },
};
\`\`\`

这不是任意深拷贝，其他嵌套路径仍可能共享；修改数组中的对象时同样要考虑这一点。

## 动手试试

运行示例，比较两个互相独立的实验：浅拷贝后修改嵌套字段会影响原对象，复制变化路径则保留原值。不要把“顶层对象不同”误认为“内部每一层都独立”。`,
    html: `<main><h1>嵌套状态比较</h1><pre id="result"></pre></main>`,
    css: demoStyle,
    js: `const shared = { profile: { name: '原名字' } };\nconst shallow = { ...shared };\nshallow.profile.name = '被浅拷贝修改';\nconst original = { profile: { name: '原名字' } };\nconst independent = { ...original, profile: { ...original.profile, name: '新名字' } };\ndocument.querySelector('#result').textContent = [\n  '浅拷贝实验的原对象：' + shared.profile.name,\n  '复制路径实验的原对象：' + original.profile.name,\n  '新对象：' + independent.profile.name,\n  '顶层独立：' + (original !== independent),\n  'profile 独立：' + (original.profile !== independent.profile),\n].join('\\n');`,
  },
  {
    id: 'guide-js-map-keys',
    title: 'Map：对象作为键时，身份比外观重要',
    tags: ['JavaScript', '数据处理'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map',
    body: `## 使用场景

需要按对象记录状态或保持键的插入顺序时，可以使用 \`Map\`。键不仅限于字符串，还可以是对象、数字等值。

## 对象键的身份

两个内容相同的对象不一定是同一个键。用 \`map.get({ id: 1 })\` 查找时创建了新对象，它与之前放进去的对象引用不同。若业务需要按 ID 查找，通常应直接把稳定的 ID 当作键。

## 动手试试

观察同一个对象引用可以取回记录，新建的相似对象取不到；再删除并重新加入一个键，检查遍历顺序。已有键再次 \`set\` 更新值时，会保留它原来的位置。\`Map\` 不会因为是对象键就自动释放它持有的引用。`,
    html: `<main><h1>对象键与顺序</h1><pre id="result"></pre></main>`,
    css: demoStyle,
    js: `const user = { id: 1 };\nconst map = new Map([[user, '正在编辑'], ['second', '已保存']]);\nconst same = map.get(user);\nconst fresh = map.get({ id: 1 });\nmap.set(user, '已更新');\nconst initial = [...map.keys()].map(key => typeof key === 'object' ? 'user' : key).join(' → ');\nmap.delete(user);\nmap.set(user, '重新加入');\nconst reordered = [...map.keys()].map(key => typeof key === 'object' ? 'user' : key).join(' → ');\ndocument.querySelector('#result').textContent = '同一引用：' + same + '\\n新建对象：' + String(fresh) + '\\n更新后顺序：' + initial + '\\n重新加入：' + reordered;`,
  },
  {
    id: 'guide-js-object-is',
    title: 'Object.is：NaN 和负零的相等比较',
    tags: ['JavaScript', '基础'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is',
    body: `## 为什么要了解

判断两个值是否相同，不能只记住一个符号。\`===\` 不做类型转换，但 \`NaN === NaN\` 是 false，正零与负零用 \`===\` 比较则为 true。

## Object.is 的两个差别

\`Object.is(NaN, NaN)\` 为 true，\`Object.is(0, -0)\` 为 false。它也不会把字符串数字转换为数字。对对象，两者都比较引用身份，不会递归比较内容。

## 动手试试

运行后比较四行结果，再增加 \`Object.is('1', 1)\`。选择比较方式要依据业务语义：这些规则不等同于深度相等。显示结果时用明确的标签标出负零，因为直接转成字符串可能只看到“0”。`,
    html: `<main><h1>相等规则实验</h1><pre id="result"></pre></main>`,
    css: demoStyle,
    js: `const rows = [\n  ['NaN 与 NaN', NaN, NaN],\n  ['正零与负零', 0, -0],\n  ['同值数字', 1, 1],\n  ['两个空对象', {}, {}],\n];\ndocument.querySelector('#result').textContent = rows.map(([label, a, b]) => label + '：=== ' + (a === b) + ' / Object.is ' + Object.is(a, b)).join('\\n');`,
  },
  {
    id: 'guide-js-numeric-sort',
    title: '数值排序：比较函数与原数组保护',
    tags: ['JavaScript', '数据处理'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort',
    body: `## 现象

\`[2, 10, 1].sort()\` 的结果不是按数值大小排列。默认排序会按字符串的 UTF-16 顺序比较元素，所以数字数组要明确提供比较函数。

## 两个要点

\`(a, b) => a - b\` 用于升序，\`b - a\` 用于降序。\`sort\` 会修改原数组；希望保留原有顺序时，可先用 \`[...values]\` 复制数组再排序。复制数组依然是浅拷贝，数组中的对象没有被深拷贝。

## 动手试试

切换升序与降序，确认“原数组”一行始终保持 2、10、1、30。真实数据要先定义缺失值、NaN 等情况的处理规则；对象排序应比较明确的字段，而不是直接相减两个对象。`,
    html: `<main><h1>数字排序</h1><button id="asc" type="button">升序</button><button id="desc" type="button">降序</button><pre id="result"></pre></main>`,
    css: demoStyle,
    js: `const values = [2, 10, 1, 30];\nfunction render(direction) {\n  const sorted = [...values].sort((a, b) => direction * (a - b));\n  document.querySelector('#result').textContent = '原数组：' + values.join(', ') + '\\n排序结果：' + sorted.join(', ');\n}\ndocument.querySelector('#asc').addEventListener('click', () => render(1));\ndocument.querySelector('#desc').addEventListener('click', () => render(-1));\nrender(1);`,
  },
  {
    id: 'guide-dom-listener-cleanup',
    title: '事件清理：用 signal 成组移除监听',
    tags: ['DOM', 'Web API'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener',
    body: `## 使用场景

弹窗关闭或组件离开页面后，原来的监听仍在执行，可能导致重复响应。绑定监听时传入 \`{ signal: controller.signal }\`，之后调用控制器的 \`abort()\` 可移除使用该信号的监听。

## 生命周期要点

每次重新绑定使用新的控制器，先取消旧绑定，避免叠加多个监听。取消控制器不会清空你的业务状态，只会触发相关清理。也可以使用 \`removeEventListener\`，但需要保留同一个回调引用，并正确匹配捕获设置。

## 动手试试

点击计数，再解除监听后继续点击，计数应保持不变。点击重新绑定后，计数再次增加；连续重新绑定几次，单次点击也只增加一。示例把解除与重绑的按钮独立绑定，避免把控制入口一起移除。`,
    html: `<main><h1>监听生命周期</h1><button id="count" type="button">点击计数</button><button id="stop" type="button">解除监听</button><button id="bind" type="button">重新绑定</button><p id="value">点击次数：0</p><p id="status" role="status">已绑定</p></main>`,
    css: demoStyle,
    js: `let controller;\nlet count = 0;\nconst target = document.querySelector('#count');\nfunction bind() {\n  controller?.abort();\n  controller = new AbortController();\n  target.addEventListener('click', () => { document.querySelector('#value').textContent = '点击次数：' + (++count); }, { signal: controller.signal });\n  document.querySelector('#status').textContent = '已绑定';\n}\ndocument.querySelector('#stop').addEventListener('click', () => { controller.abort(); document.querySelector('#status').textContent = '监听已解除'; });\ndocument.querySelector('#bind').addEventListener('click', bind);\nbind();`,
  },
  {
    id: 'guide-css-auto-fit-grid',
    title: '自适应 Grid：根据容器宽度安排卡片列数',
    tags: ['CSS', '布局', '响应式'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/grid-template-columns',
    body: `## 使用场景

卡片列表既可能出现在宽内容区，也可能在窄侧栏。使用重复网格轨道，可以在可用空间变化时自动安排列数。

## 核心写法

\`\`\`css
.cards {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
}
\`\`\`

最小值中的 \`min(100%, 140px)\` 让特别窄的容器也能放下单列；\`1fr\` 分配剩余空间，\`auto-fit\` 会折叠空的重复轨道。

## 动手试试

预览空间足够宽时，拖动滑块观察一列、两列和三列。实际宽度受预览容器限制：窄窗口中把滑块调大，也可能仍然只有一列。再减少卡片数量，比较空轨道处理；长单词仍需要换行或其他溢出策略，网格列数不会自动替你解决所有内容溢出。`,
    html: `<main><h1>自适应卡片网格</h1><label for="width">容器宽度</label><input id="width" type="range" min="120" max="500" value="480"><p id="status" role="status"></p><div id="cards"><article>第一张</article><article>第二张</article><article>第三张</article></div></main>`,
    css:
      demoStyle +
      `#cards{display:grid;gap:12px;width:480px;max-width:100%;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr))}article{padding:18px;background:white;border:1px solid #ddd;border-radius:8px;overflow-wrap:anywhere}input[type=range]{max-width:100%;box-sizing:border-box}`,
    js: `const slider = document.querySelector('#width');\nfunction resize() {\n  document.querySelector('#cards').style.width = slider.value + 'px';\n  document.querySelector('#status').textContent = '设定宽度：' + slider.value + 'px';\n}\nslider.addEventListener('input', resize);\nresize();`,
  },
  {
    id: 'guide-css-box-sizing',
    title: '盒模型：padding 和 border 算在宽度哪里',
    tags: ['CSS', '基础'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-sizing',
    body: `## 现象

元素写了 200px 宽，再加 20px 内边距和 4px 边框，实际占用的宽度为什么变成 248px？默认 \`content-box\` 中，width 描述内容区，左右 padding 和 border 额外累加。

## border-box

使用 \`box-sizing: border-box\` 时，指定的宽度包含内容、内边距和边框，但不包含 margin。它常用于固定宽度组件和表单布局。不要把外边距也算进这一规则。

## 动手试试

切换两种模式，观察实时测得的元素宽度。这个实验使用固定尺寸便于计算；实际布局还要考虑最小尺寸、可用空间和内容溢出，不能仅凭 box-sizing 判断页面一定不会超宽。`,
    html: `<main><h1>宽度计算实验</h1><button id="toggle" type="button">切换盒模型</button><p id="status" role="status"></p><div id="box">width: 200px<br>padding: 20px<br>border: 4px</div></main>`,
    css:
      demoStyle +
      `#box{box-sizing:content-box;width:200px;padding:20px;border:4px solid #6258bd;background:white;overflow-wrap:anywhere}`,
    js: `const box = document.querySelector('#box');\nlet borderBox = false;\nfunction render() {\n  box.style.boxSizing = borderBox ? 'border-box' : 'content-box';\n  document.querySelector('#status').textContent = box.style.boxSizing + '：实际宽度 ' + Math.round(box.getBoundingClientRect().width) + 'px';\n}\ndocument.querySelector('#toggle').addEventListener('click', () => { borderBox = !borderBox; render(); });\nrender();`,
  },
  {
    id: 'guide-a11y-focus-visible',
    title: '键盘焦点：让操作位置始终可见',
    tags: ['可访问性', 'CSS'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:focus-visible',
    body: `## 使用场景

不用鼠标浏览页面时，需要看见当前焦点落在哪个按钮或输入框。原生按钮提供键盘操作，\`:focus-visible\` 根据浏览器的判断，在需要显著提示焦点时应用样式。

## 可见焦点

\`\`\`css
button:focus-visible {
  outline: 3px solid #b45b00;
  outline-offset: 3px;
}
\`\`\`

不要仅为了去掉点击后的边框就全局删除 outline。具体匹配由浏览器启发式决定，并非简单等同于“只能由键盘触发”；输入控件也可能在鼠标点击后显示焦点。

## 动手试试

使用 Tab 浏览，Enter 激活按钮，再用鼠标对比。注意按钮设为 \`type="button"\`，避免放入表单时意外提交。程序主动移动焦点后也应保留清楚的视觉位置。`,
    html: `<main><h1>焦点位置实验</h1><label for="name">昵称</label><input id="name" value="读者"><button id="first" type="button">第一个按钮</button><button id="second" type="button">第二个按钮</button><p id="status" role="status">请选择一个按钮</p></main>`,
    css: demoStyle,
    js: `for (const id of ['first', 'second']) {\n  document.querySelector('#' + id).addEventListener('click', event => {\n    document.querySelector('#status').textContent = '已激活：' + event.currentTarget.textContent;\n  });\n}`,
  },
  {
    id: 'guide-html-details',
    title: 'details：用原生元素制作折叠说明',
    tags: ['HTML', '可访问性'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details',
    body: `## 使用场景

FAQ 或补充说明通常需要在阅读时展开。\`details\` 配合第一个 \`summary\` 子元素就能提供原生折叠交互，不需要把普通 div 伪装成按钮。

## 状态与事件

\`open\` 是布尔属性：存在就表示展开，所以写 \`open="false"\` 仍然是展开。需要关闭时移除属性或把元素的 \`open\` 属性设为 false。\`toggle\` 事件可用于更新提示；快速连续切换时，事件可能被合并。

## 动手试试

点击标题，或聚焦后按 Enter/空格，观察展开内容和状态反馈。标题应简洁说明折叠区内容，避免在 summary 中塞入不必要的其他交互控件；浏览器默认的展开指示也帮助用户发现入口。`,
    html: `<main><h1>折叠说明</h1><details id="details"><summary>查看练习提示</summary><p>先预测结果，再运行代码，并记录你的观察。</p></details><p id="status" role="status">当前状态：已收起</p></main>`,
    css:
      demoStyle +
      `details{padding:12px;border:1px solid #bbb;border-radius:8px;background:white}summary{cursor:pointer;font-weight:600}details[open] summary{margin-bottom:10px}`,
    js: `const details = document.querySelector('#details');\ndetails.addEventListener('toggle', () => {\n  document.querySelector('#status').textContent = '当前状态：' + (details.open ? '已展开' : '已收起');\n});`,
  },
]
