import { expect, test, type Page } from '@playwright/test'

const item = (page: Page, id: string) => page.locator(`[id="${id}"]`)

async function selectTwo(page: Page) {
  const options = page
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
  await expect(options).toHaveCount(3)
  const ids = [
    (await options.nth(0).getAttribute('id'))!,
    (await options.nth(1).getAttribute('id'))!,
  ]
  await page.getByRole('button', { name: '批量整理', exact: true }).click()
  for (const id of ids) await item(page, id).click()
  return ids
}

async function editElsewhere(page: Page, id: string) {
  const other = await page.context().newPage()
  await other.goto('/')
  await item(other, id).click()
  await other
    .getByRole('textbox', { name: '卡片标题' })
    .fill('另一个页面保存的新标题')
  await expect(other.locator('.save-status')).toHaveText('已保存')
  await expect(item(page, id)).toContainText('另一个页面保存的新标题')
  return other
}

test('batch deletion stops when a selected card changes after confirmation opens', async ({
  page,
}) => {
  await page.goto('/')
  const ids = await selectTwo(page)
  await page.getByRole('button', { name: '移入回收站', exact: true }).click()
  const other = await editElsewhere(page, ids[0])
  await page.getByRole('button', { name: '确认移入回收站' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    '重新选择',
  )
  for (const id of ids) await expect(item(page, id)).toHaveCount(1)
  await expect(other.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '另一个页面保存的新标题',
  )
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '完成整理', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
})

test('batch tag conflict leaves all cards untouched and succeeds after reselection', async ({
  page,
}) => {
  await page.goto('/')
  const ids = await selectTwo(page)
  await page.getByRole('button', { name: '加标签', exact: true }).click()
  await page.getByRole('textbox', { name: '标签名称' }).fill('冲突保护标签')
  await editElsewhere(page, ids[0])
  await page.getByRole('button', { name: '确认添加', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    '重新选择',
  )
  for (const id of ids)
    await expect(item(page, id)).not.toContainText('冲突保护标签')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '清空选择', exact: true }).click()
  for (const id of ids) await item(page, id).click()
  await page.getByRole('button', { name: '加标签', exact: true }).click()
  await page.getByRole('textbox', { name: '标签名称' }).fill('冲突保护标签')
  await page.getByRole('button', { name: '确认添加', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const id of ids)
    await expect(item(page, id)).toContainText('冲突保护标签')
  await expect(
    page
      .getByRole('listbox')
      .getByRole('option')
      .filter({ hasText: '冲突保护标签' }),
  ).toHaveCount(2)
})

test('batch selection from a previous workspace cannot pin identically restored cards', async ({
  page,
}) => {
  await page.goto('/?demo=1')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
  await page.getByRole('button', { name: '批量整理', exact: true }).click()
  await page.getByRole('button', { name: '选中当前显示', exact: true }).click()
  const other = await page.context().newPage()
  await other.goto('/?demo=1')
  await other.getByRole('button', { name: '使用帮助' }).click()
  await other.getByRole('button', { name: '重置演示卡片' }).click()
  await other.getByRole('button', { name: '确认重置演示空间' }).click()
  await expect(other.locator('.toast')).toContainText('演示空间已恢复')
  await page.getByRole('button', { name: '置顶', exact: true }).click()
  await expect(page.locator('.toast')).toContainText(/工作区.*(恢复|重置)/)
  await expect(page.getByLabel('已置顶')).toHaveCount(0)
  await page.getByRole('button', { name: '清空选择', exact: true }).click()
  await page.getByRole('button', { name: '选中当前显示', exact: true }).click()
  await page.getByRole('button', { name: '置顶', exact: true }).click()
  await expect(page.getByLabel('已置顶')).toHaveCount(3)
})
