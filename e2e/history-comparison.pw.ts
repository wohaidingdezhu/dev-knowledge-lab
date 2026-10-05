import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { makeSeedCards } from '../src/lib/seeds'
import type { Card } from '../src/lib/types'
import { createWorkspaceBackupFile } from '../src/lib/workspaceBackup'

async function loadHistory(
  page: Page,
  isMobile: boolean,
  old: Card,
  current: Card,
) {
  const file = await createWorkspaceBackupFile({
    cards: [current],
    history: [
      {
        id: 'comparison-old',
        cardId: current.id,
        card: old,
        recordedAt: old.updatedAt,
      },
      {
        id: 'comparison-same',
        cardId: current.id,
        card: current,
        recordedAt: current.updatedAt,
      },
    ],
    trash: [],
  })
  await page.goto('/')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: 'comparison.json',
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
  if (isMobile) await page.getByRole('button', { name: '关闭导航' }).click()
  await page.getByRole('listbox').getByRole('option').click()
  await page.getByRole('button', { name: '查看卡片历史版本' }).click()
  await expect(
    page.getByRole('button', { name: '查看内容', exact: true }),
  ).toHaveCount(2)
}

test('history comparison shows changed fields and safe source text before restoration', async ({
  page,
  isMobile,
}) => {
  const old = {
    ...makeSeedCards()[0],
    id: 'comparison-card',
    title: '旧卡片',
    body: '历史正文',
    tags: ['CSS', '旧标签'],
    source: 'https://example.com/old',
    html: '<img src="https://example.invalid/test" onerror="window.comparisonExecuted=true">',
    css: '.old {}',
    js: 'window.comparisonExecuted = true',
  }
  const current = {
    ...old,
    title: '当前卡片',
    body: '当前正文',
    tags: ['CSS', '新标签'],
    source: 'https://example.com/new',
    html: '<p>新代码</p>',
    css: '',
    js: '',
    revision: 2,
  }
  await loadHistory(page, isMobile, old, current)
  const row = page.locator('.recovery-item').filter({ hasText: '旧卡片' })
  await row.getByRole('button', { name: '查看内容', exact: true }).click()
  const comparison = page.getByRole('region', {
    name: '历史版本与当前内容对比',
  })
  await expect(comparison).toContainText('7 个字段与当前内容不同')
  await expect(comparison).toContainText('当前新增：新标签')
  await expect(comparison).toContainText('当前移除：旧标签')
  const body = comparison.getByRole('region', { name: '正文差异', exact: true })
  await expect(body.locator('.comparison-before')).toHaveText('历史')
  await expect(body.locator('.comparison-after')).toHaveText('当前')
  const html = comparison.getByRole('region', { name: 'HTML差异', exact: true })
  await expect(html.locator('pre').first()).toContainText(old.html)
  await expect(comparison.locator('img, iframe, script')).toHaveCount(0)
  expect(
    await page.evaluate(
      () =>
        (window as Window & { comparisonExecuted?: boolean })
          .comparisonExecuted,
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
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }))
  expect(widths.page).toBe(widths.viewport)
  if (isMobile) {
    const columns = body.locator('.restore-comparison > div')
    expect((await columns.nth(0).boundingBox())!.x).toBe(
      (await columns.nth(1).boundingBox())!.x,
    )
  }
  await row.getByRole('button', { name: '恢复此版本', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    old.title,
  )
  await page.getByRole('button', { name: '查看卡片历史版本' }).click()
  await expect(page.getByRole('dialog')).toContainText(current.title)
})

