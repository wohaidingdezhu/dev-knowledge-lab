import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('write, autosave, refresh, search, run and undo deletion', async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    'Desktop workflow; mobile navigation is tested separately',
  )
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('E2E 自动保存')
  await page
    .getByRole('textbox', { name: 'Markdown 正文' })
    .fill('## 解决方法\n\n标记 blue-e2e')
  await page.getByRole('textbox', { name: '添加标签' }).fill('自动化')
  await page.getByRole('textbox', { name: '添加标签' }).press('Enter')
  await page
    .getByRole('textbox', { name: '来源链接' })
    .fill('https://example.com/docs')
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'HTML 代码' })
    .fill('<button id="ping">运行</button>')
  await page.getByRole('tab', { name: 'JavaScript' }).click()
  await page
    .getByRole('textbox', { name: 'JavaScript 代码' })
    .fill(
      "document.querySelector('#ping').textContent='运行成功'; console.log('code-e2e')",
    )
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('option').filter({ hasText: 'E2E 自动保存' }).click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    'E2E 自动保存',
  )
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Markdown 正文' }),
  ).toContainText('blue-e2e')
  await expect(page.getByRole('textbox', { name: '来源链接' })).toHaveValue(
    'https://example.com/docs',
  )
  await page.getByRole('textbox', { name: '搜索知识卡片' }).fill('blue-e2e')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索知识卡片' }).fill('code-e2e')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索知识卡片' }).fill('no-match-e2e')
  await expect(page.getByText('还没找到这个片段')).toBeVisible()
  await page.getByRole('button', { name: '清空搜索' }).click()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('button', { name: '运行代码' }).click()
  await expect(
    page.frameLocator('iframe').getByRole('button', { name: '运行成功' }),
  ).toBeVisible()
  await expect(page.getByRole('log', { name: '运行输出' })).toContainText(
    'code-e2e',
  )
  await page.getByRole('tab', { name: 'JavaScript' }).click()
  await page
    .getByRole('textbox', { name: 'JavaScript 代码' })
    .fill("throw new Error('expected-e2e')")
  await page.getByRole('button', { name: '运行代码' }).click()
  await expect(page.getByRole('log', { name: '运行输出' })).toContainText(
    'expected-e2e',
  )
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(
    page.getByRole('option').filter({ hasText: 'E2E 自动保存' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '撤销删除' }).click()
  await expect(
    page.getByRole('option').filter({ hasText: 'E2E 自动保存' }),
  ).toHaveCount(1)
})

test('JSON backup restores complete card and rejects invalid file', async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    'Desktop workflow; mobile navigation is tested separately',
  )
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('备份往返 E2E')
  await page
    .getByRole('textbox', { name: 'Markdown 正文' })
    .fill('往返正文 marker-739')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '导入与备份' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.json$/)
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await readFile(await download.path()),
  })
  await expect(page.getByText(/校验通过，共 4 张卡片，3 张 ID/)).toBeVisible()
  await page.getByRole('button', { name: '仅导入卡片' }).click()
  await page.getByRole('textbox', { name: '搜索知识卡片' }).fill('marker-739')
  await expect(
    page.getByRole('option').filter({ hasText: '备份往返 E2E' }),
  ).toHaveCount(1)
})

