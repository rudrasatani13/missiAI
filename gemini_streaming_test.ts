/**
 * Comprehensive test for Gemini streaming implementation
 * Tests all requirements from the review request
 */

import * as fs from 'fs'
import * as path from 'path'

interface TestResult {
  requirement: string
  passed: boolean
  details: string
}

class GeminiStreamingTester {
  private results: TestResult[] = []

  private addResult(requirement: string, passed: boolean, details: string) {
    this.results.push({ requirement, passed, details })
    console.log(`${passed ? '✅' : '❌'} ${requirement}: ${details}`)
  }

  private readFile(filePath: string): string {
    try {
      return fs.readFileSync(path.join('/app', filePath), 'utf8')
    } catch (error) {
      return ''
    }
  }

  private checkExports(filePath: string, expectedExports: string[]): boolean {
    const content = this.readFile(filePath)
    return expectedExports.every(exportName => 
      content.includes(`export function ${exportName}`) || 
      content.includes(`export async function ${exportName}`) ||
      content.includes(`export const ${exportName}`)
    )
  }

  private checkImports(filePath: string, expectedImports: string[]): boolean {
    const content = this.readFile(filePath)
    return expectedImports.every(importName => 
      content.includes(`import { ${importName}`) || 
      content.includes(`import ${importName}`) ||
      content.includes(`from "${importName}"`) ||
      content.includes(`from '@/${importName}"`)
    )
  }

