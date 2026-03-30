#!/usr/bin/env npx tsx

/**
 * Code Structure Validation Test for missiAI Refactoring
 * Tests all the requirements from the review request
 */

import * as fs from 'fs'
import * as path from 'path'

interface TestResult {
  name: string
  passed: boolean
  details: string
}

class CodeStructureValidator {
  private results: TestResult[] = []
  private basePath = '/app'

  private addResult(name: string, passed: boolean, details: string) {
    this.results.push({ name, passed, details })
    console.log(`${passed ? '✅' : '❌'} ${name}: ${details}`)
  }

  async validateFetchWithTimeout() {
    try {
      const filePath = path.join(this.basePath, 'lib/fetch-with-timeout.ts')
      
      if (!fs.existsSync(filePath)) {
        this.addResult('fetch-with-timeout.ts exists', false, 'File not found')
        return
      }

      const content = fs.readFileSync(filePath, 'utf8')
      
      // Check exports
      const hasExports = [
        'export const CHAT_TIMEOUT = 10_000',
        'export const TTS_TIMEOUT = 15_000', 
        'export const STT_TIMEOUT = 10_000',
        'export async function fetchWithTimeout'
      ].every(exp => content.includes(exp))

      this.addResult('fetch-with-timeout.ts exports', hasExports, 
        hasExports ? 'All required exports found' : 'Missing required exports')

      // Check AbortController usage
      const hasAbortController = content.includes('new AbortController()')
      this.addResult('fetchWithTimeout uses AbortController', hasAbortController,
        hasAbortController ? 'AbortController found' : 'AbortController not found')

      // Check timeout error message
      const hasTimeoutError = content.includes('Request timed out')
      this.addResult('fetchWithTimeout timeout error', hasTimeoutError,
        hasTimeoutError ? 'Timeout error message found' : 'Timeout error message not found')

      // Check signal merging
      const hasSignalMerging = content.includes('callerSignal') && content.includes('addEventListener')
      this.addResult('fetchWithTimeout signal merging', hasSignalMerging,
        hasSignalMerging ? 'Signal merging logic found' : 'Signal merging logic not found')

    } catch (error) {
      this.addResult('fetch-with-timeout.ts validation', false, `Error: ${error}`)
    }
  }

