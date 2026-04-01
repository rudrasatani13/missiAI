#!/usr/bin/env python3
"""
Backend testing for emotion detection and chat functionality fixes.
Tests the specific fixes mentioned in the review request.
"""

import json
import sys
import os
from typing import Dict, List, Any, Optional
from datetime import datetime

class EmotionChatTest:
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

    def read_file_content(self, filepath: str) -> str:
        """Read file content"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            raise Exception(f"Could not read {filepath}: {str(e)}")

    def test_emotion_max_output_tokens(self) -> bool:
        """Test emotion maxOutputTokens values are correct"""
        filepath = "/app/lib/client/emotion-detector.ts"
        content = self.read_file_content(filepath)
        
        # Expected values from review request
        expected_tokens = {
            'stressed': 800,
            'frustrated': 800,
            'fatigued': 800,
            'excited': 1000,
            'hesitant': 1000,
            'happy': 1000,
            'neutral': 1000,
            'confident': 1200
        }
        
        for emotion, expected_tokens_value in expected_tokens.items():
            # Look for the emotion state and its maxOutputTokens value
            emotion_section_start = content.find(f'{emotion}: {{')
            if emotion_section_start == -1:
                raise Exception(f"Could not find {emotion} emotion configuration")
            
            # Find the maxOutputTokens line within this emotion section
            emotion_section = content[emotion_section_start:emotion_section_start + 500]  # reasonable section size
            token_line = None
            for line in emotion_section.split('\n'):
                if 'maxOutputTokens:' in line:
                    token_line = line.strip()
                    break
            
            if not token_line:
                raise Exception(f"Could not find maxOutputTokens for {emotion}")
            
            # Extract the token value
            if f'maxOutputTokens: {expected_tokens_value}' not in token_line:
                raise Exception(f"{emotion} maxOutputTokens should be {expected_tokens_value}, found: {token_line}")
        
        return True

    def test_chat_route_default_tokens(self) -> bool:
        """Test chat route default maxOutputTokens is 1000"""
        filepath = "/app/app/api/v1/chat/route.ts"
        content = self.read_file_content(filepath)
        
        # Look for the default maxOutputTokens assignment
        if 'const maxOutputTokens = parsed.data.maxOutputTokens ?? 1000' not in content:
            raise Exception("Chat route default maxOutputTokens should be 1000")
        
        return True

    def test_error_recovery_message_removal(self) -> bool:
        """Test error recovery removes last user message on failure"""
        filepath = "/app/hooks/useVoiceStateMachine.ts"
        content = self.read_file_content(filepath)
        
        # Look for the error recovery logic that removes last user message
        if 'conversationRef.current.pop()' not in content:
            raise Exception("Error recovery should remove last user message with conversationRef.current.pop()")
        
        # Check it's in the context of error handling
        lines = content.split('\n')
        found_error_context = False
        for i, line in enumerate(lines):
            if 'conversationRef.current.pop()' in line:
                # Check surrounding lines for error context
                context_lines = lines[max(0, i-10):i+5]
                context = '\n'.join(context_lines)
                if 'lastMsg?.role === "user"' in context or 'All retries exhausted' in context:
                    found_error_context = True
                    break
        
        if not found_error_context:
            raise Exception("conversationRef.current.pop() should be in error recovery context")
        
        return True

    def test_continuous_mode_stops_on_failure(self) -> bool:
        """Test continuous mode stops on persistent failure"""
        filepath = "/app/hooks/useVoiceStateMachine.ts"
        content = self.read_file_content(filepath)
        
        # Look for the logic that stops continuous mode on failure
        if 'continuousRef.current = false' not in content:
            raise Exception("Should stop continuous mode with continuousRef.current = false")
        
        # Check it's in the context of persistent failure
        lines = content.split('\n')
        found_failure_context = False
        for i, line in enumerate(lines):
            if 'continuousRef.current = false' in line:
                # Check surrounding lines for failure context
                context_lines = lines[max(0, i-5):i+5]
                context = '\n'.join(context_lines)
                if 'persistent failure' in context or 'Stop continuous mode' in context:
                    found_failure_context = True
                    break
        
        if not found_failure_context:
            raise Exception("continuousRef.current = false should be in persistent failure context")
        
        return True

    def test_conversation_cap_14_messages(self) -> bool:
        """Test conversation is capped at 14 messages"""
        filepath = "/app/hooks/useVoiceStateMachine.ts"
        content = self.read_file_content(filepath)
        
        # Look for conversation length check and slice to 14
        if 'conversationRef.current.length > 14' not in content:
            raise Exception("Should check if conversation length > 14")
        
        if 'conversationRef.current.slice(-14)' not in content:
            raise Exception("Should slice conversation to last 14 messages")
        
        return True

    def test_gemini_model_unchanged(self) -> bool:
        """Test gemini-3-flash-preview model is still used"""
        filepath = "/app/services/ai.service.ts"
        content = self.read_file_content(filepath)
        
        # Look for the gemini model configuration
        if 'gemini: "gemini-3-flash-preview"' not in content:
            raise Exception("Should still use gemini-3-flash-preview model")
        
        return True

    def test_unit_tests_pass(self) -> bool:
        """Test that all unit tests pass"""
        try:
            import subprocess
            result = subprocess.run(['pnpm', 'vitest', 'run'], 
                                  cwd='/app', 
                                  capture_output=True, 
                                  text=True, 
                                  timeout=120)
            
            if result.returncode != 0:
                raise Exception(f"Unit tests failed: {result.stderr}")
            
            # Check for 223 tests passed
            if '223 passed' not in result.stdout:
                raise Exception(f"Expected 223 tests to pass, got: {result.stdout}")
            
            return True
        except subprocess.TimeoutExpired:
            raise Exception("Unit tests timed out")
        except Exception as e:
            raise Exception(f"Error running unit tests: {str(e)}")

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all tests and return results"""
        print("🚀 Starting Emotion & Chat Functionality Tests")
        print("=" * 60)
        
        # Test 1: Unit tests pass
        self.run_test("All 223 unit tests pass", self.test_unit_tests_pass)
        
        # Test 2: Emotion maxOutputTokens values
        self.run_test("Emotion maxOutputTokens values are correct", self.test_emotion_max_output_tokens)
        
        # Test 3: Chat route default tokens
        self.run_test("Chat route default maxOutputTokens is 1000", self.test_chat_route_default_tokens)
        
        # Test 4: Error recovery message removal
        self.run_test("Error recovery removes last user message on failure", self.test_error_recovery_message_removal)
        
        # Test 5: Continuous mode stops on failure
        self.run_test("Continuous mode stops on persistent failure", self.test_continuous_mode_stops_on_failure)
        
        # Test 6: Conversation cap at 14 messages
        self.run_test("Conversation is capped at 14 messages", self.test_conversation_cap_14_messages)
        
        # Test 7: Gemini model unchanged
        self.run_test("Gemini model remains gemini-3-flash-preview", self.test_gemini_model_unchanged)
        
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
    tester = EmotionChatTest()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["tests_passed"] == results["tests_run"] else 1

if __name__ == "__main__":
    sys.exit(main())