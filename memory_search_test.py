#!/usr/bin/env python3
"""
Memory Search Bug Fix Testing
Tests the specific bug fixes for memory search functionality:
1. kvFallbackSearch returns empty array when no keyword matches
2. emotionalWeight and confidence boosts only apply when keywordScore > 0
3. minimum score threshold of >= 2 for returned results
4. short words (length <= 2) are filtered from query words
"""

import sys
import os
import re
from typing import Dict, List, Any

class MemorySearchBugFixTest:
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

    def test_kvfallback_returns_empty_when_no_matches(self) -> bool:
        """Test that kvFallbackSearch returns empty array when no keyword matches"""
        filepath = "/app/lib/memory/life-graph.ts"
        content = self.read_file_content(filepath)
        
        # Check that the function returns empty array when no matches
        if "// If nothing is relevant, return empty — don't force unrelated memories" not in content:
            raise Exception("Missing comment about returning empty when nothing is relevant")
        
        if "if (topResults.length === 0) {\n    return []\n  }" not in content:
            raise Exception("kvFallbackSearch doesn't return empty array when no matches")
        
        return True

    def test_emotional_weight_confidence_only_with_keyword_matches(self) -> bool:
        """Test that emotionalWeight and confidence boosts only apply when keywordScore > 0"""
        filepath = "/app/lib/memory/life-graph.ts"
        content = self.read_file_content(filepath)
        
        # Check that boosts are only applied when keywordScore > 0
        boost_pattern = r"// Only add contextual boosts when there's at least one keyword match\s+let score = keywordScore\s+if \(keywordScore > 0\) \{\s+if \(node\.accessCount > 3\) score \+= 1\s+score \+= node\.emotionalWeight \* 2\s+score \+= node\.confidence\s+\}"
        
        if not re.search(boost_pattern, content, re.MULTILINE | re.DOTALL):
            raise Exception("emotionalWeight and confidence boosts are not properly gated by keywordScore > 0")
        
        return True

    def test_minimum_score_threshold(self) -> bool:
        """Test that minimum score threshold of >= 2 is enforced"""
        filepath = "/app/lib/memory/life-graph.ts"
        content = self.read_file_content(filepath)
        
        # Check for score >= 2 filter
        if ".filter((s) => s.hasKeywordMatch && s.score >= 2)" not in content:
            raise Exception("Minimum score threshold of >= 2 not enforced")
        
        return True

    def test_short_words_filtered(self) -> bool:
        """Test that short words (length <= 2) are filtered from query words"""
        filepath = "/app/lib/memory/life-graph.ts"
        content = self.read_file_content(filepath)
        
        # Check for word length filter
        if ".filter((w) => w.length > 2)" not in content:
            raise Exception("Short words (length <= 2) are not filtered from query words")
        
        # Check for comment explaining this
        if "// Ignore very short words (a, is, to, etc.)" not in content:
            raise Exception("Missing comment explaining short word filtering")
        
        return True

    def test_actioncard_fixed_positioning(self) -> bool:
        """Test that ActionCard is positioned as fixed overlay at z-50"""
        filepath = "/app/app/chat/page.tsx"
        content = self.read_file_content(filepath)
        
        # Check for fixed positioning with z-50
        if 'className="fixed bottom-32 md:bottom-36 left-0 right-0 z-50 flex justify-center pointer-events-none"' not in content:
            raise Exception("ActionCard is not positioned as fixed overlay at z-50")
        
        # Check for comment indicating it's above everything
        if "{/* ── Action Card Overlay — above everything ─── */}" not in content:
            raise Exception("Missing comment indicating ActionCard is above everything")
        
        # Check that it's outside the voice button wrapper
        voice_button_section = content[content.find('<div className="fixed bottom-0 left-0 right-0 z-20'):]
        actioncard_section = content[content.find('Action Card Overlay'):content.find('Action Card Overlay') + 500]
        
        if 'Action Card Overlay' in voice_button_section:
            raise Exception("ActionCard appears to be inside the voice button wrapper")
        
        return True

    def test_actioncard_no_absolute_positioning(self) -> bool:
        """Test that ActionCard component no longer uses position:absolute with bottom:100%"""
        filepath = "/app/components/chat/ActionCard.tsx"
        content = self.read_file_content(filepath)
        
        # Check that position:absolute and bottom:100% are not used together
        if "position: \"absolute\"" in content and "bottom: \"100%\"" in content:
            raise Exception("ActionCard still uses position:absolute with bottom:100%")
        
        # The component should use transform for positioning instead
        if "transform: visible" not in content:
            raise Exception("ActionCard doesn't use transform for positioning")
        
        return True

    def test_action_engine_error_handling(self) -> bool:
        """Test that useActionEngine has console.warn for errors and handles empty messages"""
        filepath = "/app/hooks/useActionEngine.ts"
        content = self.read_file_content(filepath)
        
        # Check for console.warn error handling
        if 'console.warn("[ActionEngine] API returned", res.status)' not in content:
            raise Exception("Missing console.warn for API status errors")
        
        if 'console.warn("[ActionEngine] API error:", data.error)' not in content:
            raise Exception("Missing console.warn for API errors")
        
        if 'console.warn("[ActionEngine] fetch error:", err)' not in content:
            raise Exception("Missing console.warn for fetch errors")
        
        # Check for empty message handling
        if "if (!userMessage.trim()) return null" not in content:
            raise Exception("Missing empty message handling")
        
        return True

    def test_updated_test_expects_zero_results(self) -> bool:
        """Test that the updated test expects 0 results when no keyword matches"""
        filepath = "/app/tests/lib/memory/life-graph.test.ts"
        content = self.read_file_content(filepath)
        
        # Check for the specific test
        if 'it("should return empty when no keyword matches (not irrelevant memories)"' not in content:
            raise Exception("Missing test for empty results when no keyword matches")
        
        # Check that it expects 0 results
        if "expect(results.length).toBe(0)" not in content:
            raise Exception("Test doesn't expect 0 results for no keyword matches")
        
        # Check for comment explaining the behavior
        if "// Should NOT inject irrelevant memories — return empty instead" not in content:
            raise Exception("Missing comment explaining that irrelevant memories should not be injected")
        
        return True

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all memory search bug fix tests"""
        print("🚀 Starting Memory Search Bug Fix Tests")
        print("=" * 60)
        
        # Test 1: kvFallbackSearch returns empty when no matches
        self.run_test("kvFallbackSearch returns EMPTY array when no keyword matches", 
                     self.test_kvfallback_returns_empty_when_no_matches)
        
        # Test 2: Emotional weight and confidence boosts only with keyword matches
        self.run_test("emotionalWeight and confidence boosts only apply when keywordScore > 0", 
                     self.test_emotional_weight_confidence_only_with_keyword_matches)
        
        # Test 3: Minimum score threshold
        self.run_test("minimum score threshold of >= 2 for returned results", 
                     self.test_minimum_score_threshold)
        
        # Test 4: Short words filtered
        self.run_test("short words (length <= 2) are filtered from query words", 
                     self.test_short_words_filtered)
        
        # Test 5: ActionCard fixed positioning
        self.run_test("ActionCard positioned as fixed container at z-50", 
                     self.test_actioncard_fixed_positioning)
        
        # Test 6: ActionCard no absolute positioning
        self.run_test("ActionCard no longer uses position:absolute with bottom:100%", 
                     self.test_actioncard_no_absolute_positioning)
        
        # Test 7: Action engine error handling
        self.run_test("useActionEngine has console.warn for errors and handles empty messages", 
                     self.test_action_engine_error_handling)
        
        # Test 8: Updated test expects zero results
        self.run_test("test 'should return empty when no keyword matches' expects 0 results", 
                     self.test_updated_test_expects_zero_results)
        
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
    tester = MemorySearchBugFixTest()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["tests_passed"] == results["tests_run"] else 1

if __name__ == "__main__":
    sys.exit(main())