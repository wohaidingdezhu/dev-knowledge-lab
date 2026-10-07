import { expect, test, type FrameLocator } from '@playwright/test'
import { additionalLessons } from '../src/lib/knowledgePackExtra'
import { makeKnowledgePackCards } from '../src/lib/knowledgePack'
import { loadCard } from './helpers/load-card'

const scenarios: Record<string, (frame: FrameLocator) => Promise<void>> = {
  'guide-js-nullish-default': async (frame) => {
    await expect(frame.locator('#result')).toHaveText(
      [
        '零：|| 默认 / ?? 0',
        '空字符串：|| 默认 / ?? (空字符串)',
        'false：|| 默认 / ?? false',
        'null：|| 默认 / ?? 默认',
        'undefined：|| 默认 / ?? 默认',
        'NaN：|| 默认 / ?? NaN',
      ].join('\n'),
    )
  },
  'guide-web-structured-clone': async (frame) => {
    await expect(frame.locator('#result')).toHaveText(
      '原资料：原名字\n副本资料：副本名字\n日期类型保留：true\n副本循环指向自身：true',
    )
    await frame.getByRole('button', { name: '尝试复制函数' }).click()
    await expect(frame.locator('#status')).toHaveText(
      '无法复制函数：DataCloneError',
    )
  },
  'guide-js-set-deduplicate': async (frame) => {
    await expect(frame.locator('#result')).toHaveText(
      '标签：CSS, JS\n按对象引用：2 条\n按 ID 保留第一条：1 条\nNaN 与正负零：2 个值',
    )
  },
  'guide-web-response-errors': async (frame) => {
    await frame.getByRole('button', { name: '模拟成功' }).click()
    await expect(frame.locator('#status')).toHaveText('读取成功：笔记')
    await frame.getByRole('button', { name: '模拟 HTTP 404' }).click()
    await expect(frame.locator('#status')).toHaveText('读取失败：HTTP 404')
    await frame.getByRole('button', { name: '模拟损坏 JSON' }).click()
    await expect(frame.locator('#status')).toHaveText('读取失败：JSON 解析失败')
    await frame.getByRole('button', { name: '模拟成功' }).click()
    await expect(frame.locator('#status')).toHaveText('读取成功：笔记')
  },
  'guide-js-debounce': async (frame) => {
    const input = frame.getByLabel('搜索词')
    await input.fill('停下再处理')
    await expect(frame.locator('#runs')).toHaveText('处理次数：1')
    await expect(frame.locator('#result')).toHaveText('处理结果：停下再处理')
    // Dispatch the input and cancel in one task, so the timer cannot win on a slow runner.
    await input.evaluate((element: HTMLInputElement) => {
      element.value = '被取消'
      element.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector<HTMLButtonElement>('#cancel')!.click()
    })
    await expect(frame.locator('#result')).toHaveText('已取消待处理输入')
    // A later completed input also proves that cancellation did not execute the old timer.
    await input.fill('重新输入')
    await expect(frame.locator('#runs')).toHaveText('处理次数：2')
    await expect(frame.locator('#result')).toHaveText('处理结果：重新输入')
  },
  'guide-js-all-settled': async (frame) => {
    await frame.getByRole('button', { name: '开始三个任务' }).click()
    await expect(frame.locator('#status')).toHaveText(
      '汇总完成：2 项成功，1 项失败',
    )
    await expect(frame.locator('li')).toHaveText([
      '任务 1：成功 · 笔记已加载',
      '任务 2：失败 · 模拟加载失败',
      '任务 3：成功 · 标签已加载',
    ])
    await expect(frame.getByRole('button')).toBeEnabled()
  },
  'guide-web-abort-controller': async (frame) => {
    const start = frame.getByRole('button', { name: '开始模拟任务' })
    await start.click()
    await frame.getByRole('button', { name: '取消任务' }).click()
    await expect(frame.locator('#status')).toHaveText('任务已取消')
    await start.evaluate((element: HTMLButtonElement) => {
      element.click()
      element.click()
    })
    await expect(frame.locator('#status')).toHaveText('任务进行中')
    await expect(frame.locator('#status')).toHaveText('任务完成')
  },
  'guide-js-shallow-copy': async (frame) => {
    await expect(frame.locator('#result')).toHaveText(
      [
        '浅拷贝实验的原对象：被浅拷贝修改',
        '复制路径实验的原对象：原名字',
        '新对象：新名字',
        '顶层独立：true',
        'profile 独立：true',
      ].join('\n'),
    )
  },
  'guide-js-map-keys': async (frame) => {
    await expect(frame.locator('#result')).toHaveText(
      [
        '同一引用：正在编辑',
        '新建对象：undefined',
        '更新后顺序：user → second',
        '重新加入：second → user',
      ].join('\n'),
    )
  },
  'guide-js-object-is': async (frame) => {
    await expect(frame.locator('#result')).toHaveText(
      [
        'NaN 与 NaN：=== false / Object.is true',
        '正零与负零：=== true / Object.is false',
        '同值数字：=== true / Object.is true',
        '两个空对象：=== false / Object.is false',
      ].join('\n'),
    )
  },
  'guide-js-numeric-sort': async (frame) => {
    await expect(frame.locator('#result')).toHaveText(
      '原数组：2, 10, 1, 30\n排序结果：1, 2, 10, 30',
    )
    await frame.getByRole('button', { name: '降序' }).click()
    await expect(frame.locator('#result')).toHaveText(
      '原数组：2, 10, 1, 30\n排序结果：30, 10, 2, 1',
    )
    await frame.getByRole('button', { name: '升序' }).click()
    await expect(frame.locator('#result')).toContainText(
      '排序结果：1, 2, 10, 30',
    )
  },
  'guide-dom-listener-cleanup': async (frame) => {
    const count = frame.getByRole('button', { name: '点击计数' })
    await count.click()
    await expect(frame.locator('#value')).toHaveText('点击次数：1')
    await frame.getByRole('button', { name: '解除监听' }).click()
    await expect(frame.locator('#status')).toHaveText('监听已解除')
    await count.click()
    await expect(frame.locator('#value')).toHaveText('点击次数：1')
    const bind = frame.getByRole('button', { name: '重新绑定' })
    await bind.click()
    await bind.click()
    await count.click()
    await expect(frame.locator('#value')).toHaveText('点击次数：2')
  },
  'guide-css-auto-fit-grid': async (frame) => {
    const slider = frame.getByLabel('容器宽度')
    await slider.fill('120')
    await expect(frame.locator('#status')).toHaveText('设定宽度：120px')
    const narrow = await frame
      .locator('#cards')
      .evaluate((element) =>
        [...element.children].map((child) => child.getBoundingClientRect().top),
      )
    expect(narrow[1]).toBeGreaterThan(narrow[0])
    expect(narrow[2]).toBeGreaterThan(narrow[1])
    await slider.fill('480')
    await expect(frame.locator('#status')).toHaveText('设定宽度：480px')
    const wide = await frame
      .locator('#cards')
      .evaluate((element) =>
        [...element.children].map((child) => child.getBoundingClientRect().top),
      )
    const availableWidth = await frame
      .locator('#cards')
      .evaluate((element) => element.getBoundingClientRect().width)
    // The split preview can be narrower than the slider's requested width.
    if (availableWidth >= 292) expect(wide[1]).toBe(wide[0])
    else expect(wide[1]).toBeGreaterThan(wide[0])
    if (availableWidth >= 444) expect(wide[2]).toBe(wide[0])
  },
  'guide-css-box-sizing': async (frame) => {
    await expect(frame.locator('#status')).toHaveText(
      'content-box：实际宽度 248px',
    )
    await frame.getByRole('button', { name: '切换盒模型' }).click()
    await expect(frame.locator('#status')).toHaveText(
      'border-box：实际宽度 200px',
    )
    await frame.getByRole('button', { name: '切换盒模型' }).click()
    await expect(frame.locator('#status')).toHaveText(
      'content-box：实际宽度 248px',
    )
  },
  'guide-a11y-focus-visible': async (frame) => {
    for (const label of ['第一个按钮', '第二个按钮']) {
      const button = frame.getByRole('button', { name: label })
      await button.focus()
      await button.press('Enter')
      await expect(button).toBeFocused()
      await expect(button).toHaveCSS('outline-style', 'solid')
      await expect(frame.locator('#status')).toHaveText(`已激活：${label}`)
    }
  },
  'guide-html-details': async (frame) => {
    const summary = frame.locator('summary')
    await summary.click()
    await expect(
      frame.getByText('先预测结果，再运行代码，并记录你的观察。'),
    ).toBeVisible()
    await expect(frame.locator('#status')).toHaveText('当前状态：已展开')
    await summary.press('Space')
    await expect(frame.locator('#status')).toHaveText('当前状态：已收起')
    await expect(
      frame.getByText('先预测结果，再运行代码，并记录你的观察。'),
    ).not.toBeVisible()
  },
}

for (const lesson of additionalLessons) {
  test(`knowledge experiment: ${lesson.title}`, async ({ page, isMobile }) => {
    if (lesson.id === 'guide-css-auto-fit-grid' && !isMobile)
      await page.setViewportSize({ width: 1920, height: 1080 })
    const card = makeKnowledgePackCards().find((card) => card.id === lesson.id)!
    await loadCard(page, isMobile, card)
    await page.getByRole('button', { name: '代码实验室', exact: true }).click()
    await expect(page.locator('iframe')).toHaveCount(0)
    await page.getByRole('button', { name: '运行代码' }).click()
    await scenarios[lesson.id](page.frameLocator('iframe'))
    await expect(page.locator('.lab-console-error')).toHaveCount(0)
  })
}
