import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { serializeBackup } from '../src/lib/backup'
import { makeSeedCards } from '../src/lib/seeds'

test('invalid source can be rescued without changing the draft or reporting saved', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  await expect(page.getByRole('option')).toHaveCount(3)
  await page.getByRole('option').first().click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('需要保全的草稿')
  const source = page.getByRole('textbox', { name: '来源链接' })
  await source.fill('developer.mozilla.org')
  await expect(page.getByRole('alert')).toContainText('来源链接仅支持')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前内容' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.draft\.json$/)
  const recovered = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(recovered.cards).toHaveLength(3)
  expect(
    recovered.cards.find(
      (card: { title: string }) => card.title === '需要保全的草稿',
    ).source,
  ).toBe('developer.mozilla.org')
  await expect(page.locator('.toast')).toContainText('未校验草稿')
  await expect(page.locator('.save-status')).toHaveText('!未保存')
  await expect(source).toHaveValue('developer.mozilla.org')

  await source.fill('https://developer.mozilla.org')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  const normalDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份' }).click()
  expect((await normalDownload).suggestedFilename()).not.toMatch(
    /\.draft\.json$/,
  )
  await expect(page.getByRole('dialog')).toContainText('上次发起导出')
  await expect(page.getByRole('dialog')).not.toContainText('尚无记录')
  await page.reload()
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await expect(page.getByRole('dialog')).not.toContainText('尚无记录')
})

test('storage status and persistence result are visible in backup dialog', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 1024 * 1024, quota: 10 * 1024 * 1024 }),
        persisted: async () => false,
        persist: async () => true,
      },
    })
  })
  await page.goto('/')
  await expect(page.getByRole('option')).toHaveCount(3)
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('建议现在导出备份')
  await expect(dialog).toContainText('当前站点约 1.0 MiB / 配额约 10.0 MiB')
  await dialog.getByRole('button', { name: '申请持久存储' }).click()
  await expect(dialog).toContainText('浏览器已授予持久存储')
  await expect(
    dialog.getByRole('button', { name: '申请持久存储' }),
  ).toHaveCount(0)
})

test('backup reading locks competing operations and unlocks after success or error', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.text
    File.prototype.text = async function () {
      if (this.name.startsWith('slow-'))
        await new Promise<void>((resolve) =>
          window.addEventListener('release-backup-read', () => resolve(), {
            once: true,
          }),
        )
      return original.call(this)
    }
  })
  await page.goto('/')
  await expect(page.getByRole('option')).toHaveCount(3)
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  const input = page.getByLabel('选择 JSON 或 ZIP 备份文件')
  const file = (name: string, text: string) => ({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  const cards = makeSeedCards()
  await input.setInputFiles(
    file('slow-A.json', serializeBackup(cards.slice(0, 1))),
  )
  await expect(input).toBeDisabled()
  await expect(page.getByRole('button', { name: '正在准备…' })).toBeDisabled()
  await page.evaluate(() =>
    window.dispatchEvent(new Event('release-backup-read')),
  )
  await expect(page.locator('.import-preview')).toContainText('共 1 张卡片')
  await expect(input).toBeEnabled()
  await input.setInputFiles(file('B.json', serializeBackup(cards.slice(0, 2))))
  await expect(page.locator('.file-drop')).toContainText('B.json')
  await expect(page.locator('.import-preview')).toContainText('共 2 张卡片')
  await input.setInputFiles(file('slow-invalid.json', '{}'))
  await expect(input).toBeDisabled()
  await page.evaluate(() =>
    window.dispatchEvent(new Event('release-backup-read')),
  )
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  await expect(input).toBeEnabled()
  await expect(page.getByRole('button', { name: '导出备份' })).toBeEnabled()
  await expect(page.locator('.import-preview')).toHaveCount(0)
})
