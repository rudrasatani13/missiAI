import { describe, it, expect } from 'vitest'
import {
  getLibraryStory,
  getAllLibraryStories,
  getLibraryStoriesByCategory,
  getRandomFallbackStory,
  LIBRARY_STORIES
} from '@/lib/sleep-sessions/library-stories'

describe('Library Stories', () => {
  describe('getLibraryStory', () => {
    it('returns the correct story for an existing ID', () => {
      const story = getLibraryStory('library-nature-forest')
      expect(story).toBeDefined()
      expect(story?.id).toBe('library-nature-forest')
      expect(story?.title).toBe('A Walk Through the Ancient Redwood Forest')
    })

    it('returns null for a non-existent ID', () => {
      const story = getLibraryStory('invalid-id-123')
      expect(story).toBeNull()
    })
  })

  describe('getAllLibraryStories', () => {
    it('returns all library stories', () => {
      const stories = getAllLibraryStories()
      expect(stories).toBeDefined()
      expect(stories).toBeInstanceOf(Array)
      expect(stories.length).toBe(LIBRARY_STORIES.length)
      expect(stories).toEqual(LIBRARY_STORIES)
    })
  })

  describe('getLibraryStoriesByCategory', () => {
    it('returns stories for an existing category', () => {
      const natureStories = getLibraryStoriesByCategory('nature')
      expect(natureStories).toBeDefined()
      expect(natureStories).toBeInstanceOf(Array)
      expect(natureStories.length).toBeGreaterThan(0)
      natureStories.forEach((story) => {
        expect(story.category).toBe('nature')
      })
    })

    it('returns empty array for a non-existent category', () => {
      // @ts-expect-error - testing invalid category
      const unknownStories = getLibraryStoriesByCategory('unknown-category')
      expect(unknownStories).toBeDefined()
      expect(unknownStories).toBeInstanceOf(Array)
      expect(unknownStories.length).toBe(0)
    })
  })

  describe('getRandomFallbackStory', () => {
    it('returns a fallback story', () => {
      const story = getRandomFallbackStory()
      expect(story).toBeDefined()
      expect(story).toHaveProperty('id')
      expect(story).toHaveProperty('title')
      expect(story).toHaveProperty('text')
    })

    it('returns a nature story if available', () => {
      const story = getRandomFallbackStory()
      expect(story.category).toBe('nature')
    })
  })
})