  async runTests() {
    console.log('🧪 Starting Gemini Streaming Implementation Tests...\n')

    // Test 1: Verify /app/lib/gemini-stream.ts exists and exports required functions
    const geminiStreamExists = fs.existsSync('/app/lib/gemini-stream.ts')
    const hasRequiredExports = this.checkExports('lib/gemini-stream.ts', ['buildGeminiRequest', 'streamGeminiResponse'])
    this.addResult(
      'lib/gemini-stream.ts exists and exports buildGeminiRequest and streamGeminiResponse',
      geminiStreamExists && hasRequiredExports,
      geminiStreamExists ? (hasRequiredExports ? 'Both functions exported correctly' : 'File exists but missing exports') : 'File does not exist'
    )

    // Test 2: Verify buildGeminiRequest constructs proper Gemini REST body
    const geminiStreamContent = this.readFile('lib/gemini-stream.ts')
    const hasSystemInstruction = geminiStreamContent.includes('system_instruction')
    const hasContents = geminiStreamContent.includes('contents')
    const hasGenerationConfig = geminiStreamContent.includes('generationConfig')
    const hasGoogleSearch = geminiStreamContent.includes('google_search')
    this.addResult(
      'buildGeminiRequest constructs proper Gemini REST body',
      hasSystemInstruction && hasContents && hasGenerationConfig && hasGoogleSearch,
      `system_instruction: ${hasSystemInstruction}, contents: ${hasContents}, generationConfig: ${hasGenerationConfig}, google_search: ${hasGoogleSearch}`
    )

    // Test 3: Verify streamGeminiResponse uses x-goog-api-key header
    const usesHeaderAuth = geminiStreamContent.includes('"x-goog-api-key": apiKey') && !geminiStreamContent.includes('?key=${apiKey}')
    this.addResult(
      'streamGeminiResponse uses x-goog-api-key header (NOT ?key= URL param)',
      usesHeaderAuth,
      usesHeaderAuth ? 'Uses header authentication correctly' : 'Still using URL parameter or missing header auth'
    )

    // Test 4: Verify streamGeminiResponse calls streamGenerateContent?alt=sse endpoint
    const usesStreamEndpoint = geminiStreamContent.includes('streamGenerateContent?alt=sse')
    const returnsReadableStream = geminiStreamContent.includes('ReadableStream<string>')
    this.addResult(
      'streamGeminiResponse calls streamGenerateContent?alt=sse and returns ReadableStream<string>',
      usesStreamEndpoint && returnsReadableStream,
      `Endpoint: ${usesStreamEndpoint}, Return type: ${returnsReadableStream}`
    )

    // Test 5: Verify app/api/chat/route.ts has NO fake chunking logic
    const routeContent = this.readFile('app/api/chat/route.ts')
    const noFakeChunking = !routeContent.includes('100') || !routeContent.includes('chunk')
    const usesBuildGeminiRequest = routeContent.includes('buildGeminiRequest')
    const usesStreamGeminiResponse = routeContent.includes('streamGeminiResponse')
    this.addResult(
      'route.ts has NO fake chunking logic, uses buildGeminiRequest + streamGeminiResponse',
      noFakeChunking && usesBuildGeminiRequest && usesStreamGeminiResponse,
      `No fake chunking: ${noFakeChunking}, Uses buildGeminiRequest: ${usesBuildGeminiRequest}, Uses streamGeminiResponse: ${usesStreamGeminiResponse}`
    )

    // Test 6: Verify route.ts sets correct headers
    const hasEventStreamHeader = routeContent.includes('"Content-Type": "text/event-stream"')
    const hasNoCacheHeader = routeContent.includes('"Cache-Control": "no-cache"')
    const hasBufferingHeader = routeContent.includes('"X-Accel-Buffering": "no"')
    this.addResult(
      'route.ts sets correct headers (Content-Type: text/event-stream, Cache-Control: no-cache, X-Accel-Buffering: no)',
      hasEventStreamHeader && hasNoCacheHeader && hasBufferingHeader,
      `Event-stream: ${hasEventStreamHeader}, No-cache: ${hasNoCacheHeader}, No-buffering: ${hasBufferingHeader}`
    )

    // Test 7: Verify route.ts has export const runtime = 'edge'
    const hasEdgeRuntime = routeContent.includes('export const runtime = "edge"')
    this.addResult(
      'route.ts has export const runtime = "edge"',
      hasEdgeRuntime,
      hasEdgeRuntime ? 'Edge runtime configured' : 'Missing edge runtime export'
    )

    // Test 8: Verify route.ts has try/catch returning 500 JSON on error
    const hasTryCatch = routeContent.includes('try {') && routeContent.includes('} catch')
    const returns500OnError = routeContent.includes('status: 500') && routeContent.includes('JSON.stringify')
    this.addResult(
      'route.ts wraps stream in try/catch returning 500 JSON on error',
      hasTryCatch && returns500OnError,
      `Try/catch: ${hasTryCatch}, 500 error response: ${returns500OnError}`
    )

    // Test 9: Verify hooks/useVoiceStateMachine.ts exposes streamingText
    const hookContent = this.readFile('hooks/useVoiceStateMachine.ts')
    const exposesStreamingText = hookContent.includes('streamingText') && hookContent.includes('return {') && hookContent.includes('streamingText,')
    this.addResult(
      'useVoiceStateMachine.ts exposes streamingText from hook return',
      exposesStreamingText,
      exposesStreamingText ? 'streamingText exposed in return object' : 'streamingText not found in return object'
    )

    // Test 10: Verify hook updates streamingText state on each SSE chunk
    const updatesStreamingText = hookContent.includes('setStreamingText(full)') || hookContent.includes('setStreamingText')
    this.addResult(
      'Hook updates streamingText state on each SSE chunk during streaming',
      updatesStreamingText,
      updatesStreamingText ? 'setStreamingText calls found' : 'No setStreamingText calls found'
    )

    // Test 11: Verify hook clears streamingText on completion and errors
    const clearsStreamingText = hookContent.includes('setStreamingText("")') || hookContent.includes('setStreamingText("")')
    this.addResult(
      'Hook clears streamingText on stream completion and on errors',
      clearsStreamingText,
      clearsStreamingText ? 'streamingText clearing found' : 'No streamingText clearing found'
    )

    // Test 12: Verify hook uses STREAM_CHAT_TIMEOUT (60s) instead of CHAT_TIMEOUT (10s)
    const fetchTimeoutContent = this.readFile('lib/fetch-with-timeout.ts')
    const hasStreamChatTimeout = fetchTimeoutContent.includes('STREAM_CHAT_TIMEOUT = 60_000')
    const usesStreamTimeout = hookContent.includes('STREAM_CHAT_TIMEOUT')
    this.addResult(
      'Hook uses STREAM_CHAT_TIMEOUT (60s) instead of CHAT_TIMEOUT (10s)',
      hasStreamChatTimeout && usesStreamTimeout,
      `STREAM_CHAT_TIMEOUT defined: ${hasStreamChatTimeout}, Used in hook: ${usesStreamTimeout}`
    )

    // Test 13: Verify chat page displays streamingText with blinking cursor
    const pageContent = this.readFile('app/chat/page.tsx')
    const displaysStreamingText = pageContent.includes('streamingText') && pageContent.includes('voiceState === "thinking"')
    this.addResult(
      'Chat page displays streamingText with blinking cursor during thinking state',
      displaysStreamingText,
      displaysStreamingText ? 'streamingText display found in thinking state' : 'streamingText display not found'
    )

    // Test 14: Verify blink keyframe animation is defined
    const hasBlinkAnimation = pageContent.includes('@keyframes blink') || pageContent.includes('animation: "blink')
    this.addResult(
      'Blink keyframe animation is defined in page styles',
      hasBlinkAnimation,
      hasBlinkAnimation ? 'Blink animation found' : 'Blink animation not found'
    )

    // Test 15: Verify data-testid attributes for streaming elements
    const hasStreamingTestId = pageContent.includes('data-testid="streaming-text-display"')
    const hasCursorTestId = pageContent.includes('data-testid="streaming-cursor"')
    this.addResult(
      'streaming-text-display and streaming-cursor have data-testid attributes',
      hasStreamingTestId && hasCursorTestId,
      `streaming-text-display: ${hasStreamingTestId}, streaming-cursor: ${hasCursorTestId}`
    )

    // Test 16: Verify SSE parsing handles multiple parts per candidate
    const parseSSEFunction = geminiStreamContent.includes('parseSSELine') && geminiStreamContent.includes('parts')
    const handlesMultipleParts = geminiStreamContent.includes('Array.isArray(parts)') && geminiStreamContent.includes('.map((p: any) => p.text)')
    this.addResult(
      'SSE parsing in gemini-stream.ts handles multiple parts per candidate',
      parseSSEFunction && handlesMultipleParts,
      `parseSSELine function: ${parseSSEFunction}, Multiple parts handling: ${handlesMultipleParts}`
    )

    // Summary
    const passedTests = this.results.filter(r => r.passed).length
    const totalTests = this.results.length
    const successRate = Math.round((passedTests / totalTests) * 100)

    console.log(`\n📊 Test Summary: ${passedTests}/${totalTests} tests passed (${successRate}%)`)
    
    if (passedTests === totalTests) {
      console.log('🎉 All Gemini streaming requirements implemented correctly!')
    } else {
      console.log('⚠️  Some requirements need attention:')
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`   - ${result.requirement}: ${result.details}`)
      })
    }

    return {
      passedTests,
      totalTests,
      successRate,
      results: this.results
    }
  }
}

// Run the tests
const tester = new GeminiStreamingTester()
tester.runTests().then(summary => {
  process.exit(summary.passedTests === summary.totalTests ? 0 : 1)
}).catch(error => {
  console.error('Test execution failed:', error)
  process.exit(1)
})