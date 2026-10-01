import { expect, test } from '@playwright/test'

test('confirming an IME candidate does not submit a tag', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  const input = page.getByRole('textbox', { name: '添加标签' })
  await input.fill('中文标签')
  for (const key of ['Enter', ',', '，']) {
    await input.dispatchEvent('keydown', { key, isComposing: true })
    await expect(input).toHaveValue('中文标签')
    await expect(
      page.getByRole('button', { name: '移除标签 中文标签' }),
    ).toHaveCount(0)
  }
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 })
  await expect(input).toHaveValue('中文标签')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(
    page.getByRole('button', { name: '移除标签 中文标签' }),
  ).toBeVisible()
})

test('confirming an IME search candidate keeps the current editor open', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop simultaneous search and editing')
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('中文搜索实验')
  const editor = page.getByRole('textbox', { name: 'Markdown 正文' })
  await expect(editor).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  const search = page.getByRole('textbox', { name: '搜索知识卡片' })
  await search.fill('中文搜索')
  await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await expect(editor).toBeVisible()
  await search.dispatchEvent('keydown', { key: 'Escape', isComposing: true })
  await expect(search).toHaveValue('中文搜索')
  await search.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 })
  await expect(editor).toBeVisible()
  await search.press('Enter')
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '中文搜索实验',
  )
})
