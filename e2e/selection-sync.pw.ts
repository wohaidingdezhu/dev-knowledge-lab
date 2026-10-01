import { expect, test, type Page } from '@playwright/test'

const cardList = (page: Page) =>
  page.getByRole('listbox', { name: '知识卡片搜索结果' })

async function deleteInOtherPage(page: Page, title: string) {
  const otherPage = await page.context().newPage()
  await otherPage.goto('/')
  await cardList(otherPage)
    .getByRole('option')
    .filter({ hasText: title })
    .click()
  await otherPage.getByRole('button', { name: '删除当前卡片' }).click()
  await otherPage.getByRole('button', { name: '确认删除' }).click()
  await expect(
    cardList(otherPage).getByRole('option').filter({ hasText: title }),
  ).toHaveCount(0)
  await otherPage.close()
}

test('batch selection drops deleted cards while retaining remaining choices', async ({
  page,
}) => {
  await page.goto('/')
  const list = cardList(page)
  const options = list.getByRole('option')
  await expect(options).toHaveCount(3)
  const deletedTitle = await options.nth(0).getByRole('heading').innerText()
  const remainingTitle = await options.nth(1).getByRole('heading').innerText()
  await page.getByRole('button', { name: '批量整理' }).click()
  await expect(list).toHaveAttribute('aria-multiselectable', 'true')
  await options.nth(0).click()
  await options.nth(1).click()
  await expect(list.getByRole('option', { selected: true })).toHaveCount(2)

  await deleteInOtherPage(page, deletedTitle)
  await expect(options).toHaveCount(2)
  await expect(page.getByText(/已选 1 张/)).toBeVisible()
  await expect(list.getByRole('option', { selected: true })).toContainText(
    remainingTitle,
  )
  await page.getByRole('button', { name: '加标签' }).click()
  await page.getByRole('textbox', { name: '标签名称' }).fill('保留的选择')
  await page.getByRole('button', { name: '确认添加' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    options.filter({ hasText: remainingTitle }).getByText('保留的选择'),
  ).toBeVisible()
  await expect(options.filter({ hasText: '保留的选择' })).toHaveCount(1)
  await page.getByRole('button', { name: '完成整理' }).click()
  await expect(list).toHaveAttribute('aria-multiselectable', 'false')
})

test('search keyboard cursor stays usable when another page removes a result', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop search keyboard navigation')
  await page.goto('/')
  const search = page.getByRole('textbox', { name: '搜索知识卡片' })
  await search.fill('JavaScript')
  const options = cardList(page).getByRole('option')
  await expect(options).toHaveCount(2)
  const deletedTitle = await options.first().getByRole('heading').innerText()
  const remainingTitle = await options.last().getByRole('heading').innerText()
  const remainingId = await options.last().getAttribute('id')
  await search.press('ArrowDown')
  await expect(search).toHaveAttribute('aria-activedescendant', remainingId!)

  await deleteInOtherPage(page, deletedTitle)
  await expect(options).toHaveCount(1)
  await expect(search).toHaveAttribute('aria-activedescendant', remainingId!)
  await search.press('Enter')
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    remainingTitle,
  )
})

test('mobile detail can return to the list after its card is deleted elsewhere', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile detail recovery')
  await page.goto('/')
  const options = cardList(page).getByRole('option')
  await expect(options).toHaveCount(3)
  const deletedTitle = await options.first().getByRole('heading').innerText()
  await options.first().click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    deletedTitle,
  )

  await deleteInOtherPage(page, deletedTitle)
  await expect(page.locator('.detail-empty')).toBeVisible()
  await expect(
    page.locator('.detail-empty').getByRole('button', { name: '新建卡片' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '返回卡片列表' }).click()
  await expect(cardList(page)).toBeVisible()
  await expect(options).toHaveCount(2)
  const remainingTitle = await options.first().getByRole('heading').innerText()
  await options.first().click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    remainingTitle,
  )
})
