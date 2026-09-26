import { expect, test } from '@playwright/test'

test('a returning visitor can reopen and edit cards without network', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('离线重开 E2E')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await context.setOffline(true)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/')
  await reopened.getByRole('option').filter({ hasText: '离线重开 E2E' }).click()
  await reopened
    .getByRole('textbox', { name: '卡片标题' })
    .fill('离线重开并修改 E2E')
  await expect(
    reopened.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await reopened.reload()
  await expect(
    reopened.getByRole('option').filter({ hasText: '离线重开并修改 E2E' }),
  ).toBeVisible()
})
