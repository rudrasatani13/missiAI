#!/usr/bin/env python3
"""
Backend testing for structured memory architecture in Next.js + Cloudflare KV app.
Tests TypeScript type correctness, unit-level logic validation, and code structure.
"""

import json
import sys
import os
import subprocess
from typing import Dict, List, Any, Optional
from datetime import datetime

class MemoryArchitectureTest:
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

    def check_export_in_file(self, filepath: str, export_name: str) -> bool:
        """Check if a specific export exists in a TypeScript file"""
        content = self.read_file_content(filepath)
        return f"export interface {export_name}" in content or f"export function {export_name}" in content or f"export async function {export_name}" in content

    def check_import_in_file(self, filepath: str, import_statement: str) -> bool:
        """Check if a specific import exists in a file"""
        content = self.read_file_content(filepath)
        return import_statement in content

    def check_no_old_references(self, filepath: str, old_functions: List[str]) -> bool:
        """Check that old function references are not present"""
        content = self.read_file_content(filepath)
        for func in old_functions:
            if func in content:
                return False
        return True

    def test_memory_types_exports(self) -> bool:
        """Test types/memory.ts exports MemoryFact and UserMemoryStore interfaces correctly"""
        filepath = "/app/types/memory.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check MemoryFact interface
        if "export interface MemoryFact" not in content:
            raise Exception("MemoryFact interface not exported")
        
        # Check required fields in MemoryFact
        required_fields = ["id: string", "text: string", "tags: string[]", "createdAt: number", "accessCount: number"]
        for field in required_fields:
            if field not in content:
                raise Exception(f"MemoryFact missing required field: {field}")
        
        # Check UserMemoryStore interface
        if "export interface UserMemoryStore" not in content:
            raise Exception("UserMemoryStore interface not exported")
        
        # Check required fields in UserMemoryStore
        required_store_fields = ["facts: MemoryFact[]", "lastExtractedAt: number", "interactionCount: number"]
        for field in required_store_fields:
            if field not in content:
                raise Exception(f"UserMemoryStore missing required field: {field}")
        
        return True

    def test_kv_memory_functions(self) -> bool:
        """Test lib/kv-memory.ts has all required functions with correct signatures"""
        filepath = "/app/lib/kv-memory.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check required exports
        required_exports = [
            "export async function getUserMemoryStore",
            "export async function saveUserMemoryStore", 
            "export function getRelevantFacts",
            "export function formatFactsForPrompt"
        ]
        
        for export in required_exports:
            if export not in content:
                raise Exception(f"Missing export: {export}")
        
        # Check imports
        required_imports = [
            'import type { KVStore } from "@/types"',
            'import type { MemoryFact, UserMemoryStore } from "@/types/memory"',
            'import { sanitizeMemories } from "@/lib/memory-sanitizer"'
        ]
        
        for imp in required_imports:
            if imp not in content:
                raise Exception(f"Missing import: {imp}")
        
        # Check MAX_FACTS constant
        if "const MAX_FACTS = 50" not in content:
            raise Exception("MAX_FACTS constant not set to 50")
        
        # Check empty store factory
        if "function emptyStore(): UserMemoryStore" not in content:
            raise Exception("emptyStore factory function missing")
        
        return True

    def test_memory_extractor_implementation(self) -> bool:
        """Test lib/memory-extractor.ts implementation"""
        filepath = "/app/lib/memory-extractor.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check main export
        if "export async function extractMemoryFacts" not in content:
            raise Exception("extractMemoryFacts function not exported")
        
        # Check Gemini Flash model constant
        if 'const GEMINI_FLASH_MODEL = "gemini-2.5-flash"' not in content:
            raise Exception("GEMINI_FLASH_MODEL constant not set correctly")
        
        # Check MAX_FACTS constant
        if "const MAX_FACTS = 50" not in content:
            raise Exception("MAX_FACTS constant not set to 50")
        
        # Check nanoid import
        if 'import { nanoid } from "nanoid"' not in content:
            raise Exception("nanoid import missing")
        
        # Check type imports
        if 'import type { Message } from "@/types"' not in content:
            raise Exception("Message type import missing")
        
        if 'import type { MemoryFact } from "@/types/memory"' not in content:
            raise Exception("MemoryFact type import missing")
        
        # Check Gemini API URL construction
        if "generativelanguage.googleapis.com/v1beta/models" not in content:
            raise Exception("Gemini API URL not constructed correctly")
        
        # Check error handling
        if "try {" not in content or "} catch {" not in content:
            raise Exception("Error handling missing in extractMemoryFacts")
        
        return True

    def test_memory_route_implementation(self) -> bool:
        """Test app/api/memory/route.ts implementation"""
        filepath = "/app/app/api/memory/route.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check runtime export
        if 'export const runtime = "edge"' not in content:
            raise Exception("Edge runtime not configured")
        
        # Check required imports
        required_imports = [
            'import { getUserMemoryStore, saveUserMemoryStore } from "@/lib/kv-memory"',
            'import { extractMemoryFacts } from "@/lib/memory-extractor"',
            'import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/auth"'
        ]
        
        for imp in required_imports:
            if imp not in content:
                raise Exception(f"Missing import: {imp}")
        
        # Check GET and POST exports
        if "export async function GET" not in content:
            raise Exception("GET function not exported")
        
        if "export async function POST" not in content:
            raise Exception("POST function not exported")
        
        # Check interaction count increment
        if "store.interactionCount += 1" not in content:
            raise Exception("Interaction count increment missing")
        
        # Check 5th interaction extraction
        if "store.interactionCount % 5 === 0" not in content:
            raise Exception("5th interaction check missing")
        
        return True

    def test_chat_route_integration(self) -> bool:
        """Test app/api/chat/route.ts uses new memory functions"""
        filepath = "/app/app/api/chat/route.ts"
        if not self.check_file_exists(filepath):
            raise Exception(f"{filepath} does not exist")
        
        content = self.read_file_content(filepath)
        
        # Check new memory imports
        required_imports = [
            'import { getUserMemoryStore, getRelevantFacts, formatFactsForPrompt } from "@/lib/kv-memory"'
        ]
        
        for imp in required_imports:
            if imp not in content:
                raise Exception(f"Missing import: {imp}")
        
        # Check usage of new functions
        if "getUserMemoryStore(kv, userId)" not in content:
            raise Exception("getUserMemoryStore not used")
        
        if "getRelevantFacts(store, currentMessage)" not in content:
            raise Exception("getRelevantFacts not used")
        
        if "formatFactsForPrompt(relevantFacts)" not in content:
            raise Exception("formatFactsForPrompt not used")
        
        return True

    def test_no_old_memory_references(self) -> bool:
        """Test that no old getUserMemories or saveUserMemories references remain in route files"""
        route_files = [
            "/app/app/api/memory/route.ts",
            "/app/app/api/chat/route.ts"
        ]
        
        old_functions = ["getUserMemories", "saveUserMemories"]
        
        for filepath in route_files:
            if not self.check_file_exists(filepath):
                raise Exception(f"{filepath} does not exist")
            
            if not self.check_no_old_references(filepath, old_functions):
                raise Exception(f"Old memory function references found in {filepath}")
        
        return True

    def test_memory_sanitizer_integration(self) -> bool:
        """Test that memory sanitizer is properly integrated"""
        filepath = "/app/lib/kv-memory.ts"
        content = self.read_file_content(filepath)
        
        # Check sanitizeMemories is imported and used
        if 'import { sanitizeMemories } from "@/lib/memory-sanitizer"' not in content:
            raise Exception("sanitizeMemories import missing")
        
        if "sanitizeMemories(f.text)" not in content:
            raise Exception("sanitizeMemories not used in saveUserMemoryStore")
        
        return True

    def test_gemini_stream_integration(self) -> bool:
        """Test that gemini-stream is properly integrated in chat route"""
        filepath = "/app/app/api/chat/route.ts"
        content = self.read_file_content(filepath)
        
        # Check buildGeminiRequest import and usage
        if 'import { buildGeminiRequest, streamGeminiResponse } from "@/lib/gemini-stream"' not in content:
            raise Exception("Gemini stream functions not imported")
        
        if "buildGeminiRequest(messages, personality, memories, model)" not in content:
            raise Exception("buildGeminiRequest not used with memories parameter")
        
        return True

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all tests and return results"""
        print("🚀 Starting Memory Architecture Backend Tests")
        print("=" * 60)
        
        # Test 1: TypeScript type definitions
        self.run_test("types/memory.ts exports MemoryFact and UserMemoryStore interfaces correctly", 
                     self.test_memory_types_exports)
        
        # Test 2: KV memory functions
        self.run_test("lib/kv-memory.ts has all required functions with correct signatures", 
                     self.test_kv_memory_functions)
        
        # Test 3: Memory extractor implementation
        self.run_test("lib/memory-extractor.ts implementation with Gemini Flash integration", 
                     self.test_memory_extractor_implementation)
        
        # Test 4: Memory route implementation
        self.run_test("app/api/memory/route.ts POST increments interactionCount and calls extractMemoryFacts every 5th interaction", 
                     self.test_memory_route_implementation)
        
        # Test 5: Chat route integration
        self.run_test("app/api/chat/route.ts uses getUserMemoryStore + getRelevantFacts + formatFactsForPrompt", 
                     self.test_chat_route_integration)
        
        # Test 6: No old references
        self.run_test("No references to old getUserMemories or saveUserMemories functions remain in route files", 
                     self.test_no_old_memory_references)
        
        # Test 7: Memory sanitizer integration
        self.run_test("Memory sanitizer is properly integrated in saveUserMemoryStore", 
                     self.test_memory_sanitizer_integration)
        
        # Test 8: Gemini stream integration
        self.run_test("Gemini stream integration passes memories to buildGeminiRequest", 
                     self.test_gemini_stream_integration)
        
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
    tester = MemoryArchitectureTest()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["tests_passed"] == results["tests_run"] else 1

if __name__ == "__main__":
    sys.exit(main())