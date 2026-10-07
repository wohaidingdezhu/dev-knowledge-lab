import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  KNOWLEDGE_PACK_SIZE,
  makeKnowledgePackCards,
} from '../src/lib/knowledgePack'
import { loadCard } from './helpers/load-card'

test('knowledge pack can be added once without changing existing cards', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await expect(
    page.getByRole('listbox', { name: '知识卡片搜索结果' }).getByRole('option'),
  ).toHaveCount(3)
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  await expect(page.getByRole('dialog')).toContainText(
    '闭包：让每个计数器记住自己的状态',
  )
  await page
    .getByRole('button', { name: `添加 ${KNOWLEDGE_PACK_SIZE} 张知识卡片` })
    .click()
  if (isMobile) await page.getByRole('button', { name: '返回卡片列表' }).click()
  await expect(
    page.getByRole('listbox', { name: '知识卡片搜索结果' }).getByRole('option'),
  ).toHaveCount(3 + KNOWLEDGE_PACK_SIZE)
  if (isMobile)
    await page
      .getByRole('listbox', { name: '知识卡片搜索结果' })
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
  await expect(
    page.getByRole('listbox', { name: '知识卡片搜索结果' }).getByRole('option'),
  ).toHaveCount(3 + KNOWLEDGE_PACK_SIZE)
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  await expect(page.getByRole('button', { name: '已全部加入' })).toBeDisabled()
})

test('search and topic changes preserve selections and import only chosen lessons', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '清空选择', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '请先选择知识卡片' }),
  ).toBeDisabled()
  await dialog.getByLabel('搜索知识内容').fill('闭包')
  await expect(dialog.getByRole('checkbox')).toHaveCount(1)
  await dialog.getByRole('checkbox').check()
  await dialog.getByLabel('筛选知识主题').selectOption('Web API')
  await dialog.getByLabel('搜索知识内容').fill('STRUCTUREDCLONE')
  await expect(dialog.getByRole('checkbox')).toHaveCount(1)
  await dialog
    .getByRole('button', { name: '选择当前结果', exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: '添加 2 张知识卡片' }),
  ).toBeEnabled()
  await dialog
    .getByRole('button', { name: '取消当前结果', exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: '添加 1 张知识卡片' }),
  ).toBeEnabled()
  await dialog
    .getByRole('button', { name: '选择当前结果', exact: true })
    .click()
  await dialog.getByLabel('搜索知识内容').fill('不存在的主题 123')
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await expect(dialog.getByText(/没有匹配的知识卡片/)).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: '选择当前结果', exact: true }),
  ).toBeDisabled()
  // Hidden choices remain explicit in the count and are included in the import.
  await dialog.getByRole('button', { name: '添加 2 张知识卡片' }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  const list = page.getByRole('listbox', { name: '知识卡片搜索结果' })
  await expect(list.getByRole('option')).toHaveCount(5)
  await expect(
    list.getByRole('option').filter({ hasText: '闭包：' }),
  ).toHaveCount(1)
  await expect(
    list.getByRole('option').filter({ hasText: 'structuredClone：' }),
  ).toHaveCount(1)
  await expect(
    list.getByRole('option').filter({ hasText: 'Set 去重：' }),
  ).toHaveCount(0)
})

test('lesson preview is readable, accessible and never executes the example', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('搜索知识内容').fill('闭包')
  const trigger = dialog.getByRole('button', {
    name: '预览：闭包：让每个计数器记住自己的状态',
    exact: true,
  })
  await trigger.focus()
  await trigger.press('Enter')
  const preview = dialog.getByRole('region', {
    name: '闭包：让每个计数器记住自己的状态',
  })
  await expect(
    preview.getByRole('heading', { name: '闭包：让每个计数器记住自己的状态' }),
  ).toBeFocused()
  await expect(preview.getByRole('heading', { name: '关键做法' })).toBeVisible()
  await expect(
    preview.getByRole('link', { name: '查看 MDN 参考来源' }),
  ).toHaveAttribute(
    'href',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures',
  )
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  const width = await dialog.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }))
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1)
  await preview.getByRole('button', { name: '关闭笔记预览' }).click()
  await expect(trigger).toBeFocused()
  await expect(preview).toHaveCount(0)
  await trigger.click()
  await dialog.getByLabel('搜索知识内容').fill('Set 去重')
  await preview.getByRole('button', { name: '关闭笔记预览' }).click()
  await expect(dialog.getByLabel('搜索知识内容')).toBeFocused()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  if (isMobile) await page.getByRole('button', { name: '关闭导航' }).click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
})

