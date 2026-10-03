import { describe, expect, it } from 'vitest'
import {
  readViewPreferences,
  writeViewPreferences,
  rememberLanguage,
  rememberedLanguage,
} from '../src/lib/viewPreferences'

function storage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('view preferences', () => {
  it('keeps demo and personal selections separate', () => {
    const store = storage()
    writeViewPreferences(
      false,
      {
        selectedId: 'personal',
        sortMode: 'title',
        languages: [['personal', 'css']],
      },
      store,
    )
    writeViewPreferences(
      true,
      { selectedId: 'demo', sortMode: 'created-desc', languages: [] },
      store,
    )
    expect(readViewPreferences(false, store)).toEqual({
      selectedId: 'personal',
      sortMode: 'title',
      languages: [['personal', 'css']],
    })
    expect(readViewPreferences(true, store).selectedId).toBe('demo')
  })

  it('uses valid fields only and recovers from corrupted or denied storage', () => {
    const store = storage()
    store.setItem('pianduan-view-personal-v1', '{broken')
    expect(readViewPreferences(false, store).selectedId).toBeNull()
    store.setItem(
      'pianduan-view-personal-v1',
      JSON.stringify({
        selectedId: 2,
        sortMode: 'bad',
        languages: [['good', 'css'], ['bad', 'python'], null],
      }),
    )
    expect(readViewPreferences(false, store)).toEqual({
      selectedId: null,
      sortMode: 'updated-desc',
      languages: [['good', 'css']],
    })
    const denied = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(readViewPreferences(false, denied).sortMode).toBe('updated-desc')
    expect(() =>
      writeViewPreferences(false, readViewPreferences(false, store), denied),
    ).not.toThrow()
    expect(rememberedLanguage([], 'constructor')).toBe('html')
    expect(
      rememberedLanguage(rememberLanguage([], '__proto__', 'js'), '__proto__'),
    ).toBe('js')
  })

  it('bounds remembered languages while retaining the most recently used card', () => {
    let languages: Parameters<typeof rememberLanguage>[0] = []
    for (let index = 0; index < 100; index++)
      languages = rememberLanguage(languages, String(index), 'css')
    languages = rememberLanguage(languages, '0', 'js')
    languages = rememberLanguage(languages, 'new', 'html')
    expect(languages).toHaveLength(100)
    expect(rememberedLanguage(languages, '0')).toBe('js')
    expect(languages.some(([id]) => id === '1')).toBe(false)
  })
})
