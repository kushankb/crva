# CRVA indicator weighting survey

Expert survey that sets the weights of the India CRVA indicators (TCP/IND/4005, Activity 2.4).

| Part | Where | What it does |
| --- | --- | --- |
| Expert survey | `web/public/survey/index.html` → `kushankbajaj.com/crva/survey/?code=XXXX` | The designed survey. Saves drafts and submissions to the Google Sheet. |
| Results | `web/public/survey/results.html` | Facilitator view. Needs the admin key from the Sheet. Bootstrap intervals, Kendall's W, round comparison, downloads. |
| Backend | `survey-backend/Code.gs` | Google Apps Script bound to the Sheet. The only thing that writes to it. |
| Data | The Google Sheet you create | Indicator list, settings, invitations and every response. |

## Set up (once, about 5 minutes)

1. Create a new Google Sheet in the Drive account that should own the data.
2. In the Sheet: **Extensions → Apps Script**. Delete the sample code and paste the whole of `Code.gs`.
3. Pick `setup` in the function menu and press **Run**. Approve the permissions (it only touches this Sheet).
   It creates the tabs, seeds the 54 Annexure I indicators and writes an `adminKey` in **Settings**.
4. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Copy the URL ending in `/exec`.
5. Put that URL in `web/public/survey/endpoint.js` and push to `main`. GitHub Pages redeploys in about a minute.
6. Optional: run `makeInvitationCodes` from the script editor to fill **Invitations** with 40 random codes, then add names and emails.
   Each expert's link is `https://kushankbajaj.com/crva/survey/?code=<their code>`.

When you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

## Running the exercise

| To do this | Change this in the Sheet |
| --- | --- |
| Add an indicator | Add a row in **Indicators** (id can be left blank; it is generated and written back). Use status `candidate` for proposed ones. |
| Remove an indicator | Set its status to `retired`. Do not delete rows once responses exist. |
| Open round 2 | **Settings → activeRound = 2**. Experts then see the round 1 group median and their own round 1 answer. |
| Close the survey | **Settings → open = FALSE** |
| Allow anyone with the link | **Settings → requireCode = FALSE** (codes are recommended: they stop duplicates and link rounds) |
| Keep the printed order | **Settings → randomiseOrder = FALSE** |
| Record a new instrument version | Edit **Settings → version** whenever the indicator list changes mid-exercise |

## What is stored

- **Submissions**: append-only log, one row per submit, with the full answer set as JSON, the instrument version and a hash of the indicator list the expert saw. An expert can resubmit until the round closes; analysis uses the latest submission per expert and round, and earlier ones stay in the log.
- **Ratings**: one row per indicator per submission (long format), including familiarity, the position the indicator was shown in, and any flag.
- **Components**: point allocation, the two splits and self-rated familiarity per component.
- **Drafts**: unsubmitted work, so experts can stop and resume on another device with the same link.
- **Suggestions**: indicators experts propose.

The script runs as the Sheet owner. Experts never get access to the Sheet; the survey only receives the indicator list, its own expert's answers (by code), and in later rounds the group median and IQR per indicator.

## Analysis plan (pre-specified)

- Ratings 0 to 5; 0 = exclude; "Not sure" and skipped components are missing, not zero.
- Each expert's ratings are normalised to sum to 1 within a component; group weight = mean across experts, renormalised. Global weight = component share × split × within-component weight.
- Uncertainty: 95% percentile bootstrap over experts (B = 1,000, seed 20261006).
- Agreement: rating IQR per indicator; Kendall's W per component (experts who rated every indicator).
- Consensus rules: IQR ≤ 1 and < 25% exclude = consensus; IQR ≥ 2 or 25 to 49% exclude = discuss; ≥ 50% exclude = drop; proposed indicator with median ≥ 3 and < 25% exclude = promote.
- Stopping rule between rounds: accept when the median IQR stops shrinking and the mean change in global weight is under 0.25 points.
- Robustness: familiarity-weighted weights (1, 2, 3) compared by Spearman ρ; results with flagged submissions excluded (under 4 minutes active, or one rating value throughout).
