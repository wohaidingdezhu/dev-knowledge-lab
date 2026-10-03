import { expect, test } from '@playwright/test'

test('pending invalid tags survive copy, new-card and card-selection attempts', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '未命名卡片',
  )
  await page.getByRole('textbox', { name: '卡片标题' }).fill('待修正标签保护')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  const input = page.getByRole('textbox', { name: '添加标签' })
  const pending = '长'.repeat(49)
  await input.fill(pending)
  await input.press('Enter')
  const preventsUnload = () =>
    page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })
  expect(await preventsUnload()).toBe(true)
  await page.getByRole('button', { name: '复制当前卡片' }).click()
  await expect(input).toHaveValue(pending)
  await expect(input).toBeFocused()
  if (isMobile) await page.getByRole('button', { name: '返回卡片列表' }).click()
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '待修正标签保护',
  )
  await expect(input).toHaveValue(pending)
  if (isMobile) await page.getByRole('button', { name: '返回卡片列表' }).click()
  await page.locator('#result-welcome-css-grid').click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '待修正标签保护',
  )
  await expect(input).toHaveValue(pending)
  await expect(input).toBeFocused()
  await expect(page.locator('[role="option"]')).toHaveCount(4)

  await input.fill('修正后保留的标签')
  await input.press('Enter')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  expect(await preventsUnload()).toBe(false)
  if (isMobile) await page.getByRole('button', { name: '返回卡片列表' }).click()
  await page.locator('#result-welcome-css-grid').click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).not.toHaveValue(
    '待修正标签保护',
  )
  if (isMobile) await page.getByRole('button', { name: '返回卡片列表' }).click()
  await page.getByRole('option').filter({ hasText: '待修正标签保护' }).click()
  await expect(
    page.getByRole('button', { name: '移除标签 修正后保留的标签' }),
  ).toBeVisible()
})

test('invalid pending tags stop deletion and Escape allows an intentional retry', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  const input = page.getByRole('textbox', { name: '添加标签' })
  await input.fill('长'.repeat(49))
  await input.press('Enter')
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(input).toHaveValue('长'.repeat(49))
  await expect(input).toBeFocused()
  await expect(page.locator('[role="option"]')).toHaveCount(4)
  await input.press('Escape')
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
})
