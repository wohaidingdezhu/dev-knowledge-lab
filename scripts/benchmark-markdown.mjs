import { chromium, devices, expect } from '@playwright/test'
import { createServer } from 'vite'

const sections = Number(process.env.SECTIONS || 500)
const repetitions = Number(process.env.REPETITIONS || 10)
if (!Number.isInteger(sections) || sections < 1 || sections > 1000)
  throw new Error('SECTIONS must be an integer between 1 and 1000')
if (!Number.isInteger(repetitions) || repetitions < 2 || repetitions > 100)
  throw new Error('REPETITIONS must be an integer between 2 and 100')
const body = Array.from(
  { length: sections },
  (_, index) =>
    `## 小节 ${index}\n\n一段包含 **重点**、[参考文档](https://example.com) 和 \`inlineCode\` 的说明。\n\n| 名称 | 值 |\n| --- | --- |\n| 示例 | ${index} |\n\n\`\`\`js\nconsole.log(${index})\n\`\`\`\n`,
).join('\n')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5276, strictPort: true },
})
await server.listen()
const browser = await chromium.launch()
try {
  const context = await browser.newContext(devices['Desktop Chrome'])
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error(error.message))
  await page.goto('http://127.0.0.1:5276/')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
  await page.evaluate(async (body) => {
    const request = indexedDB.open('dev-knowledge-lab')
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('cards', 'readwrite')
    const store = transaction.objectStore('cards')
    store.clear()
    store.put({
      id: 'markdown-benchmark',
      title: '长笔记测试',
      body,
      tags: [],
      source: '',
      html: '',
      css: '',
      js: '',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      revision: 1,
    })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  }, body)
  await page.reload()
  await page.getByRole('listbox').getByRole('option').click()
  await expect(page.locator('.markdown h2')).toHaveCount(sections)
  const search = page.getByRole('textbox', { name: '搜索知识卡片' })
  const durations = []
  for (let index = 0; index < repetitions + 3; index++) {
    await page.evaluate(() => {
      window.__markdownTiming = null
      const input = document.querySelector('input[aria-label="搜索知识卡片"]')
      input.addEventListener(
        'input',
        () => {
          const start = performance.now()
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.__markdownTiming = performance.now() - start
            }),
          )
        },
        { capture: true, once: true },
      )
    })
    await search.fill(index % 2 ? '长笔记测' : '长笔记测试')
    await expect(search).toHaveValue(index % 2 ? '长笔记测' : '长笔记测试')
    await page.waitForFunction(() => window.__markdownTiming !== null)
    if (index >= 3)
      durations.push(await page.evaluate(() => window.__markdownTiming))
  }
  durations.sort((left, right) => left - right)
  await expect(page.locator('.markdown h2')).toHaveCount(sections)
  console.log(
    JSON.stringify({
      profile: 'desktop-chromium-vite-dev',
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      sections,
      bodyCharacters: body.length,
      repetitions,
      inputToTwoFramesMedianMs: Number(
        durations[Math.floor(durations.length / 2)].toFixed(2),
      ),
      inputToTwoFramesP95Ms: Number(
        durations[Math.ceil(durations.length * 0.95) - 1].toFixed(2),
      ),
    }),
  )
  await context.close()
} finally {
  await browser.close()
  await server.close()
}
