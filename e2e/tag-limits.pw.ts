import { expect, test } from '@playwright/test'

test('tag limit keeps the pending entry and allows retry after removing a tag', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('标签容量检查')
  const input = page.getByRole('textbox', { name: '添加标签' })
  const removeButtons = page.getByRole('button', { name: /^移除标签 / })
  const overlong = '长'.repeat(49)
  await input.fill(overlong)
  await input.press('Enter')
  await expect(input).toHaveValue(overlong)
  await expect(page.getByRole('alert')).toContainText('单个标签最多 48 个字符')
  await expect(removeButtons).toHaveCount(0)
  await input.press('Escape')
  const tags = Array.from({ length: 23 }, (_, index) => `分类${index + 1}`)
  await input.fill(tags.join(','))
  await input.press('Enter')
  await expect(removeButtons).toHaveCount(23)

  await input.fill('新甲,新乙')
  await input.press('Enter')
  await expect(input).toHaveValue('新甲,新乙')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('最多 24 个标签')
  await expect(removeButtons).toHaveCount(23)
  await expect(page.getByRole('button', { name: '移除标签 新甲' })).toHaveCount(
    0,
  )

  await page
    .getByRole('button', { name: '移除标签 分类1', exact: true })
    .click()
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await expect(removeButtons).toHaveCount(24)
  await expect(
    page.getByRole('button', { name: '移除标签 新甲' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '移除标签 新乙' }),
  ).toBeVisible()

  await input.fill('新甲')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(removeButtons).toHaveCount(24)
  await input.fill('超出的标签')
  await input.press('Enter')
  await expect(input).toHaveValue('超出的标签')
  await input.press('Escape')
  await expect(input).toHaveValue('')
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await expect(page.locator('.save-status')).toHaveText('已保存')

  await page.reload()
  await page
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
    .filter({ hasText: '标签容量检查' })
    .click()
  await expect(removeButtons).toHaveCount(24)
  await expect(
    page.getByRole('button', { name: '移除标签 新乙' }),
  ).toBeVisible()
})
