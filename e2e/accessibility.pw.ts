import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('main view and backup dialog have accessible structure', async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    'Desktop accessibility scan; mobile workflow is covered separately',
  )
  await page.goto('/')
  await expect(page.getByRole('option')).toHaveCount(3)
  const main = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    main.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([])

  const trigger = page.getByRole('button', { name: '导入与备份' })
  await trigger.focus()
  await trigger.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  const dialog = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    dialog.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([])
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'HTML 代码' })).toBeVisible()
  const lab = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    lab.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([])
})

test('keyboard can create, find, run, open backup and delete', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop keyboard sequence')
  await page.goto('/')
  await expect(page.getByRole('option')).toHaveCount(3)
  const newButton = page.getByRole('button', { name: '新建知识卡片' })
  await newButton.focus()
  await page.keyboard.press('Enter')
  const title = page.getByRole('textbox', { name: '卡片标题' })
  await expect(title).toBeFocused()
  await title.fill('键盘操作 E2E')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const search = page.getByRole('textbox', { name: '搜索知识卡片' })
  await expect(search).toBeFocused()
  await search.fill('键盘操作 E2E')
  await search.press('Enter')
  const lab = page.getByRole('button', { name: '代码实验室', exact: true })
  await lab.focus()
  await page.keyboard.press('Enter')
  const editor = page.getByRole('textbox', { name: 'HTML 代码' })
  await editor.fill('<p>键盘运行</p>')
  await editor.press('ControlOrMeta+Enter')
  await expect(page.frameLocator('iframe').getByText('键盘运行')).toBeVisible()
  const backup = page.getByRole('button', { name: '导入与备份' })
  await backup.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(backup).toBeFocused()
  const remove = page.getByRole('button', { name: '删除当前卡片' })
  await remove.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '确认删除' }).press('Enter')
  await expect(
    page.getByRole('option').filter({ hasText: '键盘操作 E2E' }),
  ).toHaveCount(0)
})
