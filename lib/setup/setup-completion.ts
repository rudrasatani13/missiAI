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
  } catch (e) {
    // P3-4 fix: log instead of silently swallowing — helps debug persistent
    // failures in constrained environments (e.g. Safari private mode).
    console.warn('[setup] Failed to mark setup complete in localStorage:', e)
  }
}
