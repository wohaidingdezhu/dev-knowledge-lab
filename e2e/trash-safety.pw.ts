import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { makeSeedCards } from '../src/lib/seeds'
import { createWorkspaceBackupFile } from '../src/lib/workspaceBackup'

const recycled = {
  ...makeSeedCards()[0],
  id: 'recycled-card',
  title: '旧删除卡片',
  body: '需要核对的已删除正文',
  html: '<img src="https://example.invalid/test" onerror="window.trashExecuted=true">',
  js: 'window.trashExecuted = true',
}

async function openTrash(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  return page.getByRole('dialog', { name: '回收站', exact: true })
}

async function loadRecycled(page: Page, isMobile: boolean) {
  const file = await createWorkspaceBackupFile({
    cards: [makeSeedCards()[1]],
    history: [],
    trash: [{ id: recycled.id, card: recycled, deletedAt: recycled.updatedAt }],
  })
  await page.goto('/')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: 'recycled.json',
    mimeType: 'application/json',
    buffer: Buffer.from(await file.data.arrayBuffer()),
  })
  await page
    .getByRole('button', { name: '恢复完整工作区', exact: true })
    .click()
  await page
    .getByRole('button', { name: '确认替换并完整恢复', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The mobile navigation remains open after the backup dialog closes.
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  return page.getByRole('dialog', { name: '回收站', exact: true })
}

async function recycleElsewhere(page: Page, isMobile: boolean) {
  const other = await page.context().newPage()
  await other.goto('/')
  const trash = await openTrash(other, isMobile)
  await trash.getByRole('button', { name: '恢复卡片', exact: true }).click()
  await expect(other.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    recycled.title,
  )
  await other
    .getByRole('textbox', { name: '卡片标题' })
    .fill('其他页面的新删除内容')
  await expect(other.locator('.save-status')).toHaveText('已保存')
  await other.getByRole('button', { name: '删除当前卡片' }).click()
  await other.getByRole('button', { name: '确认删除' }).click()
  await expect(other.getByRole('dialog')).toHaveCount(0)
  await expect(other.locator('.toast')).toContainText('卡片已删除')
  return other
}

test('recycled content can be inspected safely without restoring or rendering code', async ({
  page,
  isMobile,
}) => {
  const trash = await loadRecycled(page, isMobile)
  const trigger = trash.getByRole('button', { name: '查看内容', exact: true })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trash.getByLabel('已删除卡片内容')).toHaveCount(0)
  await trigger.click()
  const preview = trash.getByLabel('已删除卡片内容')
  const textArea = preview.locator('pre')
  await textArea.focus()
  await textArea.press('PageDown')
  await expect
    .poll(() => textArea.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
  for (const text of [
    recycled.body,
    recycled.html,
    recycled.css,
    recycled.js,
    recycled.source,
  ])
    await expect(preview).toContainText(text)
  await expect(
    trash.getByRole('button', { name: '收起', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true')
  await expect(preview.locator('script, img, iframe')).toHaveCount(0)
  expect(
    await page.evaluate(
      () => (window as Window & { trashExecuted?: boolean }).trashExecuted,
    ),
  ).toBeUndefined()
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    accessibility.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map(({ target }) => target),
    })),
  ).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth === innerWidth,
    ),
  ).toBe(true)
  await trash.getByRole('button', { name: '收起', exact: true }).click()
  await expect(preview).toHaveCount(0)
  await trash.getByRole('button', { name: '刷新回收站', exact: true }).click()
  await expect(trash).toContainText(recycled.title)
  await expect(
    trash.getByRole('button', { name: '查看内容', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false')
})

for (const action of ['restore', 'purge'] as const) {
  test(`stale recycle-bin ${action} stops and can retry after refreshing`, async ({
    page,
    isMobile,
  }) => {
    const trash = await loadRecycled(page, isMobile)
    if (action === 'purge')
      await trash.getByRole('button', { name: '永久删除', exact: true }).click()
    const other = await recycleElsewhere(page, isMobile)
    const dialog = page.getByRole('dialog')
    await dialog
      .getByRole('button', {
        name: action === 'restore' ? '恢复卡片' : '永久删除',
        exact: true,
      })
      .click()
    await expect(dialog.getByRole('alert')).toContainText('刷新回收站')
    await dialog
      .getByRole('button', { name: '刷新回收站', exact: true })
      .click()
    await expect(trash).toContainText('其他页面的新删除内容')
    await expect(trash.getByRole('alert')).toHaveCount(0)
    await trash.getByRole('button', { name: '查看内容', exact: true }).click()
    await expect(trash.getByLabel('已删除卡片内容')).toContainText(
      '其他页面的新删除内容',
    )
    if (action === 'restore') {
      await trash.getByRole('button', { name: '恢复卡片', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
        '其他页面的新删除内容',
      )
      await page.getByRole('button', { name: '查看卡片历史版本' }).click()
      await expect(page.getByRole('dialog')).toContainText(recycled.title)
    } else {
      await trash.getByRole('button', { name: '永久删除', exact: true }).click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: '永久删除', exact: true })
        .click()
      await expect(trash).toContainText('回收站是空的')
    }
    await other.close()
  })
}