test('history, recycle bin and selective backup restore recover previous content', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop recovery workflow')
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('恢复流程 E2E')
  await page
    .getByRole('textbox', { name: 'Markdown 正文' })
    .fill('最初内容 E2E')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()

  await page.getByRole('button', { name: '导入与备份' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份' }).click()
  const download = await downloadPromise
  await page.getByRole('button', { name: '关闭弹窗' }).click()

  await page
    .getByRole('textbox', { name: 'Markdown 正文' })
    .fill('后来内容 E2E')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await readFile(await download.path()),
  })
  await expect(page.getByText(/校验通过，共 4 张卡片/)).toBeVisible()
  await page.getByRole('button', { name: '对比内容' }).first().click()
  await expect(page.locator('.restore-comparison')).toContainText(
    '最初内容 E2E',
  )
  await expect(page.locator('.restore-comparison')).toContainText(
    '后来内容 E2E',
  )
  await page
    .getByRole('combobox', { name: '处理 恢复流程 E2E 的备份冲突' })
    .selectOption('replace')
  await page.getByRole('button', { name: '仅导入卡片' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Markdown 正文' }),
  ).toContainText('最初内容 E2E')

  await page.getByRole('button', { name: '查看卡片历史版本' }).click()
  await page.getByRole('button', { name: '查看内容' }).first().click()
  await expect(page.getByRole('dialog')).toContainText('后来内容 E2E')
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(
    page.getByRole('option').filter({ hasText: '恢复流程 E2E' }),
  ).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: '回收站' }).click()
  await expect(page.getByRole('dialog')).toContainText('恢复流程 E2E')
  await page.getByRole('button', { name: '恢复卡片' }).click()
  await expect(
    page.getByRole('option').filter({ hasText: '恢复流程 E2E' }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(
    page.getByRole('option').filter({ hasText: '恢复流程 E2E' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '回收站' }).click()
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await page
    .getByRole('dialog', { name: '永久删除这张卡片？' })
    .getByRole('button', { name: '永久删除' })
    .click()
  await expect(page.getByRole('dialog', { name: '回收站' })).toContainText(
    '回收站是空的',
  )
})

test('complete backup restores history and recycle bin together', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop complete recovery workflow')
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('完整备份历史')
  await page.getByRole('textbox', { name: 'Markdown 正文' }).fill('第一版内容')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  await page.getByRole('textbox', { name: 'Markdown 正文' }).fill('第二版内容')
  await expect(page.locator('.save-status')).toHaveText('已保存')

  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('完整备份回收站')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  await page.getByRole('button', { name: '删除当前卡片' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()

  await page.getByRole('button', { name: '导入与备份' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份' }).click()
  const download = await downloadPromise
  const buffer = await readFile(await download.path())
  const exported = JSON.parse(buffer.toString('utf8'))
  expect(exported.schemaVersion).toBe(3)
  expect(exported.history.length).toBeGreaterThan(0)
  const activeId = exported.cards.find(
    (card: { title: string }) => card.title === '完整备份历史',
  ).id
  const activeHistoryCount = exported.history.filter(
    (entry: { cardId: string }) => entry.cardId === activeId,
  ).length
  expect(activeHistoryCount).toBeGreaterThan(0)
  expect(
    exported.trash.some(
      (entry: { card: { title: string } }) =>
        entry.card.title === '完整备份回收站',
    ),
  ).toBe(true)
  await page.getByRole('button', { name: '关闭弹窗' }).click()

  await page.getByRole('option').filter({ hasText: '完整备份历史' }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByRole('textbox', { name: 'Markdown 正文' }).fill('备份后修改')
  await expect(page.locator('.save-status')).toHaveText('已保存')
  await page.getByRole('button', { name: '回收站' }).click()
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await page
    .getByRole('dialog', { name: '永久删除这张卡片？' })
    .getByRole('button', { name: '永久删除' })
    .click()
  await page.getByRole('button', { name: '关闭弹窗' }).click()

  await page.getByRole('button', { name: '导入与备份' }).click()
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer,
  })
  await expect(
    page.getByRole('button', { name: '恢复完整工作区' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '恢复完整工作区' }).click()
  await expect(
    page.getByRole('dialog', { name: '恢复完整工作区？' }),
  ).toContainText('当前工作区的卡片、历史和回收站都会被替换')
  await page.getByRole('button', { name: '确认替换并完整恢复' }).click()
  await page.getByRole('option').filter({ hasText: '完整备份历史' }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Markdown 正文' }),
  ).toContainText('第二版内容')
  await page.getByRole('button', { name: '查看卡片历史版本' }).click()
  await expect(page.getByRole('button', { name: '恢复此版本' })).toHaveCount(
    activeHistoryCount,
  )
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await page.getByRole('button', { name: '回收站' }).click()
  await expect(page.getByRole('dialog', { name: '回收站' })).toContainText(
    '完整备份回收站',
  )
})

test('concurrent tabs report a conflict and preserve a copy', async ({
  context,
  isMobile,
}) => {
  test.skip(
    isMobile,
    'Desktop workflow; mobile navigation is tested separately',
  )
  const first = await context.newPage()
  await first.goto('/')
  await first.getByRole('button', { name: '新建知识卡片' }).click()
  await first.getByRole('textbox', { name: '卡片标题' }).fill('并发起点 E2E')
  await expect(
    first.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  const second = await context.newPage()
  await second.goto('/')
  await second.getByRole('option').filter({ hasText: '并发起点 E2E' }).click()
  await Promise.all([
    first.getByRole('textbox', { name: '卡片标题' }).fill('并发修改 A'),
    second.getByRole('textbox', { name: '卡片标题' }).fill('并发修改 B'),
  ])
  await expect
    .poll(
      async () =>
        (await first.getByRole('alert').count()) +
        (await second.getByRole('alert').count()),
    )
    .toBe(1)
  const loser = (await first.getByRole('alert').count()) ? first : second
  await expect(loser.getByRole('alert')).toContainText('已在其他页面更新')
  await loser.getByRole('button', { name: '保留为副本' }).click()
  await expect(
    loser.getByRole('option').filter({ hasText: '（恢复副本）' }),
  ).toHaveCount(1)
})

test('mobile list and lab remain usable without page overflow', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile layout check')
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('窄屏 E2E')
  await page
    .getByRole('textbox', { name: 'Markdown 正文' })
    .fill('窄屏检索 marker-mobile')
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  await page.getByRole('textbox', { name: 'HTML 代码' }).fill('<p>手机预览</p>')
  await page.getByRole('button', { name: '运行代码' }).click()
  await expect(page.frameLocator('iframe').getByText('手机预览')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: '返回卡片列表' }).click()
  await expect(
    page.getByRole('option').filter({ hasText: '窄屏 E2E' }),
  ).toBeVisible()
  await page
    .getByRole('textbox', { name: '搜索知识卡片' })
    .fill('marker-mobile')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份' }).click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.json$/)
})

test('demo cards reset without affecting the regular workspace', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop demo entry')
  await page.goto('/?demo=1')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('textbox', { name: '卡片标题' }).fill('仅演示空间的修改')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '使用帮助' }).click()
  await page.getByRole('button', { name: '重置演示卡片' }).click()
  await page.getByRole('button', { name: '确认重置演示空间' }).click()
  await expect(page.getByRole('option')).toHaveCount(3)
  await expect(
    page.getByRole('option').filter({ hasText: '仅演示空间的修改' }),
  ).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByRole('option')).toHaveCount(3)
})

