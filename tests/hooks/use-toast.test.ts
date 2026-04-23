// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reducer, toast, useToast } from '@/hooks/use-toast'
import { renderHook, act } from '@testing-library/react'

describe('use-toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()

    // We can clean up by resetting the underlying state array by rendering the hook
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.dismiss()
    })
  })

  describe('reducer', () => {
    it('ADD_TOAST adds a toast and respects TOAST_LIMIT (1)', () => {
      const initialState = { toasts: [] }
      const action1 = {
        type: 'ADD_TOAST' as const,
        toast: { id: '1', title: 'Toast 1' }
      }

      const state1 = reducer(initialState, action1)
      expect(state1.toasts).toHaveLength(1)
      expect(state1.toasts[0].id).toBe('1')

      const action2 = {
        type: 'ADD_TOAST' as const,
        toast: { id: '2', title: 'Toast 2' }
      }

      const state2 = reducer(state1, action2)
      expect(state2.toasts).toHaveLength(1)
      expect(state2.toasts[0].id).toBe('2')
    })

    it('UPDATE_TOAST updates an existing toast', () => {
      const initialState = {
        toasts: [{ id: '1', title: 'Toast 1', open: true }]
      }
      const action = {
        type: 'UPDATE_TOAST' as const,
        toast: { id: '1', title: 'Updated Toast 1' }
      }

      const state = reducer(initialState, action)
      expect(state.toasts[0].title).toBe('Updated Toast 1')
      expect(state.toasts[0].open).toBe(true)
    })

    it('DISMISS_TOAST sets open to false for a specific toast', () => {
      const initialState = {
        toasts: [{ id: '1', title: 'Toast 1', open: true }]
      }
      const action = {
        type: 'DISMISS_TOAST' as const,
        toastId: '1'
      }

      const state = reducer(initialState, action)
      expect(state.toasts[0].open).toBe(false)
    })

    it('DISMISS_TOAST without id dismisses all toasts', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
        ]
      }
      const action = { type: 'DISMISS_TOAST' as const }

      const state = reducer(initialState, action)
      expect(state.toasts[0].open).toBe(false)
    })

    it('REMOVE_TOAST removes a specific toast', () => {
      const initialState = {
        toasts: [{ id: '1', title: 'Toast 1' }]
      }
      const action = {
        type: 'REMOVE_TOAST' as const,
        toastId: '1'
      }

      const state = reducer(initialState, action)
      expect(state.toasts).toHaveLength(0)
    })

    it('REMOVE_TOAST without id removes all toasts', () => {
      const initialState = {
        toasts: [{ id: '1', title: 'Toast 1' }]
      }
      const action = { type: 'REMOVE_TOAST' as const }

      const state = reducer(initialState, action)
      expect(state.toasts).toHaveLength(0)
    })
  })

  describe('toast standalone function', () => {
    it('calling toast() returns id, dismiss, update functions', () => {
      const result = toast({ title: 'Hello' })
      expect(result).toHaveProperty('id')
      expect(typeof result.dismiss).toBe('function')
      expect(typeof result.update).toBe('function')
    })

    it('toast.update() updates the toast', () => {
       const result = toast({ title: 'Original' })
       result.update({ id: result.id, title: 'Updated' })

       const { result: hookResult } = renderHook(() => useToast())
       const myToast = hookResult.current.toasts.find((t: any) => t.id === result.id)
       expect(myToast?.title).toBe('Updated')
    })

    it('toast.dismiss() dismisses the toast', () => {
       const result = toast({ title: 'Original' })
       result.dismiss()
       const { result: hookResult } = renderHook(() => useToast())
       const myToast = hookResult.current.toasts.find((t: any) => t.id === result.id)
       expect(myToast?.open).toBe(false)
    })

    it('handles side effects correctly on dismiss timeout', () => {
       const result = toast({ title: 'Remove Queue Test' })
       result.dismiss()
       // Fast forward the remove timeout
       vi.advanceTimersByTime(1000000)

       const { result: hookResult } = renderHook(() => useToast())
       // Since TOAST_REMOVE_DELAY is big, advancing timers should remove it
       const myToast = hookResult.current.toasts.find((t: any) => t.id === result.id)
       expect(myToast).toBeUndefined()
    })

    it('does not re-add to remove queue if already present', () => {
       const result = toast({ title: 'Multiple dismiss' })
       result.dismiss()
       result.dismiss() // second call should return early from addToRemoveQueue
       vi.advanceTimersByTime(1000000)

       const { result: hookResult } = renderHook(() => useToast())
       const myToast = hookResult.current.toasts.find((t: any) => t.id === result.id)
       expect(myToast).toBeUndefined()
    })
  })

  describe('useToast hook', () => {
    it('returns toasts, toast function, and dismiss function', () => {
      const { result } = renderHook(() => useToast())
      expect(Array.isArray(result.current.toasts)).toBe(true)
      expect(typeof result.current.toast).toBe('function')
      expect(typeof result.current.dismiss).toBe('function')
    })

    it('dismissing via hook works', () => {
      const { result } = renderHook(() => useToast())
      let t: any;

      act(() => {
        t = result.current.toast({ title: 'Test Hook' })
      })

      act(() => {
        result.current.dismiss(t.id)
      })

      const myToast = result.current.toasts.find((toastItem: any) => toastItem.id === t.id)
      expect(myToast?.open).toBe(false)
    })

    it('simulates unmount cleanup', () => {
      const { result, unmount } = renderHook(() => useToast())

      act(() => {
        result.current.toast({ title: 'Post-cleanup' })
      })

      expect(result.current.toasts.length).toBeGreaterThan(0)

      unmount()

      // We can't test listeners directly easily, but we know it unmounted without error
    })

    it('dismisses all when dismissing without id', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({ title: 'Toast 1' })
      })

      act(() => {
        result.current.dismiss()
      })

      expect(result.current.toasts[0].open).toBe(false)
    })
  })
})
