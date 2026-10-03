import { expect, test } from '@playwright/test'

test('reopening restores selection, sort and per-card language with separate demo preferences', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: '卡片排序' }).selectOption('title')
  await page.locator('#result-welcome-css-grid').click()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page.getByRole('tab', { name: 'CSS', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('combobox', { name: '卡片排序' })).toHaveValue(
    'title',
  )
  await expect(
    page.getByRole('listbox').getByRole('option', { selected: true }),
  ).toHaveAttribute('id', 'result-welcome-css-grid')
  if (isMobile) await page.locator('#result-welcome-css-grid').click()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await expect(
    page.getByRole('tab', { name: 'CSS', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('iframe')).toHaveCount(0)

  await page.goto('/?demo=1')
  await expect(page.getByRole('combobox', { name: '卡片排序' })).toHaveValue(
    'updated-desc',
  )
  await page.locator('#result-welcome-css-grid').click()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await expect(
    page.getByRole('tab', { name: 'HTML', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.goto('/')
  await expect(page.getByRole('combobox', { name: '卡片排序' })).toHaveValue(
    'title',
  )
  await expect(
    page.getByRole('listbox').getByRole('option', { selected: true }),
  ).toHaveAttribute('id', 'result-welcome-css-grid')
})

test('denied preference storage does not prevent saving and reopening cards', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new DOMException('Preference access denied', 'SecurityError')
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('偏好禁用仍可保存')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  await page.reload()
  await expect(
    page.getByRole('option').filter({ hasText: '偏好禁用仍可保存' }),
  ).toHaveCount(1)
  await expect(page.locator('.error-banner')).toHaveCount(0)
})
