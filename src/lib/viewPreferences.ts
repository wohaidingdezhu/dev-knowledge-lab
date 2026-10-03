export type SortMode = 'updated-desc' | 'updated-asc' | 'created-desc' | 'title'
export type CodeLanguage = 'html' | 'css' | 'js'
export type ViewPreferences = {
  selectedId: string | null
  sortMode: SortMode
  languages: [string, CodeLanguage][]
}
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>
const key = (demo: boolean) => `pianduan-view-${demo ? 'demo' : 'personal'}-v1`
const MAX_LANGUAGES = 100
const isLanguage = (value: unknown): value is CodeLanguage =>
  value === 'html' || value === 'css' || value === 'js'
const defaults = (): ViewPreferences => ({
  selectedId: null,
  sortMode: 'updated-desc',
  languages: [],
})

export function readViewPreferences(
  demo: boolean,
  storage?: PreferenceStorage,
): ViewPreferences {
  try {
    const raw = (storage ?? window.localStorage).getItem(key(demo))
    if (!raw || raw.length > 64000) return defaults()
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return defaults()
    const languages: ViewPreferences['languages'] = Array.isArray(
      data.languages,
    )
      ? [
          ...new Map<string, CodeLanguage>(
            data.languages.filter(
              (entry: unknown) =>
                Array.isArray(entry) &&
                entry.length === 2 &&
                typeof entry[0] === 'string' &&
                entry[0].length > 0 &&
                entry[0].length <= 256 &&
                isLanguage(entry[1]),
            ),
          ).entries(),
        ].slice(-MAX_LANGUAGES)
      : []
    return {
      selectedId:
        typeof data.selectedId === 'string' && data.selectedId.length <= 256
          ? data.selectedId || null
          : null,
      sortMode: [
        'updated-desc',
        'updated-asc',
        'created-desc',
        'title',
      ].includes(data.sortMode)
        ? data.sortMode
        : 'updated-desc',
      languages,
    }
  } catch {
    return defaults()
  }
}

export function writeViewPreferences(
  demo: boolean,
  preferences: ViewPreferences,
  storage?: PreferenceStorage,
): void {
  try {
    ;(storage ?? window.localStorage).setItem(
      key(demo),
      JSON.stringify(preferences),
    )
  } catch {
    // View preferences are optional; card persistence continues through IndexedDB.
  }
}

export function rememberedLanguage(
  languages: ViewPreferences['languages'],
  id: string,
): CodeLanguage {
  return languages.find(([existing]) => existing === id)?.[1] ?? 'html'
}

export function rememberLanguage(
  languages: ViewPreferences['languages'],
  id: string,
  language: CodeLanguage,
) {
  return [
    ...languages.filter(([existing]) => existing !== id),
    [id, language] as [string, CodeLanguage],
  ].slice(-MAX_LANGUAGES)
}
