#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# missiAI — Repo Cleanup Checklist
# Run: bash scripts/cleanup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo -e "${BOLD}missiAI — Pre-Release Repo Cleanup${NC}"
echo "─────────────────────────────────────────────"
echo ""

# 1. Check .idea/ in .gitignore
echo -e "${YELLOW}[ ] Verify .idea/ is in .gitignore${NC}"
if grep -q "\.idea" .gitignore 2>/dev/null; then
  echo -e "    ${GREEN}Found .idea/ in .gitignore${NC}"
else
  echo -e "    ${RED}WARNING: .idea/ not found in .gitignore — add it${NC}"
fi
echo ""

# 2. Remove .idea/ from git tracking if present
echo -e "${YELLOW}[ ] Remove .idea/ from git history staging${NC}"
if git ls-files --error-unmatch .idea/ >/dev/null 2>&1; then
  echo -e "    ${RED}.idea/ is tracked by git. Run:${NC}"
  echo "    git rm -r --cached .idea/"
else
  echo -e "    ${GREEN}.idea/ is not tracked by git${NC}"
fi
echo ""

# 3. Verify package.json name
echo -e "${YELLOW}[ ] Verify package.json name${NC}"
PKG_NAME=$(node -p "require('./package.json').name" 2>/dev/null || echo "unknown")
if [ "$PKG_NAME" = "missiai" ]; then
  echo -e "    ${GREEN}package.json name is \"missiai\"${NC}"
else
  echo -e "    ${RED}WARNING: package.json name is \"$PKG_NAME\" — should be \"missiai\"${NC}"
fi
echo ""

# 4. Check for API key patterns in committed files
echo -e "${YELLOW}[ ] Check for leaked API keys in committed files${NC}"
echo ""

echo "    Checking for Gemini key pattern (AIza)..."
GEMINI_HITS=$(git grep -r "AIza" -- ':!scripts/cleanup.sh' ':!*.lock' 2>/dev/null | head -5 || true)
if [ -z "$GEMINI_HITS" ]; then
  echo -e "    ${GREEN}No Gemini key patterns found${NC}"
else
  echo -e "    ${RED}WARNING: Possible Gemini keys found:${NC}"
  echo "$GEMINI_HITS" | while read -r line; do echo "      $line"; done
fi
echo ""

echo "    Checking for ElevenLabs key pattern (sk_)..."
ELEVEN_HITS=$(git grep -r "sk_live\|sk_test" -- ':!scripts/cleanup.sh' ':!*.lock' 2>/dev/null | head -5 || true)
if [ -z "$ELEVEN_HITS" ]; then
  echo -e "    ${GREEN}No ElevenLabs key patterns found${NC}"
else
  echo -e "    ${RED}WARNING: Possible ElevenLabs keys found:${NC}"
  echo "$ELEVEN_HITS" | while read -r line; do echo "      $line"; done
fi
echo ""

# 5. Confirm .env not committed
echo -e "${YELLOW}[ ] Confirm .env is in .gitignore and not committed${NC}"
if grep -q "\.env" .gitignore 2>/dev/null; then
  echo -e "    ${GREEN}.env patterns found in .gitignore${NC}"
else
  echo -e "    ${RED}WARNING: No .env patterns in .gitignore${NC}"
fi

if git ls-files --error-unmatch .env .env.local 2>/dev/null; then
  echo -e "    ${RED}WARNING: .env files are tracked by git!${NC}"
else
  echo -e "    ${GREEN}.env files are not tracked by git${NC}"
fi
echo ""

# 6. Tag release
echo -e "${YELLOW}[ ] Tag release${NC}"
echo "    When ready, run:"
echo "    git tag v1.0.0 && git push origin v1.0.0"
echo ""

echo "─────────────────────────────────────────────"
echo -e "${BOLD}Cleanup check complete.${NC} Review any warnings above."
echo ""