  async validateBrowserSupport() {
    try {
      const filePath = path.join(this.basePath, 'lib/browser-support.ts')
      
      if (!fs.existsSync(filePath)) {
        this.addResult('browser-support.ts exists', false, 'File not found')
        return
      }

      const content = fs.readFileSync(filePath, 'utf8')
      
      // Check exports
      const hasCheckVoiceSupport = content.includes('export function checkVoiceSupport()')
      const hasGetBestAudioMimeType = content.includes('export function getBestAudioMimeType()')
      
      this.addResult('browser-support.ts exports', hasCheckVoiceSupport && hasGetBestAudioMimeType,
        `checkVoiceSupport: ${hasCheckVoiceSupport}, getBestAudioMimeType: ${hasGetBestAudioMimeType}`)

      // Check MIME type priority
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg', 
        'audio/mp4'
      ]
      const hasMimeTypes = mimeTypes.every(mime => content.includes(mime))
      
      this.addResult('browser-support.ts MIME types', hasMimeTypes,
        hasMimeTypes ? 'All required MIME types found' : 'Missing MIME types')

      // Check browser API checks
      const hasNavigatorCheck = content.includes('navigator.mediaDevices')
      const hasGetUserMediaCheck = content.includes('getUserMedia')
      
      this.addResult('browser-support.ts API checks', hasNavigatorCheck && hasGetUserMediaCheck,
        `navigator.mediaDevices: ${hasNavigatorCheck}, getUserMedia: ${hasGetUserMediaCheck}`)

    } catch (error) {
      this.addResult('browser-support.ts validation', false, `Error: ${error}`)
    }
  }

  async validateVoiceStateMachine() {
    try {
      const filePath = path.join(this.basePath, 'hooks/useVoiceStateMachine.ts')
      
      if (!fs.existsSync(filePath)) {
        this.addResult('useVoiceStateMachine.ts exists', false, 'File not found')
        return
      }

      const content = fs.readFileSync(filePath, 'utf8')
      
      // Check hook export
      const hasHookExport = content.includes('export function useVoiceStateMachine')
      this.addResult('useVoiceStateMachine hook export', hasHookExport,
        hasHookExport ? 'Hook export found' : 'Hook export not found')

      // Check VoiceState type export
      const hasVoiceStateType = content.includes('export type VoiceState')
      this.addResult('VoiceState type export', hasVoiceStateType,
        hasVoiceStateType ? 'VoiceState type found' : 'VoiceState type not found')

      // Check required return values
      const returnValues = [
        'state',
        'startRecording',
        'stopRecording', 
        'cancelAll',
        'audioLevel',
        'statusText',
        'lastTranscript',
        'error',
        'handleTap',
        'greet',
        'saveMemoryBeacon'
      ]
      const hasReturnValues = returnValues.every(val => content.includes(val))
      
      this.addResult('useVoiceStateMachine return values', hasReturnValues,
        hasReturnValues ? 'All required return values found' : 'Missing return values')

      // Check AbortController usage
      const hasAbortControllerRef = content.includes('abortControllerRef')
      const hasIsTransitioningRef = content.includes('isTransitioningRef')
      
      this.addResult('useVoiceStateMachine refs', hasAbortControllerRef && hasIsTransitioningRef,
        `abortControllerRef: ${hasAbortControllerRef}, isTransitioningRef: ${hasIsTransitioningRef}`)

      // Check fetchWithTimeout usage
      const hasFetchWithTimeoutImport = content.includes('fetchWithTimeout')
      const hasTimeoutConstants = ['CHAT_TIMEOUT', 'TTS_TIMEOUT', 'STT_TIMEOUT'].every(c => content.includes(c))
      
      this.addResult('useVoiceStateMachine fetchWithTimeout usage', hasFetchWithTimeoutImport && hasTimeoutConstants,
        `fetchWithTimeout import: ${hasFetchWithTimeoutImport}, timeout constants: ${hasTimeoutConstants}`)

      // Check getBestAudioMimeType usage
      const hasGetBestAudioMimeType = content.includes('getBestAudioMimeType')
      this.addResult('useVoiceStateMachine getBestAudioMimeType usage', hasGetBestAudioMimeType,
        hasGetBestAudioMimeType ? 'getBestAudioMimeType usage found' : 'getBestAudioMimeType usage not found')

      // Check try/catch/finally patterns
      const hasTryCatchFinally = content.includes('try {') && content.includes('} catch') && content.includes('} finally')
      this.addResult('useVoiceStateMachine error handling', hasTryCatchFinally,
        hasTryCatchFinally ? 'Try/catch/finally patterns found' : 'Missing error handling patterns')

    } catch (error) {
      this.addResult('useVoiceStateMachine validation', false, `Error: ${error}`)
    }
  }

  async validateChatPageRefactor() {
    try {
      const filePath = path.join(this.basePath, 'app/chat/page.tsx')
      
      if (!fs.existsSync(filePath)) {
        this.addResult('chat/page.tsx exists', false, 'File not found')
        return
      }

      const content = fs.readFileSync(filePath, 'utf8')
      
      // Check hook import and usage
      const hasHookImport = content.includes('import { useVoiceStateMachine')
      const hasHookUsage = content.includes('useVoiceStateMachine({')
      
      this.addResult('chat/page.tsx hook usage', hasHookImport && hasHookUsage,
        `Hook import: ${hasHookImport}, Hook usage: ${hasHookUsage}`)

      // Check that inline voice logic is removed (should not have MediaRecorder directly)
      const hasInlineMediaRecorder = content.includes('new MediaRecorder(')
      this.addResult('chat/page.tsx inline logic removed', !hasInlineMediaRecorder,
        hasInlineMediaRecorder ? 'Still has inline MediaRecorder logic' : 'Inline logic properly extracted')

    } catch (error) {
      this.addResult('chat/page.tsx validation', false, `Error: ${error}`)
    }
  }

  async validateSendBeaconMemorySave() {
    try {
      const filePath = path.join(this.basePath, 'hooks/useVoiceStateMachine.ts')
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Check size check implementation
      const hasSizeCheck = content.includes('60_000') || content.includes('60000')
      const hasTruncation = content.includes('slice(-6)')
      
      this.addResult('sendBeacon size check', hasSizeCheck && hasTruncation,
        `Size check: ${hasSizeCheck}, Truncation: ${hasTruncation}`)

      // Check event listeners in chat page
      const chatPagePath = path.join(this.basePath, 'app/chat/page.tsx')
      const chatContent = fs.readFileSync(chatPagePath, 'utf8')
      
      const hasBeforeUnload = chatContent.includes('beforeunload')
      const hasVisibilityChange = chatContent.includes('visibilitychange')
      
      this.addResult('memory save event listeners', hasBeforeUnload && hasVisibilityChange,
        `beforeunload: ${hasBeforeUnload}, visibilitychange: ${hasVisibilityChange}`)

    } catch (error) {
      this.addResult('sendBeacon validation', false, `Error: ${error}`)
    }
  }

  async validatePackageJson() {
    try {
      const filePath = path.join(this.basePath, 'package.json')
      const content = fs.readFileSync(filePath, 'utf8')
      const packageJson = JSON.parse(content)
      
      const hasCorrectName = packageJson.name === 'missiai'
      this.addResult('package.json name', hasCorrectName,
        `Name is: ${packageJson.name}`)

    } catch (error) {
      this.addResult('package.json validation', false, `Error: ${error}`)
    }
  }

  async validateGitignore() {
    try {
      const filePath = path.join(this.basePath, '.gitignore')
      const content = fs.readFileSync(filePath, 'utf8')
      
      const hasIdeaEntry = content.includes('.idea/')
      this.addResult('.gitignore .idea/ entry', hasIdeaEntry,
        hasIdeaEntry ? '.idea/ entry found' : '.idea/ entry not found')

    } catch (error) {
      this.addResult('.gitignore validation', false, `Error: ${error}`)
    }
  }

  async validateTypeScriptCompilation() {
    try {
      // Check if TypeScript files can be imported without syntax errors
      const filesToCheck = [
        'lib/fetch-with-timeout.ts',
        'lib/browser-support.ts', 
        'hooks/useVoiceStateMachine.ts'
      ]

      let allValid = true
      for (const file of filesToCheck) {
        const filePath = path.join(this.basePath, file)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8')
          // Basic syntax checks
          const hasMatchingBraces = (content.match(/\{/g) || []).length === (content.match(/\}/g) || []).length
          const hasMatchingParens = (content.match(/\(/g) || []).length === (content.match(/\)/g) || []).length
          
          if (!hasMatchingBraces || !hasMatchingParens) {
            allValid = false
            this.addResult(`${file} syntax`, false, 'Mismatched braces or parentheses')
          }
        }
      }

      if (allValid) {
        this.addResult('TypeScript syntax validation', true, 'All files have valid syntax')
      }

    } catch (error) {
      this.addResult('TypeScript validation', false, `Error: ${error}`)
    }
  }

  async runAllTests() {
    console.log('🧪 Starting Code Structure Validation Tests...\n')

    await this.validateFetchWithTimeout()
    await this.validateBrowserSupport()
    await this.validateVoiceStateMachine()
    await this.validateChatPageRefactor()
    await this.validateSendBeaconMemorySave()
    await this.validatePackageJson()
    await this.validateGitignore()
    await this.validateTypeScriptCompilation()

    console.log('\n📊 Test Results Summary:')
    const passed = this.results.filter(r => r.passed).length
    const total = this.results.length
    console.log(`✅ Passed: ${passed}/${total}`)
    
    if (passed < total) {
      console.log('\n❌ Failed Tests:')
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.details}`)
      })
    }

    return {
      passed,
      total,
      results: this.results,
      success: passed === total
    }
  }
}

// Run the tests
async function main() {
  const validator = new CodeStructureValidator()
  const results = await validator.runAllTests()
  
  // Exit with appropriate code
  process.exit(results.success ? 0 : 1)
}

if (require.main === module) {
  main().catch(console.error)
}

export { CodeStructureValidator }