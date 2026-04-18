import { describe, it, expect } from 'vitest'
import { shouldUseTTS, truncateForTTS } from '../../../lib/ai/tts-optimizer'

describe('tts-optimizer', () => {
  describe('shouldUseTTS', () => {
    it('returns true when voice is enabled and no code blocks', () => {
      expect(shouldUseTTS('Hello there!', true)).toBe(true)
    })

    it('returns false when voice is disabled', () => {
      expect(shouldUseTTS('Hello there!', false)).toBe(false)
    })

    it('returns false when text contains a code block', () => {
      expect(shouldUseTTS('Here is some code: ```js\nconsole.log("hello")\n```', true)).toBe(false)
    })
  })

  describe('truncateForTTS', () => {
    it('returns original text if length is <= 800 characters', () => {
      const text = 'This is a short text. It has multiple sentences. Still short. Very short. And a fifth.'
      expect(truncateForTTS(text)).toBe(text)
    })

    it('truncates to 800 characters if text > 800 chars and <= 4 sentences', () => {
      const longSentence = 'A'.repeat(801) + '.'
      const result = truncateForTTS(longSentence)
      expect(result.length).toBe(803) // 800 + 3 for "..."
      expect(result.endsWith('...')).toBe(true)
      expect(result).toBe('A'.repeat(800) + '...')
    })

    it('extracts first 4 sentences if > 4 sentences and length > 800', () => {
      const s1 = 'Sentence one is quite long but not 800 chars.'
      const s2 = 'Sentence two is also a bit long.'
      const s3 = 'Sentence three is here.'
      const s4 = 'Sentence four is the last one we want.'
      const s5 = 'Sentence five should be removed. ' + 'A'.repeat(700)

      const text = [s1, s2, s3, s4, s5].join(' ')
      const result = truncateForTTS(text)

      const expectedTruncated = [s1, s2, s3, s4].join(' ') + '...'
      expect(result).toBe(expectedTruncated)
    })

    it('truncates to 800 chars if the first 4 sentences are together > 800 chars', () => {
      const s1 = 'A'.repeat(250) + '.'
      const s2 = 'B'.repeat(250) + '.'
      const s3 = 'C'.repeat(250) + '.'
      const s4 = 'D'.repeat(250) + '.'
      const s5 = 'E'.repeat(250) + '.'

      const text = [s1, s2, s3, s4, s5].join(' ')
      const result = truncateForTTS(text)

      expect(result.length).toBe(803)
      expect(result.endsWith('...')).toBe(true)

      const expectedPrefix = [s1, s2, s3, s4].join(' ').slice(0, 800)
      expect(result).toBe(expectedPrefix + '...')
    })
  })
})
