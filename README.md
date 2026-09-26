# 片段 · 开发者知识库 + 代码实验室

把经验留下，让想法运行。一个可以直接使用的个人前端工具：写 Markdown 笔记、给经验贴标签、搜索正文与源码，在隔离预览中运行原生浏览器代码，并用 JSON 备份自己的积累。

第一版已实现，运行数据完全保存在当前浏览器，无账号、AI API、云服务或付费依赖。

## 启动

需要 **Node.js 20.19+、22.12+ 或 24**。推荐 Node 24；本项目实际使用 24.19.0 验证。

```sh
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。开发服务只监听本机，固定 5173 端口；端口占用时会明确退出，避免悄悄换地址造成“数据丢失”的错觉。

当前这台 Mac 的默认 Node 是 18，可以使用下面的启动脚本。它自动选择已存在的 Codex Node 24，仅影响当前进程，不修改全局 Node 设置。

```sh
./scripts/dev.sh
```

依赖已安装时可直接运行。该脚本也可以运行其他 npm 命令：

```sh
./scripts/dev.sh test
./scripts/dev.sh run typecheck
./scripts/dev.sh run build
./scripts/dev.sh run preview
```

生产预览默认位于 `http://127.0.0.1:4173`。**不同协议、主机名、端口和浏览器拥有不同的数据空间**；从 5173 切换到 4173 或从 127.0.0.1 切换到 localhost 时，请先导出，再在新地址导入。

## 已完成的功能

- **知识卡片**：创建、编辑、删除与本次删除撤销；Markdown 阅读/编辑、代码块、列表、表格、标签、HTTP(S) 来源链接，以及“现象—原因—解决方法—下次注意”模板。
- **代码实验室**：卡片附属 HTML / CSS / JavaScript 源码编辑，主动运行、独立预览、清空结果、console 输出、语法/运行时/Promise 错误和 CSP 提示。编辑后需重新运行，打开卡片和刷新不会自动执行。
- **统一搜索**：标题、正文、代码、标签一起搜索；空白分词 AND 匹配、不区分大小写、标签精确筛选、文本高亮、代码上下文摘要、无结果状态。标题命中优先，接着是标签、正文、代码，同等相关度按修改时间排序。
- **本地保存**：450 ms 防抖保存，离开页面前尝试保存并在存在未存改动时提示；卡片切换和导入前等待保存。准确显示保存中、已保存和未保存；失败不会丢掉内存草稿，可重试、保留副本或导出。
- **完整备份**：带版本号 JSON 导入导出，包含全部正文、源码、标签、来源、ID、时间和 revision。导入前预览记录/冲突数量；相同 ID 可以跳过或另存副本，绝不静默覆盖。
- **界面**：浅色三栏工作区、窄屏列表/详情切换、移动导航、可见键盘焦点。提供 Grid、事件委托、数组转换三张可编辑示例，只在首次初始化时写入；删除后不会再自动补回。

快捷键：`⌘ / Ctrl + K` 聚焦搜索；在搜索中 `↑ / ↓` 选择、`Enter` 打开、`Esc` 清空；代码编辑器中 `⌘ / Ctrl + Enter` 运行；代码语言标签支持左右方向键与 Home/End。标签输入按 Enter、逗号或移开焦点添加。

## 数据可靠性

使用 Dexie 和 IndexedDB，数据库名 `dev-knowledge-lab`，数据库版本 1。`cards` 保存完整记录，`metadata` 保存初始化标记。保存和删除在事务中比较 revision，过期写入会得到明确冲突提示；其他页面更新会实时同步到没有本地未存修改的卡片。冲突时保留本地草稿，用户可另存副本，或确认放弃后载入已保存版本。

