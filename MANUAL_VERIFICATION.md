# Verification Instructions for Board Level Audit

## Prerequisites
1. Ensure you have a valid Gemini API Key set in the environment or directly in the browser console (`window.GEMINI_API_KEY = "..."`).
2. Start the local server:
   ```bash
   python3 -m http.server 8080
   ```
3. Open `http://localhost:8080` in your browser.

## Test Cases

### 1. The "Desert" Test (Low Score Expectation)
**Goal:** Verify that the "Board" correctly identifies a bad location and the CFO is harsh.
1. Check the **"Pro Mode (Kontur/DataHunters)"** checkbox in the sidebar.
2. Click **"Start Analysis"**.
3. Click on a remote area (e.g., in the steppe/desert outside the city).
4. In the popup, check **"Strict Mode (Risk Manager)"**.
5. Click **"Analyze"**.
**Expected Result:**
- **Score:** < 30 (Red Zone).
- **CFO Verdict:** "Money Pit" or "Burning Cash". Mention of low density and lack of infrastructure.
- **Board Discussion:** Should reflect a consensus to REJECT.

### 2. The "City Center" Test (High Score Expectation)
**Goal:** Verify that the CEO identifies potential and the score is high.
1. Ensure **"Pro Mode"** is checked.
2. Click on a busy intersection in Almaty (e.g., Gogol/Panfilov).
3. (Optional) Leave "Strict Mode" unchecked.
4. Click **"Analyze"**.
**Expected Result:**
- **Score:** > 80 (Green/Gold Zone).
- **CEO Verdict:** "High Visibility", "Brand Fit".
- **Ops Verdict:** Mention of high foot traffic and nearby generators (Universities/Malls).

### 3. The "Barrier" Test (Strict Penalty)
**Goal:** Verify that physical barriers significantly reduce the score even if density is high.
1. Ensure **"Pro Mode"** is checked.
2. Click near a major highway (e.g., VOAD) or a river/lake (Sairan) where access is blocked.
3. Check **"Strict Mode"**.
4. Click **"Analyze"**.
**Expected Result:**
- **Score:** Should be penalized (likely < 60) despite surrounding density.
- **CFO/Ops Verdict:** Should explicitly mention the barrier (River/Highway) as a deal-breaker or major risk.

## Technical Validation
If you want to inspect the prompt being sent to Gemini:
1. Open the browser Developer Tools (F12).
2. Go to the **Network** tab.
3. Filter by `generateContent`.
4. Inspect the payload of the request. You should see the `system_instruction` containing the text "Ты — СОВЕТ ДИРЕКТОРОВ...".
