import { chromium, devices, expect } from '@playwright/test'
import { createServer } from 'vite'

const server = await createServer({
  server: { host: '127.0.0.1', port: 5275, strictPort: true },
})
await server.listen()
const browser = await chromium.launch()
try {
  for (const [profile, device] of [
    ['desktop', devices['Desktop Chrome']],
    ['mobile-emulation', devices['Pixel 7']],
  ]) {
    const context = await browser.newContext(device)
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5275/')
    for (const size of [100, 1000, 5000]) {
      const result = await page.evaluate(async (count) => {
        const { searchCards } = await import('/src/lib/search.ts')
        const now = '2026-01-01T00:00:00.000Z'
        const cards = Array.from({ length: count }, (_, index) => ({
          id: String(index),
          title: `Card ${index}`,
          body: `${'Markdown text and notes. '.repeat(Math.ceil([300, 2000, 8000][index % 3] / 25))}${index % 10 === 0 ? 'browser-cache-needle' : ''}`,
          tags: [index % 5 === 0 ? 'browser' : 'javascript'],
          source: '',
          html: '',
          css: '',
          js: index % 7 === 0 ? 'console.log("search")' : '',
          createdAt: now,
          updatedAt: now,
          revision: 1,
        }))
        const measure = (query) => {
          for (let index = 0; index < 5; index++)
            searchCards(cards, query, null)
          const durations = []
          for (let index = 0; index < 20; index++) {
            const start = performance.now()
            searchCards(cards, query, null)
            durations.push(performance.now() - start)
          }
          durations.sort((left, right) => left - right)
          return {
            medianMs: Number(durations[10].toFixed(2)),
            p95Ms: Number(durations[18].toFixed(2)),
          }
        }
        return {
          cards: count,
          query: measure('browser-cache-needle'),
          empty: measure(''),
        }
      }, size)
      await page.evaluate(async (count) => {
        const request = indexedDB.open('dev-knowledge-lab')
        const database = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const transaction = database.transaction('cards', 'readwrite')
        const store = transaction.objectStore('cards')
        const now = '2026-01-01T00:00:00.000Z'
        store.clear()
        for (let index = 0; index < count; index++) {
          store.put({
            id: `browser-bench-${index}`,
            title: `Card ${index}`,
            body: `${'Markdown text and notes. '.repeat(Math.ceil([300, 2000, 8000][index % 3] / 25))}${index % 10 === 0 ? 'browser-cache-needle' : ''}`,
            tags: [],
            source: '',
            html: '',
            css: '',
            js: '',
            createdAt: now,
            updatedAt: now,
            revision: 1,
          })
        }
        await new Promise((resolve, reject) => {
          transaction.oncomplete = resolve
          transaction.onerror = () => reject(transaction.error)
        })
        database.close()
      }, size)
      await page.reload()
      await expect(
        page
          .getByRole('listbox', { name: '知识卡片搜索结果' })
          .getByRole('option'),
      ).toHaveCount(Math.min(size, 100))
      await page.evaluate(() => {
        const list = document.getElementById('search-results')
        const input = document.querySelector('input[aria-label="搜索知识卡片"]')
        window.__searchTiming = { start: 0, end: 0 }
        input.addEventListener(
          'input',
          () => {
            window.__searchTiming.start = performance.now()
          },
          { capture: true, once: true },
        )
        const observer = new MutationObserver(() => {
          if (
            window.__searchTiming.start &&
            list.textContent.includes('browser-cache-needle')
          ) {
            window.__searchTiming.end = performance.now()
            observer.disconnect()
          }
        })
        observer.observe(list, {
          childList: true,
          subtree: true,
          characterData: true,
        })
      })
      await page
        .getByRole('textbox', { name: '搜索知识卡片' })
        .fill('browser-cache-needle')
      await page.waitForFunction(() => window.__searchTiming.end > 0)
      const ui = await page.evaluate(() => ({
        inputToResultMs: Number(
          (window.__searchTiming.end - window.__searchTiming.start).toFixed(2),
        ),
        visibleResults: document.querySelectorAll(
          '#search-results [role=option]',
        ).length,
      }))
      const cdp = await context.newCDPSession(page)
      await cdp.send('Performance.enable')
      const { metrics } = await cdp.send('Performance.getMetrics')
      ui.heapMiB = Number(
        (
          (metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ||
            0) /
          1024 /
          1024
        ).toFixed(1),
      )
      await cdp.detach()
      console.log(JSON.stringify({ profile, ...result, ui }))
    }
    await context.close()
  }
} finally {
  await browser.close()
  await server.close()
}
