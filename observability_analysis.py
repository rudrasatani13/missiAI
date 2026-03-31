#!/usr/bin/env python3
"""
Observability Layer Code Analysis for Next.js Cloudflare Pages Project
Analyzes the structured logging, cost tracking, environment handling, and health checks.
"""

import os
import re
import json
import subprocess
import sys
from datetime import datetime

class ObservabilityAnalyzer:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def run_test(self, name, test_func):
        """Run a single test and track results"""
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            success = test_func()
            if success:
                self.tests_passed += 1
                print(f"✅ Passed")
                self.test_results.append({"name": name, "status": "PASSED"})
            else:
                print(f"❌ Failed")
                self.test_results.append({"name": name, "status": "FAILED"})
            return success
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.test_results.append({"name": name, "status": "ERROR", "error": str(e)})
            return False

    def read_file(self, path):
        """Read file content"""
        with open(f'/app/{path}', 'r') as f:
            return f.read()

    def test_logger_interface_exports(self):
        """Test LogEvent interface exports and log function structure"""
        content = self.read_file('lib/logger.ts')
        
        # Check LogEvent interface
        has_interface = 'export interface LogEvent' in content
        has_level = 'level: "info" | "warn" | "error"' in content
        has_event = 'event: string' in content
        has_timestamp = 'timestamp: number' in content
        
        # Check log function
        has_log_function = 'export function log(event: LogEvent): void' in content
        has_json_stringify = 'JSON.stringify(event' in content
        
        return has_interface and has_level and has_event and has_timestamp and has_log_function and has_json_stringify

    def test_logger_duration_calculation(self):
        """Test logRequest calculates durationMs correctly"""
        content = self.read_file('lib/logger.ts')
        
        # Check logRequest function signature
        has_function = 'export function logRequest(' in content
        has_start_time_param = 'startTime: number' in content
        
        # Check duration calculation
        has_duration_calc = 'const durationMs = Date.now() - startTime' in content
        has_duration_in_log = 'durationMs,' in content
        
        return has_function and has_start_time_param and has_duration_calc and has_duration_in_log

    def test_logger_error_handling(self):
        """Test logError handles Error objects and non-Error objects"""
        content = self.read_file('lib/logger.ts')
        
        # Check logError function
        has_function = 'export function logError(' in content
        has_error_param = 'error: unknown' in content
        
        # Check error handling logic
        has_instanceof_check = 'error instanceof Error' in content
        has_string_check = 'typeof error === "string"' in content
        has_fallback = 'String(error)' in content
        
        return has_function and has_error_param and has_instanceof_check and has_string_check and has_fallback

    def test_create_timer(self):
        """Test createTimer returns function that calculates elapsed time"""
        content = self.read_file('lib/logger.ts')
        
        # Check createTimer function
        has_function = 'export function createTimer(): () => number' in content
        has_start_capture = 'const start = Date.now()' in content
        has_return_function = 'return () => Date.now() - start' in content
        
        return has_function and has_start_capture and has_return_function

    def test_cost_tracker_interface(self):
        """Test RequestCost interface and COST_CONSTANTS"""
        content = self.read_file('lib/cost-tracker.ts')
        
        # Check RequestCost interface
        has_interface = 'export interface RequestCost' in content
        required_fields = ['userId: string', 'model: string', 'inputTokens: number', 
                          'outputTokens: number', 'costUsd: number', 'ttsChars: number',
                          'ttsCostUsd: number', 'totalCostUsd: number', 'timestamp: number']
        has_all_fields = all(field in content for field in required_fields)
        
        # Check COST_CONSTANTS
        has_constants = 'export const COST_CONSTANTS' in content
        has_tts_cost = 'TTS_COST_PER_CHAR: 0.0000003' in content
        
        return has_interface and has_all_fields and has_constants and has_tts_cost

    def test_cost_calculation(self):
        """Test calculateTotalCost function structure"""
        content = self.read_file('lib/cost-tracker.ts')
        
        # Check function signature
        has_function = 'export function calculateTotalCost(' in content
        has_params = all(param in content for param in ['model: string', 'inputTokens: number', 
                                                       'outputTokens: number', 'ttsChars: number'])
        
        # Check calculation logic
        has_model_costs_import = 'MODEL_COSTS' in content
        has_input_calc = 'inputTokens / 1000' in content
        has_output_calc = 'outputTokens / 1000' in content
        has_tts_calc = 'ttsChars * COST_CONSTANTS.TTS_COST_PER_CHAR' in content
        has_total_calc = 'totalCostUsd = costUsd + ttsCostUsd' in content
        
        return (has_function and has_params and has_model_costs_import and 
                has_input_calc and has_output_calc and has_tts_calc and has_total_calc)

    def test_daily_budget_default(self):
        """Test DAILY_BUDGET_USD defaults to 5.0"""
        content = self.read_file('lib/cost-tracker.ts')
        
        has_budget_export = 'export const DAILY_BUDGET_USD' in content
        has_default_value = 'return 5.0' in content
        has_parse_function = 'function parseBudget()' in content
        
        return has_budget_export and has_default_value and has_parse_function

    def test_budget_alert_logic(self):
        """Test checkBudgetAlert function structure"""
        content = self.read_file('lib/cost-tracker.ts')
        
        # Check function signature
        has_function = 'export async function checkBudgetAlert(' in content
        # Check for the actual parameter pattern (spans multiple lines)
        has_kv_param = 'kv: KVStore | null' in content
        has_cost_param = 'dailyCostSoFar: number' in content
        has_return_type = 'Promise<boolean>' in content
        
        # Check logic
        has_budget_check = 'dailyCostSoFar <= DAILY_BUDGET_USD' in content
        has_warn_log = 'level: "warn"' in content and 'budget.threshold_crossed' in content
        has_return_true = 'return true' in content
        has_return_false = 'return false' in content
        
        return (has_function and has_kv_param and has_cost_param and has_return_type and 
                has_budget_check and has_warn_log and has_return_true and has_return_false)

    def test_env_error_handling(self):
        """Test getEnv throws clear error with key name"""
        content = self.read_file('lib/env.ts')
        
        # Check getEnv function
        has_function = 'export function getEnv(): AppEnv' in content
        has_require_env = 'function requireEnv(key: string): string' in content
        
        # Check error handling
        has_error_throw = 'throw new Error(' in content
        has_key_in_error = 'Missing required environment variable: ${key}' in content
        
        return has_function and has_require_env and has_error_throw and has_key_in_error

    def test_env_exists_function(self):
        """Test envExists returns boolean correctly"""
        content = self.read_file('lib/env.ts')
        
        # Check function signature
        has_function = 'export function envExists(key: string): boolean' in content
        
        # Check logic
        has_env_access = 'process.env[key]' in content
        has_string_check = 'typeof value === "string"' in content
        has_trim_check = 'value.trim() !== ""' in content
        
        return has_function and has_env_access and has_string_check and has_trim_check

    def test_health_endpoint_structure(self):
        """Test health endpoint response structure"""
        content = self.read_file('app/api/health/route.ts')
        
        # Check HealthResponse interface
        has_interface = 'interface HealthResponse' in content
        required_fields = ['status: "ok" | "degraded" | "down"', 'version: string', 
                          'checks:', 'timestamp: number']
        has_all_fields = all(field in content for field in required_fields)
        
        # Check status codes
        status_codes = ['200', '207', '503']
        has_status_codes = all(code in content for code in status_codes)
        
        # Check no env exposure (except version)
        env_references = content.count('process.env')
        has_safe_env_usage = env_references <= 1  # Only npm_package_version should be used
        
        return has_interface and has_all_fields and has_status_codes and has_safe_env_usage

    def test_middleware_logging_integration(self):
        """Test middleware has proper logging integration"""
        content = self.read_file('middleware.ts')
        
        # Check logger import
        has_logger_import = 'from "@/lib/logger"' in content
        
        # Check logging events
        required_events = ['api.request', 'api.rate_limited', 'api.unauthorized']
        has_all_events = all(event in content for event in required_events)
        
        # Check health route exclusion
        has_health_route = 'isHealthRoute' in content
        has_health_exclusion = 'if (isHealthRoute(request)) return' in content
        
        # Check rate limiting still works
        has_rate_limiting = 'checkIPRateLimit' in content
        
        return has_logger_import and has_all_events and has_health_route and has_health_exclusion and has_rate_limiting

    def test_api_routes_integration(self):
        """Test API routes integrate logging properly"""
        routes = ['app/api/chat/route.ts', 'app/api/tts/route.ts', 'app/api/memory/route.ts']
        
        for route in routes:
            content = self.read_file(route)
            
            # Check imports
            has_timer_import = 'createTimer' in content
            has_log_imports = 'logRequest' in content and 'logError' in content
            
            # Check usage
            has_timer_usage = 'createTimer()' in content
            has_log_request_usage = 'logRequest(' in content
            has_log_error_usage = 'logError(' in content
            
            if not (has_timer_import and has_log_imports and has_timer_usage and 
                   has_log_request_usage and has_log_error_usage):
                print(f"❌ Missing logging integration in {route}")
                return False
        
        return True

    def test_chat_route_specific_integration(self):
        """Test chat route specific observability features"""
        content = self.read_file('app/api/chat/route.ts')
        
        # Check cost tracking integration
        has_cost_imports = 'calculateTotalCost' in content and 'checkBudgetAlert' in content
        has_cost_calculation = 'calculateTotalCost(model, inputTokens, outputTokens, 0)' in content
        has_budget_check = 'checkBudgetAlert(kv, costData.totalCostUsd)' in content
        
        return has_cost_imports and has_cost_calculation and has_budget_check

    def test_tts_route_specific_integration(self):
        """Test TTS route specific logging"""
        content = self.read_file('app/api/tts/route.ts')
        
        # Check TTS specific logging
        has_char_count = 'charCount' in content
        has_tts_log = 'logRequest("tts.request"' in content
        has_char_count_in_log = 'charCount' in content and 'logRequest' in content
        
        return has_char_count and has_tts_log and has_char_count_in_log

    def test_memory_route_specific_integration(self):
        """Test memory route specific logging"""
        content = self.read_file('app/api/memory/route.ts')
        
        # Check memory specific logging
        has_memory_read_log = 'memory.read' in content
        has_memory_write_log = 'memory.write' in content
        has_fact_count = 'factCount' in content
        
        return has_memory_read_log and has_memory_write_log and has_fact_count

    def test_typescript_compilation(self):
        """Test TypeScript compilation (should only have pre-existing waitlist error)"""
        try:
            result = subprocess.run(
                ['./node_modules/.bin/tsc', '--noEmit'],
                cwd='/app',
                capture_output=True,
                text=True,
                timeout=30
            )
            
            # Check if compilation has errors
            if result.returncode != 0:
                # The error output is in stdout, not stderr for tsc
                error_output = result.stdout
                has_waitlist_error = 'waitlist/page.tsx' in error_output
                
                # Count actual error instances (look for the error code pattern)
                error_count = error_output.count('error TS')
                
                # Should have only the pre-existing waitlist error
                return has_waitlist_error and error_count == 1
            else:
                # No errors at all is also acceptable
                return True
                
        except Exception as e:
            print(f"TypeScript compilation test failed: {e}")
            return False

    def run_all_tests(self):
        """Run all observability tests"""
        print("🚀 Starting Observability Layer Code Analysis...")
        print("=" * 60)
        
        # TypeScript compilation test first
        self.run_test("TypeScript Compilation", self.test_typescript_compilation)
        
        # Logger tests
        self.run_test("Logger Interface Exports", self.test_logger_interface_exports)
        self.run_test("Logger Duration Calculation", self.test_logger_duration_calculation)
        self.run_test("Logger Error Handling", self.test_logger_error_handling)
        self.run_test("Create Timer Function", self.test_create_timer)
        
        # Cost tracker tests
        self.run_test("Cost Tracker Interface", self.test_cost_tracker_interface)
        self.run_test("Cost Calculation Logic", self.test_cost_calculation)
        self.run_test("Daily Budget Default", self.test_daily_budget_default)
        self.run_test("Budget Alert Logic", self.test_budget_alert_logic)
        
        # Environment tests
        self.run_test("Environment Error Handling", self.test_env_error_handling)
        self.run_test("Environment Exists Function", self.test_env_exists_function)
        
        # Health endpoint test
        self.run_test("Health Endpoint Structure", self.test_health_endpoint_structure)
        
        # Middleware test
        self.run_test("Middleware Logging Integration", self.test_middleware_logging_integration)
        
        # API routes integration tests
        self.run_test("API Routes Logging Integration", self.test_api_routes_integration)
        self.run_test("Chat Route Cost Tracking", self.test_chat_route_specific_integration)
        self.run_test("TTS Route Logging", self.test_tts_route_specific_integration)
        self.run_test("Memory Route Logging", self.test_memory_route_specific_integration)
        
        # Print results
        print("\n" + "=" * 60)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All observability tests passed!")
            return 0
        else:
            print("❌ Some tests failed. Check the output above for details.")
            return 1

def main():
    analyzer = ObservabilityAnalyzer()
    return analyzer.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())