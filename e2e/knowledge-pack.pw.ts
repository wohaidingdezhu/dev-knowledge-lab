import { expect, test } from '@playwright/test'

test('knowledge pack can be added once without changing existing cards', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await expect(page.getByRole('option')).toHaveCount(3)
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  await expect(page.getByRole('dialog')).toContainText(
    '闭包：让每个计数器记住自己的状态',
  )
  await page.getByRole('button', { name: '添加 10 张知识卡片' }).click()
  if (isMobile) await page.getByRole('button', { name: '返回卡片列表' }).click()
  await expect(page.getByRole('option')).toHaveCount(13)
  if (isMobile)
    await page
      .getByRole('option')
      .filter({ hasText: '闭包：让每个计数器记住自己的状态' })
      .click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '闭包：让每个计数器记住自己的状态',
  )

  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page.getByRole('button', { name: '运行代码' }).click()
  const preview = page.frameLocator('iframe')
  await preview.getByRole('button', { name: '茶：0' }).click()
  await preview.getByRole('button', { name: '咖啡：0' }).click()
  await preview.getByRole('button', { name: '茶：1' }).click()
  await expect(preview.getByRole('button', { name: '茶：2' })).toBeVisible()
  await expect(preview.getByRole('button', { name: '咖啡：1' })).toBeVisible()

  await page.reload()
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await expect(page.getByRole('option')).toHaveCount(13)
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  await expect(page.getByRole('button', { name: '已全部加入' })).toBeDisabled()
})
