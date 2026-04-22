export const SETUP_COMPLETE_STORAGE_KEY = 'missi-setup-complete'

export function hasCompletedSetupLocally(): boolean {
  if (typeof window === 'undefined') return false

  try {
    return localStorage.getItem(SETUP_COMPLETE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function markSetupCompleteLocally(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(SETUP_COMPLETE_STORAGE_KEY, 'true')
  } catch {}
}
