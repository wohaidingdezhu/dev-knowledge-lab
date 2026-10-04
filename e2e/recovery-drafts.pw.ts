import { expect, test, type Page } from '@playwright/test'

async function prepareRecovery(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '未命名卡片',
  )
  await page.getByRole('textbox', { name: '卡片标题' }).fill('等待恢复的卡片')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '未命名卡片',
  )
  await page
    .getByRole('textbox', { name: '卡片标题' })
    .fill('需要保留的当前草稿')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  await page.getByRole('textbox', { name: '来源链接' }).fill('尚未写完的链接')
  await expect(page.getByRole('alert')).toContainText('来源链接仅支持')
}

async function openTrash(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  return page.getByRole('dialog', { name: '回收站', exact: true })
}

async function expectDraft(page: Page) {
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '需要保留的当前草稿',
  )
  await expect(page.getByRole('textbox', { name: '来源链接' })).toHaveValue(
    '尚未写完的链接',
  )
  await expect(page.locator('.save-status')).toHaveText('!未保存')
  await expect(page.getByRole('alert')).toContainText('来源链接仅支持')
}

async function fixDraft(page: Page) {
  await page
    .getByRole('textbox', { name: '来源链接' })
    .fill('https://example.com/recovered-draft')
  await expect(page.locator('.save-status')).toHaveText('已保存')
}

async function expectPersistedDraft(page: Page, isMobile: boolean) {
  await page.reload()
  if (
    isMobile &&
    (await page
      .getByRole('button', { name: '返回卡片列表', exact: true })
      .isVisible())
  )
    await page
      .getByRole('button', { name: '返回卡片列表', exact: true })
      .click()
  await page
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
    .filter({ hasText: '需要保留的当前草稿' })
    .click()
  await expect(page.getByRole('textbox', { name: '来源链接' })).toHaveValue(
    'https://example.com/recovered-draft',
  )
}

test('recycle-bin recovery keeps an unsaved draft until it can be saved', async ({
  page,
  isMobile,
}) => {
  await prepareRecovery(page)
  const trash = await openTrash(page, isMobile)
  await trash.getByRole('button', { name: '恢复卡片', exact: true }).click()
  await expect(trash).toHaveCount(0)
  await expectDraft(page)
  await fixDraft(page)

  const retryTrash = await openTrash(page, isMobile)
  await expect(retryTrash).toContainText('等待恢复的卡片')
  await retryTrash
    .getByRole('button', { name: '恢复卡片', exact: true })
    .click()
  await expect(retryTrash).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '等待恢复的卡片',
  )
  await expectPersistedDraft(page, isMobile)
})

test('undo deletion keeps the current draft selected when saving fails', async ({
  page,
  isMobile,
}) => {
  await prepareRecovery(page)
  await page.getByRole('button', { name: '撤销删除', exact: true }).click()
  await expectDraft(page)
  await expect(
    page.getByRole('button', { name: '撤销删除', exact: true }),
  ).toBeVisible()
  await fixDraft(page)
  await page.getByRole('button', { name: '撤销删除', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '等待恢复的卡片',
  )
  await expectPersistedDraft(page, isMobile)
})
