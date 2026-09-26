import type { Card } from './types'

type Lesson = Pick<
  Card,
  'id' | 'title' | 'tags' | 'source' | 'body' | 'html' | 'css' | 'js'
>

// Stable IDs let an explicit re-import add missing lessons without changing edited ones.
const lessons: Lesson[] = [
  {
    id: 'guide-js-closure',
    title: '闭包：让每个计数器记住自己的状态',
    tags: ['JavaScript', '基础'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures',
    body: `## 什么时候用

多个按钮各自计数时，如果共用一个外部变量，数字就会互相影响。函数可以“记住”创建它时所在的词法环境：每次调用工厂函数，都会得到一份独立状态。

## 关键做法

让 \`makeCounter\` 创建局部变量 \`count\`，再返回能访问它的函数。外部代码只拿到操作函数，不需要直接改状态。

## 动手试试

运行后交替点击两个按钮，再把 \`count += 1\` 改成 \`count += 2\`。注意：闭包保存的是对变量的访问，不是创建时的数字快照。`,
    html: `<main><h1>两个独立计数器</h1><button id="tea">茶：0</button><button id="coffee">咖啡：0</button><p>交替点击，观察各自的数字。</p></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;color:#243047;background:#f5f7fb}main{max-width:400px;margin:auto}button{padding:12px 18px;margin:0 10px 10px 0;border:0;border-radius:10px;background:#635bce;color:white;cursor:pointer}p{color:#627089}`,
    js: `function makeCounter(label) {\n  let count = 0;\n  return () => {\n    count += 1;\n    return label + '：' + count;\n  };\n}\nfor (const [id, label] of [['tea', '茶'], ['coffee', '咖啡']]) {\n  const next = makeCounter(label);\n  document.querySelector('#' + id).addEventListener('click', event => {\n    event.currentTarget.textContent = next();\n  });\n}`,
  },
  {
    id: 'guide-js-microtasks',
    title: '微任务：Promise 回调为什么先于定时器',
    tags: ['JavaScript', '异步'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide',
    body: `## 先猜输出，再运行

同步代码先执行。当前调用栈结束后，浏览器会处理已排队的微任务；\`Promise.then\` 回调和 \`queueMicrotask\` 都会进入这个队列。\`setTimeout\` 回调是后续任务，因此示例输出为“同步 → Promise → queueMicrotask → 定时器”。

## 容易踩的坑

微任务中如果不断继续添加微任务，页面可能迟迟得不到绘制机会。不要把大计算任务塞进微任务链。

## 动手试试

运行代码并查看右侧预览和控制台；交换两条微任务的注册顺序，再看结果。`,
    html: `<main><h1>执行顺序实验</h1><ol id="steps"></ol></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;background:#f5f7fb;color:#243047}main{max-width:420px;margin:auto}li{padding:8px;margin:6px 0;background:white;border-radius:8px}`,
    js: `const steps = document.querySelector('#steps');\nfunction show(label) {\n  const row = document.createElement('li');\n  row.textContent = label;\n  steps.append(row);\n  console.log(label);\n}\nshow('1 同步');\nPromise.resolve().then(() => show('2 Promise 微任务'));\nqueueMicrotask(() => show('3 queueMicrotask 微任务'));\nsetTimeout(() => show('4 定时器任务'), 0);`,
  },
  {
    id: 'guide-js-reduce',
    title: 'reduce：把一组记录汇总成统计结果',
    tags: ['JavaScript', '数据处理'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce',
    body: `## 适用场景

\`map\` 用来逐项转换；\`reduce\` 适合把多项累计为一个结果，例如求和、计数和分组。示例把支出按类别累计到 \`Map\`，避免把用户输入的类别当作普通对象属性名。

## 写法要点

明确给出初始值。没有初始值的 \`reduce\` 遇到空数组会抛错，而 \`new Map()\` 可以自然表示“暂无数据”。

## 动手试试

添加一条记录，或把数组清空，观察输出。实际业务里金额计算还应考虑币种与精度。`,
    html: `<main><h1>本周支出</h1><ul id="totals"></ul><p id="sum"></p></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;background:#f7f8fb;color:#253149}main{max-width:380px;margin:auto}li{display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid #ddd}p{font-weight:700}`,
    js: `const expenses = [\n  { category: '餐饮', amount: 25 },\n  { category: '交通', amount: 12 },\n  { category: '餐饮', amount: 18 },\n];\nconst totals = expenses.reduce((result, item) => {\n  result.set(item.category, (result.get(item.category) ?? 0) + item.amount);\n  return result;\n}, new Map());\nconst list = document.querySelector('#totals');\nfor (const [name, amount] of totals) {\n  const row = document.createElement('li');\n  row.textContent = name + '：' + amount + ' 元';\n  list.append(row);\n}\ndocument.querySelector('#sum').textContent = '合计：' + [...totals.values()].reduce((a, b) => a + b, 0) + ' 元';`,
  },
  {
    id: 'guide-dom-text-content',
    title: 'textContent：把用户输入安全地显示为文字',
    tags: ['DOM', '安全'],
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent',
    body: `## 现象

需要把搜索词、昵称等用户输入显示在页面上。若直接拼进 \`innerHTML\`，输入会被当作 HTML 解析，可能带来脚本注入风险。

## 解决方法

只想显示文字时使用 \`textContent\`；要创建元素时，用 \`createElement\` 并逐个设置属性。示例输入 \`<b>你好</b>\` 后，预览会原样显示尖括号。

## 动手试试

输入 HTML 标签并观察结果。只有确实需要解析受信任的 HTML 时，才考虑 HTML 注入相关 API 与严格净化。`,
    html: `<main><h1>安全显示输入</h1><label for="name">输入昵称</label><input id="name" value="<b>你好</b>"><p>预览：<strong id="preview"></strong></p></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;background:#f6f7fb;color:#253149}main{max-width:380px;margin:auto}label{display:block;margin-bottom:8px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #aab4c4;border-radius:8px}strong{color:#6258bd}`,
    js: `const input = document.querySelector('#name');\nconst preview = document.querySelector('#preview');\nfunction render() {\n  preview.textContent = input.value;\n  console.log('作为文字显示：', input.value);\n}\ninput.addEventListener('input', render);\nrender();`,
  },
  {
    id: 'guide-dom-validity',
    title: '表单校验：先使用浏览器内建规则',
    tags: ['DOM', '表单'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/checkValidity',
    body: `## 适用场景

邮箱、必填项等常见规则可以先交给 HTML 约束校验。\`required\` 和 \`type="email"\` 提供基本规则，\`checkValidity()\` 返回是否通过，\`validationMessage\` 给出浏览器的提示。

## 注意边界

前端校验改善输入体验，真正提交数据时仍需在接收端重新校验。自定义错误用 \`setCustomValidity\` 设置后，要在条件恢复时清空。

## 动手试试

分别输入空值、普通文本和邮箱，再点“检查”。`,
    html: `<main><h1>邮箱检查</h1><label for="email">邮箱地址</label><input id="email" type="email" required placeholder="name@example.com"><button id="check" type="button">检查</button><p id="message" role="status"></p></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;background:#f6f7fb;color:#253149}main{max-width:380px;margin:auto}label{display:block;margin-bottom:8px}input{padding:10px;border:1px solid #aab4c4;border-radius:8px}button{margin:10px;padding:10px 16px;border:0;border-radius:8px;background:#6258bd;color:white;cursor:pointer}`,
    js: `const email = document.querySelector('#email');\nconst message = document.querySelector('#message');\ndocument.querySelector('#check').addEventListener('click', () => {\n  const valid = email.checkValidity();\n  message.textContent = valid ? '格式通过，可以继续。' : email.validationMessage;\n  message.style.color = valid ? '#236b45' : '#a73535';\n  console.log('校验通过：', valid);\n});`,
  },
  {
    id: 'guide-css-flex-min-width',
    title: 'Flex 溢出：长文本为什么挤不出省略号',
    tags: ['CSS', '布局'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts',
    body: `## 现象

弹性布局里，标题设了 \`overflow: hidden\` 和省略号，卡片却仍被一串长文本撑宽。

## 原因与修复

弹性子项默认的自动最小尺寸会参考内容大小。允许标题所在的弹性子项缩小，可以在该子项上加 \`min-width: 0\`。省略号的三件套仍需放在文本本身：\`white-space: nowrap\`、\`overflow: hidden\`、\`text-overflow: ellipsis\`。

## 动手试试

切换复选框，对比有无 \`min-width: 0\` 时的效果。`,
    html: `<main><h1>Flex 长标题</h1><label><input id="fix" type="checkbox"> 允许子项收缩</label><div class="row"><span class="avatar">A</span><div id="item" class="item"><strong>这是一条没有空格的超长标题ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789</strong><small>副标题保持在卡片里</small></div><span>→</span></div></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;background:#f6f7fb;color:#253149}main{max-width:360px;margin:auto}label{display:block;margin-bottom:16px}.row{display:flex;align-items:center;gap:10px;width:300px;max-width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;background:white}.avatar{flex:none;padding:9px;background:#dedafa;border-radius:50%}.item{flex:1}.item.fixed{min-width:0}.item strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item small{display:block;color:#78849a}`,
    js: `const checkbox = document.querySelector('#fix');\nconst item = document.querySelector('#item');\ncheckbox.addEventListener('change', () => {\n  item.classList.toggle('fixed', checkbox.checked);\n  console.log('min-width: 0', checkbox.checked ? '已开启' : '已关闭');\n});`,
  },
  {
    id: 'guide-css-container-query',
    title: '容器查询：组件根据自身空间改布局',
    tags: ['CSS', '响应式'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_size_and_style_queries',
    body: `## 为什么不用视口断点

同一个组件可能放在宽主栏或窄侧栏。视口宽度相同，它们得到的空间却不同。容器查询让样式依据组件外层容器的尺寸变化。

## 写法

父层声明 \`container-type: inline-size\`，后代写在 \`@container (min-width: 320px)\` 中。查询样式作用于后代，不直接给查询容器本身换布局。

## 动手试试

拖动滑块调整容器宽度，观察卡片从纵向变成横向。`,
    html: `<main><h1>会适应位置的卡片</h1><label for="size">容器宽度：<output id="value">280</output>px</label><input id="size" type="range" min="220" max="480" value="280"><div id="frame" class="frame"><article><span class="art">✦</span><div><h2>一段好内容</h2><p>宽容器中横向排列，窄容器中上下排列。</p></div></article></div></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:20px;background:#f6f7fb;color:#253149}main{max-width:520px;margin:auto}label{display:block}input{width:260px;max-width:100%;margin:12px 0}.frame{container-type:inline-size;width:280px;max-width:100%;box-sizing:border-box;border:1px dashed #999;padding:8px}article{display:grid;gap:12px;padding:14px;background:white;border-radius:10px}.art{display:grid;place-items:center;height:90px;background:#e6e1fb;border-radius:8px;font-size:34px;color:#6258bd}h2{font-size:17px;margin:0 0 8px}p{font-size:12px;margin:0;color:#67758a}@container (min-width:320px){article{grid-template-columns:110px 1fr;align-items:center}}`,
    js: `const slider = document.querySelector('#size');\nconst frame = document.querySelector('#frame');\nconst value = document.querySelector('#value');\nslider.addEventListener('input', () => {\n  frame.style.width = slider.value + 'px';\n  value.textContent = slider.value;\n});`,
  },
  {
    id: 'guide-css-sticky',
    title: 'Sticky：让分组标题跟随滚动容器',
    tags: ['CSS', '布局'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position',
    body: `## 适用场景

长列表按日期或字母分组时，标题可以在所属分组滚动期间停留在顶部。\`position: sticky\` 保留元素在文档流中的位置，并在达到 \`top\` 阈值时吸附。

## 排查顺序

先确认设置了 \`top\` 等偏移量，再确认滚动发生在哪个祖先容器中；标题不能越过所属容器的边界。示例把滚动区域固定为 180px 高度。

## 动手试试

在预览里的列表中向下滚动，观察 A、B 两组标题如何交接。`,
    html: `<main><h1>联系人</h1><div class="list"><section><h2>A</h2><p>安安</p><p>阿澄</p><p>阿棠</p><p>阿哲</p></section><section><h2>B</h2><p>白露</p><p>北北</p><p>柏舟</p><p>冰河</p></section></div></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;background:#f6f7fb;color:#253149}main{max-width:360px;margin:auto}.list{height:180px;overflow:auto;border:1px solid #ddd;border-radius:10px;background:white}h2{position:sticky;top:0;margin:0;padding:9px 14px;background:#eae7fa;color:#6258bd;font-size:15px}p{margin:0;padding:14px;border-bottom:1px solid #eee}`,
    js: `console.log('在预览列表中滚动，观察分组标题。');`,
  },
  {
    id: 'guide-web-url-search-params',
    title: 'URLSearchParams：读写查询参数不靠字符串拼接',
    tags: ['JavaScript', 'Web API'],
    source: 'https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams',
    body: `## 适用场景

搜索页需要生成 \`?q=...&page=...\`。直接拼接字符串容易漏掉编码；\`URLSearchParams\` 提供 \`set\`、\`get\`、\`delete\` 等方法，并负责序列化查询部分。

## 注意

它处理的是查询参数，不负责拼接整个 URL。重复键可以存在；\`get\` 读取第一项，\`getAll\` 读取全部。

## 动手试试

输入带空格、\`&\` 或中文的搜索词，观察生成的参数串和再次读取的值。`,
    html: `<main><h1>查询参数实验</h1><label for="term">搜索词</label><input id="term" value="CSS & 布局"><p>参数串：<code id="query"></code></p><p>读回结果：<strong id="read"></strong></p></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;background:#f6f7fb;color:#253149}main{max-width:420px;margin:auto}label{display:block;margin-bottom:8px}input{padding:10px;border:1px solid #aaa;border-radius:8px;width:90%}code{overflow-wrap:anywhere;color:#6258bd}`,
    js: `const term = document.querySelector('#term');\nfunction render() {\n  const params = new URLSearchParams();\n  params.set('q', term.value);\n  params.set('page', '1');\n  document.querySelector('#query').textContent = '?' + params.toString();\n  document.querySelector('#read').textContent = params.get('q');\n  console.log('读回：', params.get('q'));\n}\nterm.addEventListener('input', render);\nrender();`,
  },
  {
    id: 'guide-a11y-live-region',
    title: '状态播报：动态反馈也要让辅助技术听见',
    tags: ['可访问性', 'DOM'],
    source:
      'https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live',
    body: `## 现象

按钮点击后页面数字变了，但使用屏幕阅读器的人不一定能及时知道发生了什么。

## 解决方法

用真正的 \`button\` 提供键盘操作与语义，再给更新的状态文本加 \`aria-live="polite"\`。礼貌播报会等待合适的时机，适合一般状态变化；紧急消息才考虑更强的提示方式。

## 动手试试

点击按钮观察可见状态。若有屏幕阅读器，可打开后重复操作，检查是否听到更新。不要把整页都设成实时区域，以免播报过多。`,
    html: `<main><h1>阅读进度</h1><button id="advance" type="button">读完一页</button><p id="status" role="status" aria-live="polite">已读 0 页</p></main>`,
    css: `body{font-family:system-ui,sans-serif;padding:24px;background:#f6f7fb;color:#253149}main{max-width:380px;margin:auto}button{padding:12px 18px;border:0;border-radius:9px;background:#6258bd;color:white;cursor:pointer}button:focus-visible{outline:3px solid #f5a623;outline-offset:3px}p{padding:14px;background:white;border-radius:9px}`,
    js: `let pages = 0;\nconst status = document.querySelector('#status');\ndocument.querySelector('#advance').addEventListener('click', () => {\n  pages += 1;\n  status.textContent = '已读 ' + pages + ' 页';\n  console.log(status.textContent);\n});`,
  },
]

export const KNOWLEDGE_PACK_SIZE = lessons.length

export function makeKnowledgePackCards(now = new Date().toISOString()): Card[] {
  return lessons.map((lesson) => ({
    ...lesson,
    tags: [...lesson.tags],
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }))
}
