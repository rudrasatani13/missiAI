#!/usr/bin/env python3
"""
Debug specific failing tests
"""

import subprocess
import os

def debug_typescript_compilation():
    """Debug TypeScript compilation"""
    print("=== TypeScript Compilation Debug ===")
    
    result = subprocess.run(
        ['./node_modules/.bin/tsc', '--noEmit'],
        cwd='/app',
        capture_output=True,
        text=True,
        timeout=30
    )
    
    print(f"Return code: {result.returncode}")
    print(f"STDERR:\n{result.stderr}")
    print(f"STDOUT:\n{result.stdout}")
    
    if result.returncode != 0:
        error_output = result.stderr
        has_waitlist_error = 'waitlist/page.tsx' in error_output
        error_lines = [line for line in error_output.split('\n') if 'error TS' in line]
        error_count = len(error_lines)
        
        print(f"Has waitlist error: {has_waitlist_error}")
        print(f"Error count: {error_count}")
        print(f"Error lines: {error_lines}")

def debug_budget_alert():
    """Debug budget alert logic test"""
    print("\n=== Budget Alert Logic Debug ===")
    
    with open('/app/lib/cost-tracker.ts', 'r') as f:
        content = f.read()
    
    # Check each condition
    has_function = 'export async function checkBudgetAlert(' in content
    has_params = 'kv: KVStore | null, dailyCostSoFar: number' in content
    has_return_type = 'Promise<boolean>' in content
    has_budget_check = 'dailyCostSoFar <= DAILY_BUDGET_USD' in content
    has_warn_log = 'level: "warn"' in content and 'budget.threshold_crossed' in content
    has_return_true = 'return true' in content
    has_return_false = 'return false' in content
    
    print(f"Has function: {has_function}")
    print(f"Has params: {has_params}")
    print(f"Has return type: {has_return_type}")
    print(f"Has budget check: {has_budget_check}")
    print(f"Has warn log: {has_warn_log}")
    print(f"Has return true: {has_return_true}")
    print(f"Has return false: {has_return_false}")
    
    # Show relevant lines
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'checkBudgetAlert' in line or 'return true' in line or 'return false' in line:
            print(f"Line {i+1}: {line.strip()}")

if __name__ == "__main__":
    debug_typescript_compilation()
    debug_budget_alert()