import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const server = await createServer({
  server: { host: '127.0.0.1', port: 5276, strictPort: true },
})
await server.listen()
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5276/')
  for (const count of [1000, 5000]) {
    const result = await page.evaluate(async (count) => {
      const { KnowledgeDB } = await import('/src/lib/db.ts')
      const database = new KnowledgeDB(`batch-benchmark-${crypto.randomUUID()}`)
      try {
        const now = new Date().toISOString()
        const cards = Array.from({ length: count }, (_, index) => ({
          id: `batch-${index}`,
          title: `卡片 ${index}`,
          body: '一段用于测量批量整理的正文。',
          tags: [],
          source: '',
          html: '',
          css: '',
          js: '',
          createdAt: now,
          updatedAt: now,
          revision: 1,
        }))
        await database.cards.bulkAdd(cards)
        await database.metadata.put({ key: 'initialized', value: now })
        const selection = cards.map(({ id, revision }) => ({ id, revision }))
        const generation = (await database.readWorkspace()).generation
        const start = performance.now()
        const changed = await database.batchTag(
          selection,
          'add',
          '批量测量',
          generation,
        )
        const elapsedMs = Number((performance.now() - start).toFixed(1))
        return {
          count,
          changed,
          elapsedMs,
          history: await database.history.count(),
        }
      } finally {
        await database.delete()
      }
    }, count)
    console.log(JSON.stringify(result))
  }
} finally {
  await browser.close()
  await server.close()
}