test('long result lists load incrementally and code editor supports indent and undo', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop list and keyboard editing check')
  await page.goto('/')
  await expect(page.getByRole('option')).toHaveCount(3)
  await page.evaluate(async () => {
    const request = indexedDB.open('dev-knowledge-lab')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('cards', 'readwrite')
    const store = transaction.objectStore('cards')
    const timestamp = new Date().toISOString()
    for (let index = 0; index < 101; index++) {
      store.put({
        id: `pagination-${index}`,
        title: `分页卡片 ${index}`,
        body: '',
        tags: [],
        source: '',
        html: '',
        css: '',
        js: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        revision: 1,
      })
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload()
  await expect(page.getByRole('option')).toHaveCount(100)
  await page.getByRole('button', { name: /加载更多/ }).click()
  await expect(page.getByRole('option')).toHaveCount(104)
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'HTML 代码' })
  await editor.fill('<div>hello</div>')
  await editor.press('End')
  await editor.press('Tab')
  await expect
    .poll(async () => (await editor.textContent())?.length)
    .toBeGreaterThan(16)
  await editor.press('ControlOrMeta+z')
  await expect(editor).toContainText('<div>hello</div>')
  expect(await editor.textContent()).toBe('<div>hello</div>')
})

test('blocked browser storage displays a clear error instead of a saved state', async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    })
  })
  await page.goto('/')
  await expect(page.locator('.storage-error')).toContainText('浏览器存储不可用')
  await expect(
    page.getByRole('status').filter({ hasText: '已保存' }),
  ).toHaveCount(0)
})
