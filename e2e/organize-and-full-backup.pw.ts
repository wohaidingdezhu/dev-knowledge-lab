import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('copy, pin, sort and merge tags keep original notes intact', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop organization flow')
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('整理实验')
  await page.getByRole('textbox', { name: '添加标签' }).fill('待整理')
  await page.getByRole('textbox', { name: '添加标签' }).press('Enter')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '置顶卡片' }).click()
  await expect(page.getByRole('button', { name: '取消置顶卡片' })).toBeVisible()
  await page.getByRole('button', { name: '复制当前卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '整理实验（副本）',
  )
  await page.getByRole('textbox', { name: '卡片标题' }).fill('独立实验')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.getByRole('combobox', { name: '卡片排序' }).selectOption('title')
  await expect(
    page
      .getByRole('listbox', { name: '知识卡片搜索结果' })
      .getByRole('option')
      .first(),
  ).toContainText('整理实验')
  await page.getByRole('button', { name: '整理', exact: true }).click()
  await page.getByRole('combobox', { name: '原标签' }).selectOption('待整理')
  await page.getByRole('textbox', { name: '改为' }).fill('已归档')
  await page.getByRole('button', { name: '更新标签' }).click()
  const tags = page.getByRole('navigation', { name: '标签筛选' })
  await expect(tags.getByRole('button', { name: /已归档/ })).toBeVisible()
  await expect(tags.getByRole('button', { name: /待整理/ })).toHaveCount(0)
  await page.reload()
  await expect(
    page
      .getByRole('listbox', { name: '知识卡片搜索结果' })
      .getByRole('option')
      .first(),
  ).toContainText('整理实验')
})

test('full archive restores cards, versions, trash and pins', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop recovery flow')
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('完整归档卡片')
  await page.getByRole('textbox', { name: 'Markdown 正文' }).fill('归档前版本')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.getByRole('textbox', { name: 'Markdown 正文' }).fill('归档时版本')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '置顶卡片' }).click()
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('归档回收站卡片')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()

  await page.getByRole('button', { name: '导入与备份' }).click()
  await expect(page.getByText('本地存储')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出完整归档' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await page.getByRole('option').filter({ hasText: '完整归档卡片' }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Markdown 正文' })
    .fill('归档后的修改')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()

  await page.getByRole('button', { name: '导入与备份' }).click()
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/zip',
    buffer: await readFile(await download.path()),
  })
  await expect(page.getByText(/校验通过：4 张卡片/)).toBeVisible()
  await page.getByRole('button', { name: '恢复完整归档…' }).click()
  await page.getByRole('button', { name: '确认替换并恢复' }).click()
  await page.getByRole('option').filter({ hasText: '完整归档卡片' }).click()
  await expect(page.getByRole('button', { name: '取消置顶卡片' })).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Markdown 正文' }),
  ).toContainText('归档时版本')
  await page.getByRole('button', { name: '查看卡片历史版本' }).click()
  await page.getByRole('button', { name: '查看内容' }).first().click()
  await expect(page.getByRole('dialog')).toContainText('版本 1')
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await page.getByRole('button', { name: '回收站' }).click()
  await expect(page.getByRole('dialog')).toContainText('归档回收站卡片')
})

test('full archive restore stops if another page changes a pin after preview', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop multi-tab recovery flow')
  await page.goto('/')
  await page.getByRole('button', { name: '导入与备份' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出完整归档' }).click()
  const download = await downloadPromise
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/zip',
    buffer: await readFile(await download.path()),
  })
  await expect(
    page.getByRole('button', { name: '恢复完整归档…' }),
  ).toBeVisible()

  const otherPage = await page.context().newPage()
  await otherPage.goto('/')
  await otherPage.getByRole('button', { name: '置顶卡片' }).click()
  await expect(
    otherPage.getByRole('button', { name: '取消置顶卡片' }),
  ).toBeVisible()

  await page.getByRole('button', { name: '恢复完整归档…' }).click()
  await page.getByRole('button', { name: '确认替换并恢复' }).click()
  await expect(page.getByRole('dialog')).toContainText(
    '本地数据已在其他页面变化',
  )
  await expect(page.getByRole('button', { name: '恢复完整归档…' })).toHaveCount(
    0,
  )
  await expect(
    otherPage.getByRole('button', { name: '取消置顶卡片' }),
  ).toBeVisible()
})

test('mobile organization actions and storage panel fit the screen', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile layout')
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('button', { name: '置顶卡片' }).click()
  await page.getByRole('button', { name: '复制当前卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '未命名卡片（副本）',
  )
  await page.getByRole('button', { name: '返回卡片列表' }).click()
  await page.getByRole('button', { name: '批量整理' }).click()
  await page
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
    .first()
    .click()
  await page.getByRole('button', { name: '加标签' }).click()
  await page.getByRole('textbox', { name: '标签名称' }).fill('手机整理')
  await page.getByRole('button', { name: '确认添加' }).click()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await expect(page.getByRole('button', { name: '导出完整归档' })).toBeVisible()
  await expect(page.getByText('本地存储', { exact: true })).toBeVisible()
})

test('batch organization updates only selected cards and keeps deleted cards recoverable', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop batch workflow')
  await page.goto('/')
  const options = page
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
  await expect(options).toHaveCount(3)
  await page.getByRole('button', { name: '批量整理' }).click()
  await options.nth(0).click()
  await options.nth(1).click()
  await expect(page.getByText(/已选 2 张/)).toBeVisible()
  await page.getByRole('button', { name: '加标签' }).click()
  await page.getByRole('textbox', { name: '标签名称' }).fill('本轮批量')
  await page.getByRole('button', { name: '确认添加' }).click()
  await expect(
    page.getByRole('navigation', { name: '标签筛选' }).getByRole('button', {
      name: /本轮批量/,
    }),
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: '标签筛选' })
    .getByRole('button', { name: /本轮批量/ })
    .click()
  await expect(options).toHaveCount(2)
  await page.getByRole('button', { name: '选中当前显示' }).click()
  await page.getByRole('button', { name: '置顶', exact: true }).click()
  await expect(options.first().getByLabel('已置顶')).toBeVisible()
  await options.first().click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出选中' }).click()
  const download = await downloadPromise
  const selectedBackup = JSON.parse(
    await readFile(await download.path(), 'utf-8'),
  )
  expect(selectedBackup.cards).toHaveLength(1)
  await page.getByRole('button', { name: '选中当前显示' }).click()
  await page.getByRole('button', { name: '移入回收站' }).click()
  await page.getByRole('button', { name: '确认移入回收站' }).click()
  await expect(options).toHaveCount(0)
  await page.getByRole('button', { name: '清除标签筛选' }).click()
  await expect(options).toHaveCount(1)
  await page.getByRole('button', { name: '回收站' }).click()
  await expect(page.getByRole('dialog')).toContainText('恢复卡片')
})