备份格式：

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-25T00:00:00.000Z",
  "cards": []
}
```

`cards` 中每项包含 `id`、`title`、`body`、`tags`、`source`、`html`、`css`、`js`、`createdAt`、`updatedAt` 和正整数 `revision`。导入严格校验完整字段、版本、UTC ISO 时间、链接协议、数组与重复 ID。整个导入是事务，任一写入失败会回滚；导入副本只改 ID，保留原内容和时间。

单文件备份上限 **10 MiB / 5000 张卡片**；标题 200 字符，正文 500000 字符，每份代码 250000 字符，标签最多 24 个且每个最多 48 字符，来源 2048 字符。超限会明确拒绝，不会截断备份。当前单文件导出不支持分卷，超过总体积限制后需自行减少或拆分数据；首版适合个人少量至中等规模记录，未做大数据集性能承诺。

浏览器存储不是永久备份：清理站点数据、隐私模式结束、浏览器回收存储或设备损坏可能丢失内容。请定期导出。未保存的内容在关闭页面时仅尽力保存；务必等待“已保存”，无法保存时先导出或保留副本。

## 代码执行与内容边界

预览使用 `sandbox="allow-scripts"` 的独立 iframe，**不授予 allow-same-origin**、弹窗、下载、表单或顶层导航权限。宿主没有通过 `eval` / `Function` 执行用户源码。

- 运行文档使用 nonce CSP，默认拒绝外部资源、fetch/XHR/WebSocket、嵌套框架、Worker、字体和媒体，仅允许内嵌样式和 data 图片。
- HTML 作为标记处理，移除 script、iframe、meta、base、link、object 等；内联事件由 CSP 阻止。脚本应写在 JavaScript 标签页，通过 nonce script 执行。
- iframe 消息验证发送窗口、当前运行 ID、严格字段结构和长度，不以不透明源的 `origin` 作为身份依据。每次运行最多接收 120 条输出，每条最多 8000 字符。
- Markdown 不启用原始 HTML。链接仅开放 HTTP(S)，新窗口使用 noopener；远程图片以文字占位显示，避免笔记偷偷加载外部资源。
- **iframe 不是进程或 CPU/内存隔离。** 死循环和资源耗尽仍可能卡住整个页面。自身导航也无法跨浏览器保证彻底阻断，因此不能把本工具当作完全断网的恶意代码分析环境。请只运行可信代码。

相关设计依据：[MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[Dexie 事务](https://dexie.org/docs/Dexie/Dexie.transaction())。

## 验证与项目结构

```sh
npm test
npm run typecheck
npm run build
npm run format
```

关键逻辑测试覆盖：备份合法/非法结构、版本、协议、重复 ID、边界与完整往返；刷新式重开数据库恢复；双页面初始化和保存竞争；陈旧写入/删除拦截；配额失败与导入事务回滚；搜索排序/跨字段/高亮特殊字符；sandbox 安全序列化、CSP 和消息校验。存储失败使用 fake-indexeddb 与故障注入验证，不等同于测量所有浏览器的实际磁盘配额。

浏览器实际走查记录在 [VALIDATION.md](./VALIDATION.md)。

```text
src/App.tsx                  卡片界面、导航、导入导出与交互
src/components/CodeLab.tsx    编辑、运行和预览
src/components/Markdown.tsx   安全 Markdown 与搜索高亮
src/lib/useKnowledge.ts       自动保存、失败恢复、跨页面更新
src/lib/db.ts                 IndexedDB 事务与版本冲突检测
src/lib/backup.ts             备份版本和结构校验
src/lib/search.ts             搜索排序、上下文摘要和高亮分段
src/lib/sandbox.ts            执行文档与严格消息校验
src/lib/seeds.ts              首次示例与踩坑模板
tests/                       关键数据与边界测试
```

## 首版限制

仅支持原生 HTML/CSS/JavaScript；不编译 React、不解析 npm 包、不运行服务端代码。编辑器是带行号的文本编辑器，没有语法着色或智能补全。无登录、AI API、云同步、协作或部署。没有 Service Worker：已打开页面的编辑和保存不需要外网，但关闭页面后重新加载仍需要本地开发/预览服务运行。删除撤销只保留当前会话的最近一次删除，刷新后应通过备份恢复。
