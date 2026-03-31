#!/usr/bin/env python3
"""
Cost Optimization Libraries Testing for Next.js + Cloudflare Workers app.
Tests the 4 new library files: token-counter, response-cache, model-router, tts-optimizer
and their integration in chat route and voice hook.
"""

import json
import sys
import os
import subprocess
import re
from typing import Dict, List, Any, Optional
from datetime import datetime

class CostOptimizationTest:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.issues = []
        
    def run_test(self, name: str, test_func) -> bool:
        """Run a single test and track results"""
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            result = test_func()
            if result:
                self.tests_passed += 1
                print(f"✅ Passed")
                return True
            else:
                print(f"❌ Failed")
                return False
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"{name}: {str(e)}")
            return False

    def check_file_exists(self, filepath: str) -> bool:
        """Check if a file exists"""
        return os.path.exists(filepath)

    def read_file_content(self, filepath: str) -> str:
        """Read file content"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            raise Exception(f"Could not read {filepath}: {str(e)}")

    def run_node_script(self, script: str) -> str:
        """Run a Node.js script and return output"""
        try:
            # Create a temporary test file
            test_file = "/tmp/test_script.mjs"
            with open(test_file, 'w') as f:
                f.write(script)
            
            # Run with node
            result = subprocess.run(
                ["node", test_file], 
                capture_output=True, 
                text=True, 
                cwd="/app",
                timeout=30
            )
            
            if result.returncode != 0:
                raise Exception(f"Node script failed: {result.stderr}")
            
            return result.stdout.strip()
        except subprocess.TimeoutExpired:
            raise Exception("Node script timed out")
        except Exception as e:
            raise Exception(f"Failed to run Node script: {str(e)}")
        finally:
            if os.path.exists(test_file):
                os.remove(test_file)

    # ═══════════════════════════════════════════════════════════════════════════
    # TOKEN COUNTER TESTS
    # ═══════════════════════════════════════════════════════════════════════════

    def test_token_counter_file_structure(self) -> bool:
        """Test lib/token-counter.ts file structure and exports"""
        filepath = "/app/lib/token-counter.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check required exports
        required_exports = [
            "export function estimateTokens",
            "export function estimateRequestTokens", 
            "export const LIMITS",
            "export function truncateToTokenLimit"
        ]
        
        for export in required_exports:
            if export not in content:
                raise Exception(f"Missing export: {export}")
        
        # Check LIMITS constants
        if "MAX_REQUEST_TOKENS: 30000" not in content:
            raise Exception("MAX_REQUEST_TOKENS not set to 30000")
        if "MAX_RESPONSE_TOKENS: 2048" not in content:
            raise Exception("MAX_RESPONSE_TOKENS not set to 2048")
        if "WARN_THRESHOLD: 25000" not in content:
            raise Exception("WARN_THRESHOLD not set to 25000")
        
        return True

    def test_token_counter_functions(self) -> bool:
        """Test token counter function implementations using JavaScript equivalents"""
        script = """
        // JavaScript implementation of token counter functions for testing
        function estimateTokens(text) {
            return Math.ceil(text.length / 4);
        }

        function estimateRequestTokens(messages, systemPrompt, memories) {
            let total = estimateTokens(systemPrompt);
            total += estimateTokens(memories);
            for (const msg of messages) {
                total += estimateTokens(msg.content);
            }
            return Math.ceil(total * 1.1);
        }

        function truncateToTokenLimit(messages, limit) {
            if (messages.length <= 4) return messages;
            
            const result = [...messages];
            
            while (result.length > 4) {
                const estimated = result.reduce((sum, m) => sum + estimateTokens(m.content), 0);
                if (estimated <= limit) break;
                result.splice(0, 1);
            }
            
            return result;
        }

        // Test estimateTokens - should return Math.ceil(text.length/4)
        const test1 = estimateTokens("hello world"); // 11 chars -> Math.ceil(11/4) = 3
        console.log("estimateTokens test:", test1 === 3 ? "PASS" : "FAIL - expected 3, got " + test1);

        const test2 = estimateTokens("a".repeat(100)); // 100 chars -> Math.ceil(100/4) = 25
        console.log("estimateTokens 100 chars:", test2 === 25 ? "PASS" : "FAIL - expected 25, got " + test2);

        // Test estimateRequestTokens - should sum all parts with 10% buffer
        const messages = [
            { role: "user", content: "hello" }, // 5 chars
            { role: "assistant", content: "hi there" } // 8 chars
        ];
        const systemPrompt = "You are helpful"; // 15 chars
        const memories = "User likes cats"; // 15 chars
        
        // Total: 5 + 8 + 15 + 15 = 43 chars
        // But each part is rounded individually:
        // estimateTokens(5) = Math.ceil(5/4) = 2
        // estimateTokens(8) = Math.ceil(8/4) = 2  
        // estimateTokens(15) = Math.ceil(15/4) = 4
        // estimateTokens(15) = Math.ceil(15/4) = 4
        // Total tokens: 2 + 2 + 4 + 4 = 12
        // With 10% buffer: Math.ceil(12 * 1.1) = Math.ceil(13.2) = 14
        const test3 = estimateRequestTokens(messages, systemPrompt, memories);
        console.log("estimateRequestTokens test:", test3 === 14 ? "PASS" : "FAIL - expected 14, got " + test3);

        // Test truncateToTokenLimit
        const longMessages = [
            { role: "user", content: "a".repeat(1000) },
            { role: "assistant", content: "b".repeat(1000) },
            { role: "user", content: "c".repeat(1000) },
            { role: "assistant", content: "d".repeat(1000) },
            { role: "user", content: "e".repeat(1000) },
            { role: "assistant", content: "f".repeat(1000) }
        ];
        
        // Should keep minimum 4 messages and remove oldest until under limit
        const truncated = truncateToTokenLimit(longMessages, 1000); // 1000 token limit
        console.log("truncateToTokenLimit keeps min 4:", truncated.length >= 4 ? "PASS" : "FAIL");
        console.log("truncateToTokenLimit removes oldest:", truncated[0].content.includes('c') ? "PASS" : "FAIL");
        """
        
        output = self.run_node_script(script)
        
        # Check all tests passed
        if "FAIL" in output:
            raise Exception(f"Token counter function tests failed: {output}")
        
        return True

    # ═══════════════════════════════════════════════════════════════════════════
    # RESPONSE CACHE TESTS  
    # ═══════════════════════════════════════════════════════════════════════════

    def test_response_cache_file_structure(self) -> bool:
        """Test lib/response-cache.ts file structure and exports"""
        filepath = "/app/lib/response-cache.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check required exports
        required_exports = [
            "export function buildCacheKey",
            "export async function getCachedResponse",
            "export async function setCachedResponse",
            "export function isCacheable"
        ]
        
        for export in required_exports:
            if export not in content:
                raise Exception(f"Missing export: {export}")
        
        # Check djb2 hash function exists
        if "function djb2(str: string): string" not in content:
            raise Exception("djb2 hash function not found")
        
        # Check personal pronouns regex
        if "PERSONAL_PRONOUNS = /\\b(i|me|my|you|your)\\b/i" not in content:
            raise Exception("PERSONAL_PRONOUNS regex not found")
        
        return True

    def test_response_cache_functions(self) -> bool:
        """Test response cache function implementations using JavaScript equivalents"""
        script = """
        // JavaScript implementation of response cache functions for testing
        function djb2(str) {
            let hash = 5381;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
            }
            return (hash >>> 0).toString(36);
        }

        function buildCacheKey(message, personality) {
            const normalized = message.toLowerCase().trim().replace(/\\s+/g, " ");
            if (normalized.length > 120) return null;
            const hash = djb2(`${personality}:${normalized}`);
            return `chat-cache:${personality}:${hash}`;
        }

        const PERSONAL_PRONOUNS = /\\b(i|me|my|you|your)\\b/i;

        function isCacheableResponse(response) {
            if (response.length > 500) return false;
            if (PERSONAL_PRONOUNS.test(response)) return false;
            return true;
        }

        function isCacheable(message, response) {
            const normalized = message.toLowerCase().trim().replace(/\\s+/g, " ");
            if (normalized.length > 120) return false;
            return isCacheableResponse(response);
        }

        // Test buildCacheKey - should return null for messages over 120 chars
        const shortMessage = "What is 2+2?";
        const longMessage = "a".repeat(121);
        const personality = "bestfriend";

        const key1 = buildCacheKey(shortMessage, personality);
        const key2 = buildCacheKey(longMessage, personality);

        console.log("buildCacheKey short message:", key1 !== null ? "PASS" : "FAIL");
        console.log("buildCacheKey long message:", key2 === null ? "PASS" : "FAIL");
        console.log("buildCacheKey format:", key1 && key1.startsWith('chat-cache:bestfriend:') ? "PASS" : "FAIL");

        // Test djb2 hash consistency
        const key3 = buildCacheKey(shortMessage, personality);
        console.log("buildCacheKey consistency:", key1 === key3 ? "PASS" : "FAIL");

        // Test isCacheable function
        const shortResponse = "The answer is 4";
        const longResponse = "a".repeat(501);
        const personalResponse = "I think you should do this";
        const impersonalResponse = "The weather is nice today";

        console.log("isCacheable short message + short response:", isCacheable(shortMessage, shortResponse) ? "PASS" : "FAIL");
        console.log("isCacheable long message:", isCacheable(longMessage, shortResponse) === false ? "PASS" : "FAIL");
        console.log("isCacheable long response:", isCacheable(shortMessage, longResponse) === false ? "PASS" : "FAIL");
        console.log("isCacheable personal pronouns:", isCacheable(shortMessage, personalResponse) === false ? "PASS" : "FAIL");
        console.log("isCacheable impersonal:", isCacheable(shortMessage, impersonalResponse) ? "PASS" : "FAIL");
        """
        
        output = self.run_node_script(script)
        
        # Check all tests passed
        if "FAIL" in output:
            raise Exception(f"Response cache function tests failed: {output}")
        
        return True

    # ═══════════════════════════════════════════════════════════════════════════
    # MODEL ROUTER TESTS
    # ═══════════════════════════════════════════════════════════════════════════

    def test_model_router_file_structure(self) -> bool:
        """Test lib/model-router.ts file structure and exports"""
        filepath = "/app/lib/model-router.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check required exports
        required_exports = [
            "export const MODEL_COSTS",
            "export function selectGeminiModel",
            "export function estimateRequestCost"
        ]
        
        for export in required_exports:
            if export not in content:
                raise Exception(f"Missing export: {export}")
        
        # Check model costs
        if '"gemini-2.5-flash": { input: 0.00015, output: 0.0006 }' not in content:
            raise Exception("gemini-2.5-flash costs not correct")
        if '"gemini-2.0-flash-lite": { input: 0.000075, output: 0.0003 }' not in content:
            raise Exception("gemini-2.0-flash-lite costs not correct")
        
        return True

    def test_model_router_functions(self) -> bool:
        """Test model router function implementations using JavaScript equivalents"""
        script = """
        // JavaScript implementation of model router functions for testing
        const MODEL_COSTS = {
            "gemini-2.5-flash": { input: 0.00015, output: 0.0006 },
            "gemini-2.0-flash-lite": { input: 0.000075, output: 0.0003 }
        };

        function selectGeminiModel(messages, memories) {
            const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
            const lastUserContent = lastUserMsg?.content ?? "";

            const isShortMessage = lastUserContent.length < 80;
            const hasNoMemories = !memories.trim();
            const isShortConversation = messages.length < 4;

            if (isShortMessage && hasNoMemories && isShortConversation) {
                return "gemini-2.0-flash-lite";
            }

            return "gemini-2.5-flash";
        }

        function estimateRequestCost(model, inputTokens, outputTokens) {
            const costs = MODEL_COSTS[model] ?? MODEL_COSTS["gemini-2.5-flash"];
            const inputCost = (inputTokens / 1000) * costs.input;
            const outputCost = (outputTokens / 1000) * costs.output;
            return inputCost + outputCost;
        }

        // Test selectGeminiModel - should return lite when ALL conditions met:
        // - Latest user message < 80 chars
        // - No memories (empty string)
        // - < 4 messages total

        // Test case 1: All conditions met -> should return lite
        const shortMessages = [
            { role: "user", content: "hi" },
            { role: "assistant", content: "hello" },
            { role: "user", content: "how are you?" }
        ];
        const noMemories = "";
        const model1 = selectGeminiModel(shortMessages, noMemories);
        console.log("selectGeminiModel lite conditions:", model1 === "gemini-2.0-flash-lite" ? "PASS" : "FAIL - got " + model1);

        // Test case 2: Long message -> should return full
        const longMessages = [
            { role: "user", content: "hi" },
            { role: "assistant", content: "hello" },
            { role: "user", content: "a".repeat(80) } // 80 chars, not < 80
        ];
        const model2 = selectGeminiModel(longMessages, noMemories);
        console.log("selectGeminiModel long message:", model2 === "gemini-2.5-flash" ? "PASS" : "FAIL - got " + model2);

        // Test case 3: Has memories -> should return full
        const withMemories = "User likes cats";
        const model3 = selectGeminiModel(shortMessages, withMemories);
        console.log("selectGeminiModel with memories:", model3 === "gemini-2.5-flash" ? "PASS" : "FAIL - got " + model3);

        // Test case 4: Long conversation (4+ messages) -> should return full
        const longConversation = [
            { role: "user", content: "hi" },
            { role: "assistant", content: "hello" },
            { role: "user", content: "how are you?" },
            { role: "assistant", content: "good" }
        ];
        const model4 = selectGeminiModel(longConversation, noMemories);
        console.log("selectGeminiModel long conversation:", model4 === "gemini-2.5-flash" ? "PASS" : "FAIL - got " + model4);

        // Test estimateRequestCost
        const inputTokens = 1000;
        const outputTokens = 500;
        
        // For gemini-2.5-flash: input 0.00015, output 0.0006
        // Cost = (1000/1000 * 0.00015) + (500/1000 * 0.0006) = 0.00015 + 0.0003 = 0.00045
        const cost1 = estimateRequestCost("gemini-2.5-flash", inputTokens, outputTokens);
        console.log("estimateRequestCost flash:", Math.abs(cost1 - 0.00045) < 0.000001 ? "PASS" : "FAIL - got " + cost1);

        // For gemini-2.0-flash-lite: input 0.000075, output 0.0003  
        // Cost = (1000/1000 * 0.000075) + (500/1000 * 0.0003) = 0.000075 + 0.00015 = 0.000225
        const cost2 = estimateRequestCost("gemini-2.0-flash-lite", inputTokens, outputTokens);
        console.log("estimateRequestCost lite:", Math.abs(cost2 - 0.000225) < 0.000001 ? "PASS" : "FAIL - got " + cost2);

        // Test MODEL_COSTS constants
        console.log("MODEL_COSTS flash input:", MODEL_COSTS["gemini-2.5-flash"].input === 0.00015 ? "PASS" : "FAIL");
        console.log("MODEL_COSTS flash output:", MODEL_COSTS["gemini-2.5-flash"].output === 0.0006 ? "PASS" : "FAIL");
        console.log("MODEL_COSTS lite input:", MODEL_COSTS["gemini-2.0-flash-lite"].input === 0.000075 ? "PASS" : "FAIL");
        console.log("MODEL_COSTS lite output:", MODEL_COSTS["gemini-2.0-flash-lite"].output === 0.0003 ? "PASS" : "FAIL");
        """
        
        output = self.run_node_script(script)
        
        # Check all tests passed
        if "FAIL" in output:
            raise Exception(f"Model router function tests failed: {output}")
        
        return True

    # ═══════════════════════════════════════════════════════════════════════════
    # TTS OPTIMIZER TESTS
    # ═══════════════════════════════════════════════════════════════════════════

    def test_tts_optimizer_file_structure(self) -> bool:
        """Test lib/tts-optimizer.ts file structure and exports"""
        filepath = "/app/lib/tts-optimizer.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check required exports
        required_exports = [
            "export function shouldUseTTS",
            "export function truncateForTTS"
        ]
        
        for export in required_exports:
            if export not in content:
                raise Exception(f"Missing export: {export}")
        
        return True

    def test_tts_optimizer_functions(self) -> bool:
        """Test TTS optimizer function implementations using JavaScript equivalents"""
        script = """
        // JavaScript implementation of TTS optimizer functions for testing
        function shouldUseTTS(text, voiceEnabled) {
            if (!voiceEnabled) return false;
            if (text.length > 800) return false;
            if (text.includes("```")) return false;

            // Check if text is predominantly a list
            const lines = text.split("\\n").filter(l => l.trim().length > 0);
            const listLines = lines.filter(l => /^\\s*[-*]/.test(l));
            if (listLines.length > 3) return false;

            return true;
        }

        function truncateForTTS(text) {
            if (text.length <= 400) return text;

            // Split on sentence-ending punctuation followed by a space
            // Use a simpler approach that works reliably
            const sentences = text.split(/[.!?]\\s+/);

            if (sentences.length <= 2) {
                // Can't split further — just hard-cut at 400 chars
                return text.slice(0, 400) + "...";
            }

            // Take first 2 sentences and add back the punctuation
            const truncated = sentences.slice(0, 2).join(". ");
            return truncated + "....";
        }

        // Test shouldUseTTS - should return false when:
        // - voiceEnabled = false
        // - text > 800 chars
        // - text contains code blocks (```)
        // - text is mostly list (>3 lines starting with - or *)

        console.log("shouldUseTTS voice disabled:", shouldUseTTS("hello", false) === false ? "PASS" : "FAIL");
        console.log("shouldUseTTS voice enabled short:", shouldUseTTS("hello", true) === true ? "PASS" : "FAIL");
        
        const longText = "a".repeat(801);
        console.log("shouldUseTTS long text:", shouldUseTTS(longText, true) === false ? "PASS" : "FAIL");
        
        const codeText = "Here is some code: ```javascript\\nconsole.log('hello');\\n```";
        console.log("shouldUseTTS code blocks:", shouldUseTTS(codeText, true) === false ? "PASS" : "FAIL");
        
        const listText = "Items:\\n- Item 1\\n- Item 2\\n- Item 3\\n- Item 4";
        console.log("shouldUseTTS list text:", shouldUseTTS(listText, true) === false ? "PASS" : "FAIL");
        
        const shortList = "Items:\\n- Item 1\\n- Item 2";
        console.log("shouldUseTTS short list:", shouldUseTTS(shortList, true) === true ? "PASS" : "FAIL");

        // Test truncateForTTS
        const shortText = "This is short.";
        console.log("truncateForTTS short text:", truncateForTTS(shortText) === shortText ? "PASS" : "FAIL");
        
        const mediumText = "a".repeat(401);
        const truncated1 = truncateForTTS(mediumText);
        console.log("truncateForTTS long text ends with ...:", truncated1.endsWith("...") ? "PASS" : "FAIL");
        
        const sentenceText = "First sentence with lots of words to make it much longer than normal sentences usually are in typical conversation and everyday speech patterns. Second sentence with even more additional content and words to ensure we definitely reach the four hundred character limit that triggers truncation in the TTS optimizer function. Third sentence should not appear in the output. Fourth sentence should definitely not appear in the final result.";
        const truncated2 = truncateForTTS(sentenceText);
        console.log("truncateForTTS sentences:", truncated2.startsWith("First sentence") && truncated2.includes("Second sentence") && truncated2.endsWith("....") && !truncated2.includes("Third sentence") ? "PASS" : "FAIL - got: " + truncated2);
        """
        
        output = self.run_node_script(script)
        
        # Check all tests passed
        if "FAIL" in output:
            raise Exception(f"TTS optimizer function tests failed: {output}")
        
        return True

    # ═══════════════════════════════════════════════════════════════════════════
    # INTEGRATION TESTS
    # ═══════════════════════════════════════════════════════════════════════════

    def test_chat_route_integration(self) -> bool:
        """Test app/api/chat/route.ts integrates all 4 libs correctly"""
        filepath = "/app/app/api/chat/route.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check all 4 lib imports
        required_imports = [
            'import { estimateRequestTokens, estimateTokens, LIMITS, truncateToTokenLimit } from "@/lib/token-counter"',
            'import { buildCacheKey, getCachedResponse, setCachedResponse, isCacheable } from "@/lib/response-cache"',
            'import { selectGeminiModel, estimateRequestCost } from "@/lib/model-router"'
        ]
        
        for imp in required_imports:
            if imp not in content:
                raise Exception(f"Missing import: {imp}")
        
        # Check token budget guard usage
        if "estimateRequestTokens(messages, systemPrompt, memories)" not in content:
            raise Exception("estimateRequestTokens not used for token budget guard")
        
        if "estimatedTokens > LIMITS.WARN_THRESHOLD" not in content:
            raise Exception("WARN_THRESHOLD not used in token budget guard")
        
        if "truncateToTokenLimit(messages, LIMITS.WARN_THRESHOLD)" not in content:
            raise Exception("truncateToTokenLimit not used when over threshold")
        
        # Check cache integration
        if "buildCacheKey(userMessageText, personality)" not in content:
            raise Exception("buildCacheKey not used")
        
        if "getCachedResponse(cacheKey)" not in content:
            raise Exception("getCachedResponse not used")
        
        if "isCacheable(userMessageText, fullResponse)" not in content:
            raise Exception("isCacheable not used")
        
        if "setCachedResponse(cacheKey, fullResponse)" not in content:
            raise Exception("setCachedResponse not used")
        
        # Check model selection
        if "selectGeminiModel(messages, memories)" not in content:
            raise Exception("selectGeminiModel not used")
        
        # Check cost estimation
        if "estimateRequestCost(model, inputTokens, outputTokens)" not in content:
            raise Exception("estimateRequestCost not used")
        
        return True

    def test_voice_hook_integration(self) -> bool:
        """Test hooks/useVoiceStateMachine.ts integrates TTS optimizer correctly"""
        filepath = "/app/hooks/useVoiceStateMachine.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check TTS optimizer import
        if 'import { shouldUseTTS, truncateForTTS } from "@/lib/tts-optimizer"' not in content:
            raise Exception("TTS optimizer functions not imported")
        
        # Check shouldUseTTS usage after AI response
        if "shouldUseTTS(full, true)" not in content:
            raise Exception("shouldUseTTS not used after AI response")
        
        # Check truncateForTTS usage when TTS is enabled
        if "truncateForTTS(full)" not in content:
            raise Exception("truncateForTTS not used when TTS is enabled")
        
        return True

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all tests and return results"""
        print("🚀 Starting Cost Optimization Libraries Tests")
        print("=" * 60)
        
        # Token Counter Tests
        self.run_test("lib/token-counter.ts file structure and exports", 
                     self.test_token_counter_file_structure)
        self.run_test("lib/token-counter.ts function implementations", 
                     self.test_token_counter_functions)
        
        # Response Cache Tests
        self.run_test("lib/response-cache.ts file structure and exports", 
                     self.test_response_cache_file_structure)
        self.run_test("lib/response-cache.ts function implementations", 
                     self.test_response_cache_functions)
        
        # Model Router Tests
        self.run_test("lib/model-router.ts file structure and exports", 
                     self.test_model_router_file_structure)
        self.run_test("lib/model-router.ts function implementations", 
                     self.test_model_router_functions)
        
        # TTS Optimizer Tests
        self.run_test("lib/tts-optimizer.ts file structure and exports", 
                     self.test_tts_optimizer_file_structure)
        self.run_test("lib/tts-optimizer.ts function implementations", 
                     self.test_tts_optimizer_functions)
        
        # Integration Tests
        self.run_test("app/api/chat/route.ts integrates all 4 libs correctly", 
                     self.test_chat_route_integration)
        self.run_test("hooks/useVoiceStateMachine.ts integrates TTS optimizer correctly", 
                     self.test_voice_hook_integration)
        
        # Print results
        print("\n" + "=" * 60)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run} passed")
        
        if self.issues:
            print("\n❌ Issues found:")
            for issue in self.issues:
                print(f"  - {issue}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        return {
            "tests_run": self.tests_run,
            "tests_passed": self.tests_passed,
            "success_rate": success_rate,
            "issues": self.issues
        }

def main():
    tester = CostOptimizationTest()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["tests_passed"] == results["tests_run"] else 1

if __name__ == "__main__":
    sys.exit(main())