test('existing edited lessons remain disabled while selected new lessons are added', async ({
  page,
  isMobile,
}) => {
  const original = {
    ...makeKnowledgePackCards()[0],
    title: '我的闭包学习记录',
    body: '个人内容，不可覆盖。',
    js: 'console.log("个人实验")',
  }
  await loadCard(page, isMobile, original)
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '清空选择', exact: true }).click()
  await dialog.getByLabel('搜索知识内容').fill('闭包')
  await expect(dialog.getByRole('checkbox')).toBeDisabled()
  await expect(dialog.getByRole('checkbox')).not.toBeChecked()
  await expect(dialog.getByText('已在工作区 · 保留已有修改')).toBeVisible()
  await dialog.getByLabel('搜索知识内容').fill('Set 去重')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '添加 1 张知识卡片' }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  const list = page.getByRole('listbox')
  await expect(list.getByRole('option')).toHaveCount(2)
  await list.getByRole('option').filter({ hasText: original.title }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    original.title,
  )
  await expect(page.locator('.markdown')).toHaveText(original.body)
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page.getByRole('tab', { name: 'JavaScript' }).click()
  await expect(
    page.getByRole('textbox', { name: 'JavaScript 代码' }),
  ).toContainText(original.js)
})

test('another page adding a selected lesson updates the open browser without duplicates', async ({
  page,
  context,
  isMobile,
}) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '清空选择', exact: true }).click()
  await dialog.getByLabel('搜索知识内容').fill('闭包')
  await dialog.getByRole('checkbox').check()
  const other = await context.newPage()
  await other.goto('/')
  if (isMobile) await other.getByRole('button', { name: '打开导航' }).click()
  await other.getByRole('button', { name: /前端知识内容包/ }).click()
  await other.getByRole('button', { name: '清空选择', exact: true }).click()
  await other.getByLabel('搜索知识内容').fill('闭包')
  await other.getByRole('checkbox').check()
  await other.getByRole('button', { name: '添加 1 张知识卡片' }).click()
  await expect(other.getByRole('dialog')).toHaveCount(0)
  await expect(dialog.getByRole('checkbox')).toBeDisabled()
  await expect(
    dialog.getByRole('button', { name: '请先选择知识卡片' }),
  ).toBeDisabled()
  await dialog.getByLabel('搜索知识内容').fill('默认值')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '添加 1 张知识卡片' }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(5)
  await expect(
    page.getByRole('listbox').getByRole('option').filter({ hasText: '闭包：' }),
  ).toHaveCount(1)
  await other.close()
})

test('failed knowledge import keeps choices and supports retry without partial cards', async ({
  page,
  context,
  isMobile,
}) => {
  await page.addInitScript(() => {
    const storeAdd = IDBObjectStore.prototype.add
    const storePut = IDBObjectStore.prototype.put
    Object.assign(window, { rejectKnowledgeWrites: true })
    for (const [name, original] of [
      ['add', storeAdd],
      ['put', storePut],
    ] as const) {
      IDBObjectStore.prototype[name] = function (
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (
          (window as unknown as { rejectKnowledgeWrites: boolean })
            .rejectKnowledgeWrites &&
          this.name === 'cards' &&
          value &&
          typeof value === 'object' &&
          'id' in value &&
          value.id === 'guide-js-microtasks'
        ) {
          throw new DOMException('模拟知识卡片写入失败', 'QuotaExceededError')
        }
        return key === undefined
          ? original.call(this, value)
          : original.call(this, value, key)
      }
    }
  })
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: /前端知识内容包/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '清空选择', exact: true }).click()
  await dialog.getByLabel('搜索知识内容').fill('闭包')
  await dialog.getByRole('checkbox').check()
  await dialog.getByLabel('搜索知识内容').fill('微任务')
  await dialog.getByRole('checkbox', { name: /^微任务：/ }).check()
  await dialog.getByRole('button', { name: '添加 2 张知识卡片' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(
    dialog.getByRole('checkbox', { name: /^微任务：/ }),
  ).toBeChecked()
  await expect(
    dialog.getByRole('button', { name: '添加 2 张知识卡片' }),
  ).toBeEnabled()
  // The earlier successful write in the same transaction must also roll back.
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.getByRole('listbox').getByRole('option')).toHaveCount(3)
  await other.close()
  await dialog.getByLabel('搜索知识内容').fill('闭包')
  await expect(dialog.getByRole('checkbox')).toBeChecked()
  await page.evaluate(() =>
    Object.assign(window, { rejectKnowledgeWrites: false }),
  )
  await dialog.getByRole('button', { name: '添加 2 张知识卡片' }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(5)
})
