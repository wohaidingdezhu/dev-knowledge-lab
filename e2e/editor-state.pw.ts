import { expect, test } from '@playwright/test'

test('language tabs preserve selection and independent undo histories', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  const html = page.getByRole('textbox', { name: 'HTML 代码' })
  const original = '<p>editor-state</p>'
  await html.fill(original)
  await html.press('End')
  await html.press('Tab')
  const editedHtml = await html.textContent()
  expect(editedHtml!.length).toBeGreaterThan(original.length)
  for (let index = 0; index < 3; index++) await html.press('Shift+ArrowLeft')
  const selection = await page.evaluate(() => window.getSelection()?.toString())
  expect(selection).toHaveLength(3)

  await page.getByRole('tab', { name: 'CSS', exact: true }).click()
  await expect(html).toHaveCount(0)
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  const css = page.getByRole('textbox', { name: 'CSS 代码' })
  await css.fill('p { color: red; }')

  await page.getByRole('tab', { name: 'HTML', exact: true }).click()
  await expect(css).toHaveCount(0)
  await html.focus()
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(selection)
  expect(await html.textContent()).toBe(editedHtml)
  const bounds = await html.boundingBox()
  expect(bounds?.width).toBeGreaterThan(0)
  expect(bounds?.height).toBeGreaterThan(0)
  await html.press('ControlOrMeta+z')
  await expect.poll(() => html.textContent()).toBe(original)

  // Desktop shortcuts and the mobile run action must use current source.
  if (isMobile) await page.getByRole('button', { name: '运行代码' }).click()
  else await html.press('ControlOrMeta+Enter')
  await expect(page.frameLocator('iframe').getByText('editor-state')).toHaveCSS(
    'color',
    'rgb(255, 0, 0)',
  )
  await page.getByRole('tab', { name: 'CSS', exact: true }).click()
  await expect(css).toHaveText('p { color: red; }')
  await css.press('ControlOrMeta+z')
  await expect.poll(() => css.textContent()).toBe('')
  await page.getByRole('tab', { name: 'HTML', exact: true }).click()
  await expect(html).toHaveText(original)
})

test('switching cards does not carry source or undo history into another card', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '未命名卡片',
  )
  await page.getByRole('textbox', { name: '卡片标题' }).fill('独立编辑器 A')
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  const html = page.getByRole('textbox', { name: 'HTML 代码' })
  await html.fill('<p>card A</p>')
  await page.getByRole('tab', { name: 'CSS', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'CSS 代码' })
    .fill('p { color: red; }')

  if (isMobile)
    await page
      .getByRole('button', { name: '返回卡片列表', exact: true })
      .click()
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    '未命名卡片',
  )
  await page.getByRole('textbox', { name: '卡片标题' }).fill('独立编辑器 B')
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await html.press('ControlOrMeta+z')
  await expect.poll(() => html.textContent()).toBe('')
  await html.fill('<p>card B</p>')
  await page.getByRole('tab', { name: 'CSS', exact: true }).click()
  const css = page.getByRole('textbox', { name: 'CSS 代码' })
  await css.press('ControlOrMeta+z')
  await expect.poll(() => css.textContent()).toBe('')

  if (isMobile)
    await page
      .getByRole('button', { name: '返回卡片列表', exact: true })
      .click()
  await page
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
    .filter({ hasText: '独立编辑器 A' })
    .click()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await expect(
    page.getByRole('tab', { name: 'CSS', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'HTML', exact: true }).click()
  await html.press('ControlOrMeta+z')
  await expect(html).toHaveText('<p>card A</p>')
  await page.getByRole('tab', { name: 'CSS', exact: true }).click()
  await expect(css).toHaveText('p { color: red; }')
})
