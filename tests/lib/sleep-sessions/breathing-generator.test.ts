import { generateBreathingScript } from '@/lib/sleep-sessions/breathing-generator'

describe('Breathing Generator', () => {
  it('generateBreathingScript returns script of expected format for 4-7-8', () => {
      const result = generateBreathingScript('4-7-8', 6)
      expect(result.technique).toBe('4-7-8')
      expect(result.cycles).toBe(6)
      expect(result.script).toContain("Breathe in slowly through your nose")
      expect(result.script).toContain("Hold your breath")
      expect(result.script).toContain("Exhale gently through your mouth")
  })

  it('Script includes intro and outro text', () => {
      const result = generateBreathingScript('box', 5)
      expect(result.script).toContain("We'll breathe together for the next few minutes.")
      expect(result.script).toContain("Beautiful. Your breath is calm.")
  })

  it('estimatedDurationSec matches the script expected time', () => {
      // 4-7-8 cycle is 19 secs. 6 cycles = 114 secs. +30 intro/outro = 144
      const result = generateBreathingScript('4-7-8', 6)
      expect(result.estimatedDurationSec).toBe(144)
  })

  it('All three techniques produce valid scripts', () => {
      const box = generateBreathingScript('box', 5)
      expect(box.script).toContain("Inhale slowly")
      
      const belly = generateBreathingScript('belly', 8)
      expect(belly.script).toContain("Inhale deeply into your belly")

      const countLeaves478 = generateBreathingScript('4-7-8', 6).script.split('Exhale gently').length - 1
      expect(countLeaves478).toBe(6)
  })
})
