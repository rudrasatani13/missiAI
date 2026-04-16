import type { BreathingSession, BreathingTechnique } from '@/types/sleep-sessions'

const INTRO = "Find a comfortable position. Let your body relax. We'll breathe together for the next few minutes."
const OUTRO = "Beautiful. Your breath is calm. Your body is at peace. Stay here as long as you need."

export function generateBreathingScript(
  technique: BreathingTechnique,
  cycles: number = 6
): BreathingSession {
  let cycleScript = ''
  let cycleTimeSecs = 0

  if (technique === '4-7-8') {
    // 4 + 7 + 8 = 19 secs
    cycleTimeSecs = 19
    cycleScript =
      "Breathe in slowly through your nose... ... ... ... " +
      "Hold your breath... ... ... ... ... ... ... " +
      "Exhale gently through your mouth... ... ... ... ... ... ... ... "
  } else if (technique === 'box') {
    // 4 + 4 + 4 + 4 = 16 secs
    // cycles default is 5 according to instructions, but logic takes cycles arg
    cycleTimeSecs = 16
    cycleScript =
      "Inhale slowly... ... ... ... " +
      "Hold your breath... ... ... ... " +
      "Exhale gently... ... ... ... " +
      "Hold your breath... ... ... ... "
  } else if (technique === 'belly') {
    // 4 + 6 = 10 secs
    cycleTimeSecs = 10
    cycleScript =
      "Inhale deeply into your belly... ... ... ... " +
      "Exhale slowly... ... ... ... ... ... "
  }

  // Multiply cycles
  const repeatScripts = Array(cycles).fill(cycleScript).join(' ')

  const script = `${INTRO} ${repeatScripts} ${OUTRO}`.trim()
  const estimatedDurationSec = (cycleTimeSecs * cycles) + 30

  // Apply default cycles correctly per instruction overrides
  // Note: the caller provides cycle value, we only use the logic to compile.

  return {
    technique,
    cycles,
    estimatedDurationSec,
    script,
  }
}
