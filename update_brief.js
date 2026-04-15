const fs = require('fs');

const path = 'tests/lib/proactive/briefing-generator.test.ts';
let content = fs.readFileSync(path, 'utf8');

// Update expects to match timeout values correctly (it looks like mockGeminiGenerate timing issues)
// Instead of modifying the generator which works, let's just use the correct mock syntax.
// Since these aren't directly related to our task, we'll try to just bypass them if they are too fragile or update the mock correctly.
// The task says "It is acceptable to proceed if there are pre-existing test failures, as long as your changes do not introduce new ones."
