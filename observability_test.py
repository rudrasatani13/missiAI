#!/usr/bin/env python3
"""
Observability Layer Testing for Next.js Cloudflare Pages Project
Tests the structured logging, cost tracking, environment handling, and health checks.
"""

import subprocess
import json
import os
import sys
from datetime import datetime

class ObservabilityTester:
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

    def run_node_script(self, script_content):
        """Execute a Node.js script and return the result"""
        try:
            # Write script to temp file
            with open('/tmp/test_script.js', 'w') as f:
                f.write(script_content)
            
            # Run with node
            result = subprocess.run(
                ['node', '/tmp/test_script.js'],
                cwd='/app',
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return True, result.stdout.strip()
            else:
                return False, result.stderr.strip()
        except Exception as e:
            return False, str(e)

    def test_logger_interface_exports(self):
        """Test that LogEvent interface is properly exported and log function works"""
        script = """
        const { log, logRequest, logError, createTimer } = require('./lib/logger.ts');
        
        // Test LogEvent structure by creating a log entry
        const testEvent = {
            level: "info",
            event: "test.event",
            userId: "test-user",
            durationMs: 100,
            metadata: { test: true },
            timestamp: Date.now()
        };
        
        // Capture console output
        let logOutput = '';
        const originalLog = console.log;
        console.log = (msg) => { logOutput = msg; };
        
        log(testEvent);
        
        console.log = originalLog;
        
        // Verify JSON output
        try {
            const parsed = JSON.parse(logOutput);
            const hasRequiredFields = parsed.level && parsed.event && parsed.timestamp;
            console.log(hasRequiredFields ? 'SUCCESS' : 'FAILED');
        } catch (e) {
            console.log('FAILED');
        }
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_logger_duration_calculation(self):
        """Test logRequest calculates durationMs correctly"""
        script = """
        const { logRequest } = require('./lib/logger.ts');
        
        let logOutput = '';
        const originalLog = console.log;
        console.log = (msg) => { logOutput = msg; };
        
        const startTime = Date.now() - 500; // 500ms ago
        logRequest("test.request", "user123", startTime, { test: true });
        
        console.log = originalLog;
        
        try {
            const parsed = JSON.parse(logOutput);
            const durationValid = parsed.durationMs >= 400 && parsed.durationMs <= 600;
            console.log(durationValid ? 'SUCCESS' : 'FAILED');
        } catch (e) {
            console.log('FAILED');
        }
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_logger_error_handling(self):
        """Test logError handles Error objects and non-Error objects"""
        script = """
        const { logError } = require('./lib/logger.ts');
        
        let logOutputs = [];
        const originalLog = console.log;
        console.log = (msg) => { logOutputs.push(msg); };
        
        // Test Error object
        logError("test.error1", new Error("Test error message"), "user123");
        
        // Test string error
        logError("test.error2", "String error", "user123");
        
        // Test non-Error object
        logError("test.error3", { code: 500, message: "Object error" }, "user123");
        
        console.log = originalLog;
        
        try {
            const parsed1 = JSON.parse(logOutputs[0]);
            const parsed2 = JSON.parse(logOutputs[1]);
            const parsed3 = JSON.parse(logOutputs[2]);
            
            const test1 = parsed1.level === 'error' && parsed1.metadata.error === 'Test error message';
            const test2 = parsed2.level === 'error' && parsed2.metadata.error === 'String error';
            const test3 = parsed3.level === 'error' && parsed3.metadata.error.includes('Object error');
            
            console.log((test1 && test2 && test3) ? 'SUCCESS' : 'FAILED');
        } catch (e) {
            console.log('FAILED');
        }
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_create_timer(self):
        """Test createTimer returns ms elapsed"""
        script = """
        const { createTimer } = require('./lib/logger.ts');
        
        const timer = createTimer();
        
        // Wait a bit
        setTimeout(() => {
            const elapsed = timer();
            const isValid = elapsed >= 50 && elapsed <= 200;
            console.log(isValid ? 'SUCCESS' : 'FAILED');
        }, 100);
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_cost_tracker_interface(self):
        """Test RequestCost interface and COST_CONSTANTS"""
        script = """
        const { COST_CONSTANTS, calculateTotalCost } = require('./lib/cost-tracker.ts');
        
        // Test COST_CONSTANTS.TTS_COST_PER_CHAR
        const correctTTSCost = COST_CONSTANTS.TTS_COST_PER_CHAR === 0.0000003;
        
        // Test calculateTotalCost returns correct fields
        const result = calculateTotalCost("gemini-2.5-pro", 1000, 500, 100);
        const hasRequiredFields = result.model && 
                                 typeof result.inputTokens === 'number' &&
                                 typeof result.outputTokens === 'number' &&
                                 typeof result.costUsd === 'number' &&
                                 typeof result.ttsChars === 'number' &&
                                 typeof result.ttsCostUsd === 'number' &&
                                 typeof result.totalCostUsd === 'number';
        
        console.log((correctTTSCost && hasRequiredFields) ? 'SUCCESS' : 'FAILED');
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_cost_calculation(self):
        """Test calculateTotalCost calculates costs correctly"""
        script = """
        const { calculateTotalCost } = require('./lib/cost-tracker.ts');
        const { MODEL_COSTS } = require('./lib/model-router.ts');
        
        const result = calculateTotalCost("gemini-2.5-pro", 1000, 500, 1000);
        
        // Expected: (1000/1000 * 0.00125) + (500/1000 * 0.01) = 0.00125 + 0.005 = 0.00625
        const expectedGeminiCost = 0.00625;
        // Expected TTS: 1000 * 0.0000003 = 0.0003
        const expectedTTSCost = 0.0003;
        const expectedTotal = expectedGeminiCost + expectedTTSCost;
        
        const costCorrect = Math.abs(result.costUsd - expectedGeminiCost) < 0.000001;
        const ttsCostCorrect = Math.abs(result.ttsCostUsd - expectedTTSCost) < 0.000001;
        const totalCorrect = Math.abs(result.totalCostUsd - expectedTotal) < 0.000001;
        
        console.log((costCorrect && ttsCostCorrect && totalCorrect) ? 'SUCCESS' : 'FAILED');
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_daily_budget_default(self):
        """Test DAILY_BUDGET_USD defaults to 5.0"""
        script = """
        const { DAILY_BUDGET_USD } = require('./lib/cost-tracker.ts');
        
        console.log(DAILY_BUDGET_USD === 5.0 ? 'SUCCESS' : 'FAILED');
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_budget_alert_logic(self):
        """Test checkBudgetAlert returns true when over budget and logs warn event"""
        script = """
        const { checkBudgetAlert, DAILY_BUDGET_USD } = require('./lib/cost-tracker.ts');
        
        let logOutput = '';
        const originalLog = console.log;
        console.log = (msg) => { logOutput = msg; };
        
        // Test over budget
        checkBudgetAlert(null, DAILY_BUDGET_USD + 1).then(result => {
            console.log = originalLog;
            
            try {
                const parsed = JSON.parse(logOutput);
                const isWarnLevel = parsed.level === 'warn';
                const isCorrectEvent = parsed.event === 'budget.threshold_crossed';
                const hasMetadata = parsed.metadata && parsed.metadata.dailyCostSoFar && parsed.metadata.budgetUsd;
                
                console.log((result === true && isWarnLevel && isCorrectEvent && hasMetadata) ? 'SUCCESS' : 'FAILED');
            } catch (e) {
                console.log('FAILED');
            }
        });
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_env_error_handling(self):
        """Test getEnv throws clear error with key name when env var missing"""
        script = """
        const { getEnv } = require('./lib/env.ts');
        
        // Temporarily remove an env var
        const originalValue = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        
        try {
            getEnv();
            console.log('FAILED'); // Should have thrown
        } catch (error) {
            const hasKeyName = error.message.includes('GEMINI_API_KEY');
            const isClearError = error.message.includes('Missing required environment variable');
            
            // Restore env var
            if (originalValue) process.env.GEMINI_API_KEY = originalValue;
            
            console.log((hasKeyName && isClearError) ? 'SUCCESS' : 'FAILED');
        }
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_env_exists_function(self):
        """Test envExists returns boolean correctly"""
        script = """
        const { envExists } = require('./lib/env.ts');
        
        // Test with existing env var
        process.env.TEST_VAR = 'test_value';
        const existsTrue = envExists('TEST_VAR');
        
        // Test with non-existing env var
        const existsFalse = envExists('NON_EXISTENT_VAR');
        
        // Test with empty env var
        process.env.EMPTY_VAR = '';
        const existsEmpty = envExists('EMPTY_VAR');
        
        delete process.env.TEST_VAR;
        delete process.env.EMPTY_VAR;
        
        console.log((existsTrue === true && existsFalse === false && existsEmpty === false) ? 'SUCCESS' : 'FAILED');
        """
        
        success, output = self.run_node_script(script)
        return success and 'SUCCESS' in output

    def test_file_imports_and_structure(self):
        """Test that all observability files can be imported without errors"""
        files_to_test = [
            'lib/logger.ts',
            'lib/cost-tracker.ts', 
            'lib/env.ts',
            'app/api/health/route.ts',
            'middleware.ts'
        ]
        
        for file_path in files_to_test:
            if not os.path.exists(f'/app/{file_path}'):
                print(f"❌ File not found: {file_path}")
                return False
        
        # Test that API routes import the observability modules
        api_routes = [
            'app/api/chat/route.ts',
            'app/api/tts/route.ts', 
            'app/api/memory/route.ts'
        ]
        
        for route_path in api_routes:
            with open(f'/app/{route_path}', 'r') as f:
                content = f.read()
                if 'createTimer' not in content or 'logRequest' not in content or 'logError' not in content:
                    print(f"❌ Missing logging imports in {route_path}")
                    return False
        
        return True

    def test_health_endpoint_structure(self):
        """Test health endpoint response structure"""
        with open('/app/app/api/health/route.ts', 'r') as f:
            content = f.read()
        
        # Check for correct response structure
        required_fields = ['status', 'version', 'checks', 'timestamp']
        status_values = ['"ok"', '"degraded"', '"down"']
        status_codes = ['200', '207', '503']
        
        has_interface = 'interface HealthResponse' in content
        has_required_fields = all(field in content for field in required_fields)
        has_status_values = all(status in content for status in status_values)
        has_status_codes = all(code in content for code in status_codes)
        no_env_exposure = 'process.env' not in content or 'npm_package_version' in content
        
        return has_interface and has_required_fields and has_status_values and has_status_codes

    def test_middleware_logging_integration(self):
        """Test middleware has proper logging integration"""
        with open('/app/middleware.ts', 'r') as f:
            content = f.read()
        
        # Check for required logging events
        required_events = [
            'api.request',
            'api.rate_limited', 
            'api.unauthorized'
        ]
        
        has_logger_import = 'from "@/lib/logger"' in content
        has_logging_events = all(event in content for event in required_events)
        has_health_exclusion = 'isHealthRoute' in content and 'health checks through without rate limiting' in content
        
        return has_logger_import and has_logging_events and has_health_exclusion

    def run_all_tests(self):
        """Run all observability tests"""
        print("🚀 Starting Observability Layer Testing...")
        print("=" * 60)
        
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
        
        # Structure tests
        self.run_test("File Imports and Structure", self.test_file_imports_and_structure)
        self.run_test("Health Endpoint Structure", self.test_health_endpoint_structure)
        self.run_test("Middleware Logging Integration", self.test_middleware_logging_integration)
        
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
    tester = ObservabilityTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())