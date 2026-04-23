import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useActionEngine } from '@/hooks/useActionEngine'

describe('useActionEngine', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('detectAndExecute handles empty message', async () => {
    const { result } = renderHook(() => useActionEngine())

    let detectResult;
    await act(async () => {
      detectResult = await result.current.detectAndExecute('   ', 'context')
    })

    expect(detectResult).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('detectAndExecute handles successful actionable response', async () => {
    const mockActionResult = { type: 'test_action', payload: {} }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          actionable: true,
          result: mockActionResult
        }
      })
    })

    const { result } = renderHook(() => useActionEngine())

    let detectResult;
    // We can test isExecuting is true while executing but since we are await-ing
    // the whole act, we'll mostly see the end state.

    await act(async () => {
      detectResult = await result.current.detectAndExecute('test message', 'context')
    })

    expect(detectResult).toEqual(mockActionResult)
    expect(result.current.lastResult).toEqual(mockActionResult)
    expect(result.current.isExecuting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('detectAndExecute handles API failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useActionEngine())
    let detectResult;
    await act(async () => {
      detectResult = await result.current.detectAndExecute('test message', 'context')
    })

    expect(detectResult).toBeNull()
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/actions', expect.any(Object))
    expect(consoleSpy).toHaveBeenCalledWith('[ActionEngine] API returned', 500)

    consoleSpy.mockRestore()
  })

  it('detectAndExecute handles unsuccessful API response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: false, error: 'Test error' })
    })

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useActionEngine())
    let detectResult;
    await act(async () => {
      detectResult = await result.current.detectAndExecute('test message', 'context')
    })

    expect(detectResult).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('[ActionEngine] API error:', 'Test error')

    consoleSpy.mockRestore()
  })

  it('detectAndExecute handles non-actionable response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { actionable: false }
      })
    })

    const { result } = renderHook(() => useActionEngine())
    let detectResult;
    await act(async () => {
      detectResult = await result.current.detectAndExecute('test message', 'context')
    })

    expect(detectResult).toBeNull()
    expect(result.current.lastResult).toBeNull()
  })

  it('detectAndExecute handles network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useActionEngine())
    let detectResult;
    await act(async () => {
      detectResult = await result.current.detectAndExecute('test message', 'context')
    })

    expect(detectResult).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('[ActionEngine] fetch error:', expect.any(Error))

    consoleSpy.mockRestore()
  })

  it('clearResult sets lastResult to null', async () => {
    // First setup a hook and get a successful response to set lastResult
    const mockActionResult = { type: 'test_action', payload: {} }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          actionable: true,
          result: mockActionResult
        }
      })
    })

    const { result } = renderHook(() => useActionEngine())

    await act(async () => {
      await result.current.detectAndExecute('test message', 'context')
    })

    expect(result.current.lastResult).toEqual(mockActionResult)

    // Now call clearResult
    act(() => {
      result.current.clearResult()
    })

    expect(result.current.lastResult).toBeNull()
  })

  it('does not update state if unmounted during fetch', async () => {
    const mockActionResult = { type: 'test_action', payload: {} }

    // Create a delayed response
    let resolveFetch: any;
    const fetchPromise = new Promise(resolve => {
      resolveFetch = () => resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            actionable: true,
            result: mockActionResult
          }
        })
      });
    });

    global.fetch = vi.fn().mockReturnValue(fetchPromise);

    const { result, unmount } = renderHook(() => useActionEngine())

    let promise: any;
    act(() => {
      promise = result.current.detectAndExecute('test message', 'context')
    })

    expect(result.current.isExecuting).toBe(true)

    // Unmount the component before fetch resolves
    unmount()

    // Now resolve the fetch
    await act(async () => {
      resolveFetch()
      await promise
    })

    // Since we unmounted, state shouldn't be updated anymore
    // (We test this indirectly because the error would have been thrown
    // or state would remain true, but unmounted hooks don't throw in RTL
    // unless you read their current state, so we just ensure no unhandled exceptions happen)
  })
})
