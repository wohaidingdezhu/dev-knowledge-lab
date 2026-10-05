import { expect, test, type Page, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { makeSeedCards } from '../src/lib/seeds'
import { createWorkspaceBackupFile } from '../src/lib/workspaceBackup'

async function loadCards(page: Page, isMobile: boolean, count: number) {
  const seed = makeSeedCards()[0]
  const cards = Array.from({ length: count }, (_, index) => ({
    ...seed,
    id: `navigation-${index}`,
    title: `导航测试 ${String(index).padStart(3, '0')}`,
    body: '可使用键盘浏览的笔记',
    html: '',
    css: '',
    js: '',
    updatedAt: new Date(Date.UTC(2026, 9, 4, 0, 0, index)).toISOString(),
    createdAt: '2026-10-01T00:00:00.000Z',
  }))
  const file = await createWorkspaceBackupFile({
    cards,
    history: [],
    trash: [],
  })
  await page.goto('/')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: 'navigation.json',
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
  return page.getByRole('listbox', { name: '知识卡片搜索结果' })
}

async function expectInsideList(item: Locator, list: Locator) {
  await expect
    .poll(async () => {
      const row = await item.boundingBox()
      const viewport = await list.boundingBox()
      return Boolean(
        row &&
        viewport &&
        row.y >= viewport.y - 2 &&
        row.y + row.height <= viewport.y + viewport.height + 2,
      )
    })
    .toBe(true)
}

test('search arrows reveal the active result across pagination without moving focus', async ({
  page,
  isMobile,
}) => {
  const list = await loadCards(page, isMobile, 125)
  const search = page.getByRole('textbox', { name: '搜索知识卡片' })
  await search.fill('导航测试')
  await expect(list.getByRole('option')).toHaveCount(100)
  const initialY = (await search.boundingBox())!.y
  for (let index = 0; index < 105; index++) await search.press('ArrowDown')
  const activeId = (await search.getAttribute('aria-activedescendant'))!
  const active = page.locator(`[id="${activeId}"]`)
  await expect(list.getByRole('option')).toHaveCount(106)
  await expect(active).toContainText('导航测试 019')
  await expect(active).toHaveClass(/keyboard-current/)
  await expect(search).toBeFocused()
  await expectInsideList(active, list)
  expect((await search.boundingBox())!.y).toBe(initialY)
  await search.press('ArrowUp')
  await expect(list.getByRole('option')).toHaveCount(106)
  await search.press('Enter')
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '导航测试 020',
  )
})

test('the card list has one Tab stop and arrows cross the loaded boundary', async ({
  page,
  isMobile,
}, testInfo) => {
  const list = await loadCards(page, isMobile, 125)
  const options = list.getByRole('option')
  await expect(list.locator('[role="option"][tabindex="0"]')).toHaveCount(1)
  await options.nth(99).focus()
  await options.nth(99).press('ArrowDown')
  await expect(options).toHaveCount(101)
  await expect(options.nth(100)).toBeFocused()
  await expectInsideList(options.nth(100), list)
  await options.nth(100).press('ArrowUp')
  await expect(options.nth(99)).toBeFocused()
  await expect(list.locator('[role="option"][tabindex="0"]')).toHaveCount(1)
  // WebKit's default keyboard policy uses Option+Tab to include buttons.
  const forwardTab = testInfo.project.name === 'webkit' ? 'Alt+Tab' : 'Tab'
  const backwardTab =
    testInfo.project.name === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab'
  await options.nth(99).press(forwardTab)
  await expect(page.getByRole('button', { name: /加载更多/ })).toBeFocused()
  await page.getByRole('button', { name: /加载更多/ }).press(backwardTab)
  await expect(options.nth(99)).toBeFocused()
  await page.getByRole('button', { name: '批量整理', exact: true }).click()
  await options.nth(99).focus()
  await options.nth(99).press('Space')
  await expect(options.nth(99)).toHaveAttribute('aria-selected', 'true')
  await options.first().focus()
  const activeId = await options.first().getAttribute('id')
  await page.getByRole('combobox', { name: '卡片排序' }).selectOption('title')
  await expect(page.locator('.list-toolbar')).toContainText('按标题')
  await expect(options).toHaveCount(125)
  await expect(list.locator('[role="option"][tabindex="0"]')).toHaveAttribute(
    'id',
    activeId!,
  )
})

test('result reordering preserves the current card and removal chooses a nearby result', async ({
  page,
  isMobile,
}) => {
  const list = await loadCards(page, isMobile, 6)
  const search = page.getByRole('textbox', { name: '搜索知识卡片' })
  await search.focus()
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    'result-navigation-5',
  )
  await search.press('ArrowDown')
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    'result-navigation-4',
  )
  await search.fill('导航测试')
  await search.press('ArrowDown')
  await search.press('ArrowDown')
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    'result-navigation-3',
  )
  const other = await page.context().newPage()
  await other.goto('/')
  await other.locator('#result-navigation-0').click()
  await other
    .getByRole('textbox', { name: '卡片标题' })
    .fill('导航测试 更新到最前')
  await expect(other.locator('.save-status')).toHaveText('已保存')
  await expect(list.getByRole('option').first()).toContainText('更新到最前')
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    'result-navigation-3',
  )
  await search.press('Enter')
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '导航测试 003',
  )
  if (isMobile)
    await page
      .getByRole('button', { name: '返回卡片列表', exact: true })
      .click()
  await search.focus()
  await other.getByRole('button', { name: '删除当前卡片' }).click()
  await other.getByRole('button', { name: '确认删除' }).click()
  await expect(list.getByRole('option')).toHaveCount(5)
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    'result-navigation-3',
  )
  await other.locator('#result-navigation-3').click()
  await other.getByRole('button', { name: '删除当前卡片' }).click()
  await other.getByRole('button', { name: '确认删除' }).click()
  await expect(list.getByRole('option')).toHaveCount(4)
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    'result-navigation-2',
  )
  await search.fill('无匹配的新查询')
  await expect(list.getByRole('option')).toHaveCount(0)
  await expect(search).not.toHaveAttribute('aria-activedescendant')
  await search.press('ArrowDown')
  await search.press('Enter')
  await search.fill('导航测试')
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    'result-navigation-5',
  )
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map(({ target }) => target),
    })),
  ).toEqual([])
  await other.close()
})
