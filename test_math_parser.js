// Quick test of the safe math parser functionality
import { executeAction } from "./lib/actions/action-executor.js"

async function testMathParser() {
  console.log("Testing safe math parser...")
  
  // Test cases from requirements
  const testCases = [
    { expression: "2 + 2", expected: "4" },
    { expression: "15% of 2400", expected: "360" },
    { expression: "12 * 5", expected: "60" }
  ]
  
  for (const testCase of testCases) {
    try {
      const intent = {
        type: "calculate",
        confidence: 0.9,
        parameters: { expression: testCase.expression },
        rawUserMessage: testCase.expression
      }
      
      const result = await executeAction(intent, "test-key")
      console.log(`${testCase.expression} = ${result.output}`)
      
      if (result.success && result.output.includes(testCase.expected)) {
        console.log(`✅ PASS: ${testCase.expression}`)
      } else {
        console.log(`❌ FAIL: ${testCase.expression}`)
        console.log(`Expected: ${testCase.expected}, Got: ${result.output}`)
      }
    } catch (error) {
      console.log(`❌ ERROR: ${testCase.expression} - ${error.message}`)
    }
  }
}

testMathParser()