test('long history previews focus late changes and full content loads only on request', async ({
  page,
  isMobile,
}) => {
  const prefix = '相同正文\n'.repeat(40000)
  const suffix = '\n相同后文'.repeat(10000)
  const old = {
    ...makeSeedCards()[0],
    id: 'comparison-card',
    title: '长正文',
    body: prefix + '历史段' + suffix,
  }
  const current = { ...old, body: prefix + '当前段' + suffix, revision: 2 }
  await loadHistory(page, isMobile, old, current)
  await page
    .getByRole('button', { name: '查看内容', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('region', { name: '历史版本与当前内容对比' }),
  ).toContainText('与当前内容相同')
  await page
    .getByRole('button', { name: '查看内容', exact: true })
    .last()
    .click()
  const comparison = page.getByRole('region', {
    name: '历史版本与当前内容对比',
  })
  await expect(comparison).toContainText('1 个字段与当前内容不同')
  await expect(comparison.locator('.comparison-before')).toHaveText('历史')
  await expect(comparison.locator('.comparison-after')).toHaveText('当前')
  await expect(comparison).toContainText('前文已省略')
  await expect(comparison).toContainText('后文已省略')
  for (const text of await comparison
    .locator('.restore-comparison pre')
    .allTextContents())
    expect(text.length).toBeLessThanOrEqual(6000)
  await expect(comparison.locator('.recovery-preview')).toHaveCount(0)
  await comparison.getByText('查看完整历史内容', { exact: true }).click()
  await expect(comparison.locator('.recovery-preview')).toContainText(old.body)
  await comparison.getByText('查看完整历史内容', { exact: true }).click()
  await expect(comparison.locator('.recovery-preview')).toHaveCount(0)
})

for (const mode of ['changed', 'removed'] as const) {
  test(`history restoration stops when the previewed snapshot is ${mode} in another page`, async ({
    page,
    isMobile,
  }) => {
    const old = {
      ...makeSeedCards()[0],
      id: 'comparison-card',
      title: '历史目标',
      body: '原来的历史正文',
    }
    const current = {
      ...old,
      title: '当前卡片',
      body: '当前正文保持不变',
      revision: 2,
    }
    await loadHistory(page, isMobile, old, current)
    const row = page.locator('.recovery-item').filter({ hasText: old.title })
    await row.getByRole('button', { name: '查看内容', exact: true }).click()
    await expect(row).toContainText(old.body)

    const changedBody = '备份替换后的历史正文'
    const history = [
      {
        id: 'comparison-same',
        cardId: current.id,
        card: current,
        recordedAt: current.updatedAt,
      },
    ]
    if (mode === 'changed')
      history.push({
        id: 'comparison-old',
        cardId: current.id,
        card: { ...old, body: changedBody },
        recordedAt: old.updatedAt,
      })
    const file = await createWorkspaceBackupFile({
      cards: [current],
      history,
      trash: [],
    })
    const other = await page.context().newPage()
    await other.goto('/')
    if (isMobile) await other.getByRole('button', { name: '打开导航' }).click()
    await other.getByRole('button', { name: '导入与备份' }).click()
    await other.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
      name: 'changed-history.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await file.data.arrayBuffer()),
    })
    await other
      .getByRole('button', { name: '恢复完整工作区', exact: true })
      .click()
    await other
      .getByRole('button', { name: '确认替换并完整恢复', exact: true })
      .click()
    await expect(other.getByRole('dialog')).toHaveCount(0)
    await row.getByRole('button', { name: '恢复此版本', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '历史版本', exact: true })
    await expect(dialog.getByRole('alert')).toContainText('刷新历史版本')
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      audit.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      })),
    ).toEqual([])
    await dialog
      .getByRole('button', { name: '刷新历史版本', exact: true })
      .click()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    if (mode === 'changed') {
      await row.getByRole('button', { name: '查看内容', exact: true }).click()
      await expect(row).toContainText(changedBody)
      await row.getByRole('button', { name: '恢复此版本', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(
        page
          .getByRole('region', { name: '卡片详情' })
          .getByText(changedBody, { exact: true }),
      ).toBeVisible()
    } else {
      await expect(dialog.locator('.recovery-item')).toHaveCount(1)
      await expect(dialog).not.toContainText(old.title)
      await dialog
        .getByRole('button', { name: '关闭弹窗', exact: true })
        .click()
      await expect(
        page
          .getByRole('region', { name: '卡片详情' })
          .getByText(current.body, { exact: true }),
      ).toBeVisible()
    }
    await other.close()
  })
}
