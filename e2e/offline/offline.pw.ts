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
  await reopened
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
    .filter({ hasText: '离线重开 E2E' })
    .click()
  await reopened
    .getByRole('textbox', { name: '卡片标题' })
    .fill('离线重开并修改 E2E')
  await expect(
    reopened.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await reopened.reload()
  await expect(
    reopened
      .getByRole('listbox', { name: '知识卡片搜索结果' })
      .getByRole('option')
      .filter({ hasText: '离线重开并修改 E2E' }),
  ).toBeVisible()
})

test('a returning visitor can browse, add and run a knowledge lesson offline', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/')
  await reopened.getByRole('button', { name: /前端知识内容包/ }).click()
  const dialog = reopened.getByRole('dialog')
  await dialog.getByRole('button', { name: '清空选择', exact: true }).click()
  await dialog.getByLabel('筛选知识主题').selectOption('Web API')
  await dialog.getByLabel('搜索知识内容').fill('请求错误')
  await dialog.getByRole('button', { name: /^预览：请求错误/ }).click()
  await expect(dialog.getByRole('heading', { name: '离线实验' })).toBeVisible()
  await expect(reopened.locator('iframe')).toHaveCount(0)
  await dialog.getByRole('button', { name: '关闭笔记预览' }).click()
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '添加 1 张知识卡片' }).click()
  await expect(dialog).toHaveCount(0)
  await reopened
    .getByRole('button', { name: '代码实验室', exact: true })
    .click()
  await reopened.getByRole('button', { name: '运行代码' }).click()
  const frame = reopened.frameLocator('iframe')
  await frame.getByRole('button', { name: '模拟 HTTP 404' }).click()
  await expect(frame.locator('#status')).toHaveText('读取失败：HTTP 404')
  await frame.getByRole('button', { name: '模拟成功' }).click()
  await expect(frame.locator('#status')).toHaveText('读取成功：笔记')
  await reopened
    .getByRole('textbox', { name: '卡片标题' })
    .fill('我的离线响应处理笔记')
  await expect(reopened.locator('.save-status')).toHaveText('已保存')
  await reopened.reload()
  await expect(reopened.getByRole('listbox').getByRole('option')).toHaveCount(4)
  await reopened
    .getByRole('listbox')
    .getByRole('option')
    .filter({ hasText: '我的离线响应处理笔记' })
    .click()
  await expect(reopened.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '我的离线响应处理笔记',
  )
  await reopened
    .getByRole('button', { name: '代码实验室', exact: true })
    .click()
  await expect(reopened.locator('iframe')).toHaveCount(0)
})
