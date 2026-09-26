import { mkdir } from 'node:fs/promises'
import { chromium, devices, expect } from '@playwright/test'
import { createServer } from 'vite'

const server = await createServer({
  server: { host: '127.0.0.1', port: 5276, strictPort: true },
})
await server.listen()
const browser = await chromium.launch()
await mkdir('docs/screenshots', { recursive: true })
try {
  const desktop = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  })
  const desktopPage = await desktop.newPage()
  await desktopPage.goto('http://127.0.0.1:5276/?demo=1')
  await expect(desktopPage.getByRole('option')).toHaveCount(3)
  await desktopPage.screenshot({ path: 'docs/screenshots/desktop.png' })
  await desktop.close()

  const mobile = await browser.newContext(devices['Pixel 7'])
  const mobilePage = await mobile.newPage()
  await mobilePage.goto('http://127.0.0.1:5276/?demo=1')
  await expect(mobilePage.getByRole('option')).toHaveCount(3)
  await mobilePage.screenshot({ path: 'docs/screenshots/mobile-list.png' })
  await mobilePage.getByRole('option').first().click()
  await mobilePage.screenshot({ path: 'docs/screenshots/mobile-detail.png' })
  await mobile.close()
} finally {
  await browser.close()
  await server.close()
}
