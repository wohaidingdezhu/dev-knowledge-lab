import { expect, test } from '@playwright/test'

test('new cards start with an independent Markdown undo history', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '未命名卡片',
  )
  await page.getByRole('textbox', { name: '卡片标题' }).fill('正文隔离 A')
  const editor = page.getByRole('textbox', { name: 'Markdown 正文' })
  await editor.fill('A 卡片的正文')
  if (isMobile)
    await page
      .getByRole('button', { name: '返回卡片列表', exact: true })
      .click()
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '未命名卡片',
  )
  await page.getByRole('textbox', { name: '卡片标题' }).fill('正文隔离 B')
  await expect(editor).toHaveText('')
  await editor.press('ControlOrMeta+z')
  await expect(editor).toHaveText('')
  await editor.fill('B 卡片的正文')
  await expect(page.locator('.save-status')).toHaveText('已保存')

  if (isMobile)
    await page
      .getByRole('button', { name: '返回卡片列表', exact: true })
      .click()
  await page
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
    .filter({ hasText: '正文隔离 A' })
    .click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(editor).toHaveText('A 卡片的正文')
})

test('copying a card starts undo history from the copied Markdown', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('复制正文隔离')
  const editor = page.getByRole('textbox', { name: 'Markdown 正文' })
  await editor.fill('复制前的正文')
  await page.getByRole('button', { name: '复制当前卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '复制正文隔离（副本）',
  )
  await expect(editor).toHaveText('复制前的正文')
  await editor.press('ControlOrMeta+z')
  await expect(editor).toHaveText('复制前的正文')
  await editor.fill('副本的独立修改')
  await editor.press('ControlOrMeta+z')
  await expect(editor).toHaveText('复制前的正文')
})
