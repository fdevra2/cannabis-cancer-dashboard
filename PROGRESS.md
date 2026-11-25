# PROGRESS

Phase log for **Cannabis & Cancer: What the Evidence Can and Cannot Tell Us** (independent student project by Dev Raj, MS Health Data Science, Dartmouth).
Each phase lists what was built, what was verified, anything UNVERIFIED, and judgment calls.

---

## Phase A — Data pipeline + validation (2026-11-25)

### Built
- `analysis/R/config.R`: cycles 2005–2006 (D) … 2017–2018 (J); components DEMO, DUQ, SMQ, MCQ, ALQ, HIQ, BMX (all cycles), SXQ (D–I), ORHPV (F–I), HPVSWR (D–I), HPVSRM (D).
- `analysis/R/download.R`: downloads 66 XPT files + 66 codebook pages from wwwn.cdc.gov; writes `data/raw/MANIFEST.csv` (URL, bytes, SHA-256, download time). Re-runs verify checksums and stop if CDC revised a file.
- `analysis/R/codebook.R`: parses codebook HTML into `codebook_vars.csv` / `codebook_values.csv`; generates `docs/variables.md` (variable × cycle availability).
- `analysis/R/harmonize.R`: one row per DEMO participant (70,190 rows across 7 cycles). Refused/don't-know codes are removed using each cycle's own codebook (codes differ by cycle). Derived: demographics, marijuana exposures (ever, past-30-day, days/30, regular use, age at first/regular use, crude joint-year proxy), smoking status, harmonized alcohol category, insurance, cancer outcomes (any; excluding non-melanoma skin; excluding cervical; excluding both), site flags, age at first diagnosis, lifetime sex partners, measured HPV (oral, vaginal, serum), BMI.
- `analysis/R/design.R`: `make_design()` builds the MEC design on the **full pooled sample** and refuses a pre-filtered frame; `analytic_subset()` uses `subset()`; `nchs_proportion()` implements Korn–Graubard CIs + NCHS Data Presentation Standards for Proportions.
- `analysis/R/prevalence.R` → `site/public/data/prev_ever_by_cycle.json`.
- `renv.lock` (R 4.6.1, 91 packages), `Makefile`, `CLAUDE.md`, `.env.example` (`NCBI_EMAIL` placeholder; `.env` gitignored).

### Verified
- **Public vs restricted (rule 4):** DUQ_D … DUQ_J public (HTTP 200). `P_DUQ_R` (2017–Mar 2020) and `DUQ_L_R` (2021–2023) are "RDC Only … not available publicly" per CDC documentation pages. `SXQ_J_R` (2017–2018 sexual behavior) is also RDC-only.
- **Marijuana items stop at 59.** Codebooks for 2007+ describe 18/20–69, but every participant aged 60–69 is missing DUQ200 in the public files (test). Analytic ages: 20–59 (all cycles; primary), 18–59 (2009+).
- **NCHS validation (test passes, exact at 1 decimal):** NCHS Data Brief 360 (Hales et al., 2020), adults 20+, 2017–2018, pregnant excluded, MEC weights. Published vs ours: total 42.5 / 42.51; men 43.0 / 42.98; women 42.1 / 42.06; 20–39 40.0 / 40.00; 40–59 44.8 / 44.83; 60+ 42.8 / 42.78. Figures and sample definition were confirmed verbatim on the CDC page before the test was written.
- **Full-sample design + subset() (addition 1):** tests confirm the design object holds all 70,190 DEMO rows, refuses filtered input, retains full PSU counts per stratum after `subset()`, and that filter-first produces lonely PSUs (error) in a small domain where `subset()` gives a valid SE. `survey.lonely.psu = "fail"` so a lonely PSU can never be silently adjusted.
- Harmonized DUQ200 and MCQ220 counts equal CDC codebook frequencies in every cycle; strata are unique across cycles; manifest SHA-256 matches every file; no restricted file in the manifest.
- Korn–Graubard implementation agrees with `survey::svyciprop(method = "beta")` (±0.01).
- Sanity check: ever-use among ages 20–59 ranges 57.7–61.5% by cycle (all meet NCHS standards).

### HPV data (addition 2) — available and usable as a sensitivity block
| Source | Files | Who | Analytic n (20–59, DUQ answered) | Cancer cases |
|---|---|---|---|---|
| Oral rinse HPV DNA (`ORXHPV`, types 16/18) | ORHPV_F–I (2009–2016) | Both sexes, public 18–69 | 12,556 | 499 |
| Vaginal swab HPV DNA (`LBDRPCR`, `LBDR16/18`) | HPVSWR_D–I (2005–2016) | Women, public 18–59 | 9,085 | 488 |
| Serum HPV antibodies (9-plex; 16/18) | HPVSRM_D (2005–2006) | Both sexes 18–59 | 2,738 | 100 |
| Sexual behavior proxy (lifetime partners) | SXQ_D–I (SXQ_J is RDC-only) | Both sexes | 19,098 | 759 |

Plan: measured HPV enters as a sensitivity block on its own subsample (oral HPV for both sexes; vaginal HPV for the women-only cervical analysis); SXQ lifetime partners is the broader proxy block. Neither is available for 2017–2018.

### Cancer outcome composition (ages 20–59, pooled)
893 self-reported cancers; first-reported type: cervix 167, non-melanoma skin 124, breast 120, unknown-kind skin 53, other 53, uterus 50, melanoma 49, prostate 38, colon 36, thyroid 34. Cervical = 171 cases (19% of all cancers). Outcome variants: any 893; excl. skin 720; excl. cervical 735; excl. both 558.

### Judgment calls
- **Primary sample = ages 20–59, 2005–2018 pooled (weights /7).** 18–19-year-olds lack MCQ (all cycles) and ALQ (2009–2010), so they can't enter the cancer models.
- **Cycles 1999–2004** (public DUQ exists) not included, for consistency of DUQ/MCQ items and weighting; could be added later as a sensitivity analysis.
- **Exclusion outcomes:** someone whose only reported cancers are the excluded type(s) (skin codes 32/33; cervix 15) is a non-case; cases with unknown type stay cases.
- **Skin "don't know what kind" (code 33)** is grouped with non-melanoma skin (conventional; melanoma has its own code).
- **Alcohol harmonization:** 2005–2016 use ALQ120Q/U × ALQ130; 2017–2018 uses ALQ121 categories mapped to midpoints × ALQ130. Categories: none in past year / moderate (≤7 drinks/wk women, ≤14 men) / heavy. Lifetime <12 drinks = none. Imperfect across the 2017 redesign; noted as a limitation.
- **Joint-year proxy (2009+):** DUQ217 frequency midpoints × DUQ219 joints/day (6+ → 6) × years of regular use (age started regular use to age at last regular use). Crude and unvalidated; **not** the Cannabis Exposure Index.
- **DUQ230** is asked only of people whose last use was ≤30 days ago, so others are coded 0 days (never-users too).
- **Reliability rules source:** the NCHS NHANES tutorial "Reliability of Estimates" page (summarizing Parker et al. 2017). The full PDF of Series 2 No. 175 could not be text-extracted here.

### UNVERIFIED / for you to check
- Self-reported "cervical cancer" in NHANES may include treated precancer (CIN); results that exclude cervical cancer address this partly. Worth a sentence in Methods. (Not yet sourced; no claim on the site until it is.)
- `MCD240A–C` (2017–2018) are bottom-coded at 16 and `DUQ210` at 11 in that cycle; this affects the reverse-causation comparison only for very young ages.

---

## Site skeleton (after Phase A)

### Built
- `site/`: Vite 8.1.7 + TypeScript 6.0.3 + Observable Plot 0.6.19 + d3 7.9.2 (exact pins; all published ≥2 weeks before build). Node 24.22.3 LTS (`site/.nvmrc`), installed to `~/.local/opt/node` from nodejs.org (SHA-256 verified).
- Hash-routed tabs (`#overview`, `#evidence`, `#nhanes`, `#exposure`, `#causal`, `#ai`, `#policy`, `#methods`); `base: "./"` so the build works from any GitHub Pages path.
- Shared figure component: title, one-sentence "What this shows" caption, plot with `role="img"` + alt text, data table (`<details>`), notes. Charts re-render on resize and on light/dark change.
- First real chart: weighted ever-use prevalence by cycle with Korn–Graubard CIs (NHANES Explorer).
- `site/tests/data-contract.test.ts` (vitest): every JSON in `public/data` has meta + data; CIs bracket estimates; reliability status is valid.
- `site/scripts/shot.mjs`: Playwright screenshots used to check layout at 1280px and 400px, light and dark.

### Verified
- `tsc --noEmit`, `vitest`, `vite build` pass. Visual check at desktop and phone widths, light and dark.
- The "intervals overlap" caption is computed from the data, not hard-coded.

### Judgment calls
- Prevalence charts use a 0–100% axis so stable proportions aren't visually exaggerated.
- Tabs are navigation links with `aria-current="page"` (each tab is a page), not an ARIA tablist.

---

## Phase B — NHANES analyses (2026-11-25)

### Built
- `analysis/R/analysis_vars.R`: analysis variables, covariate blocks, outcome and exposure definitions.
- `analysis/R/prevalence.R` → `prevalence.json` (11 measures × overall/cycle/age/sex/race/cannabis status/smoking status), `reverse_causation.json`, `prev_ever_by_cycle.json`.
- `analysis/R/models.R` → `models_grid.json` (768 survey-weighted logistic models: 4 outcomes × 4 exposure definitions × 3 samples × 16 covariate sets), `models_hpv.json` (HPV sensitivity models on their own subsamples), `models_dose.json` (categorical dose-response).
- Tests: `test-models.R` (grid shape; identical people across covariate sets; crude svyglm OR = weighted 2×2 OR; reverse-causation samples remove only cases), `test-bmjopen-crosscheck.R`.

### Verified
- **External cross-check (exact):** lifetime marijuana use by cycle reproduces Mitchell, Bhatia & Zebardast, *BMJ Open* 2020;10:e037905 (doi:10.1136/bmjopen-2020-037905), Table 1. All 7 cycles match to 1 decimal (61.5, 60.5, 57.2, 59.9, 59.2, 57.3, 60.9) and Ns match exactly. Their Ns equal the DUQ-answered counts, which confirms that their "50–69" age group actually contains no one older than 59.
- Every prevalence estimate in `prevalence.json` and `reverse_causation.json` meets the NCHS standards (0 suppressed, 0 review).
- Crude survey OR equals the OR from weighted proportions (tolerance 1e-6).
- All R tests pass (design, harmonize, manifest, models, NCHS obesity, BMJ Open).

### Key results (ages 20–59, 2005–2018; for the site)
- Ever-use and any cancer: OR 1.32 (crude) → 1.32 (+demographics) → 1.19 (0.97–1.47) (+tobacco) → 1.19 (0.96–1.47) (all four blocks). Excluding skin + cervical cancers: 1.07–1.13, CIs include 1.
- Past-30-day use: crude 1.17 → 1.68 after demographics. Confounding by age runs the other way: current users are young, and young people rarely have cancer.
- Reverse causation: 93.0% of cancer survivors who ever used cannabis started before diagnosis, 1.8% in the same year, 5.3% after. Excluding post-diagnosis initiators: ever-use OR 1.19 → 1.11; regular use 1.44 → 1.25.
- Women, cervical cancer: ever-use OR 2.48 crude → 1.19 with all four blocks; adding measured vaginal HPV 16/18 changes it little (1.18). Current HPV DNA is a poor marker of the past infection that caused a (treated) cancer, so this does **not** show that HPV is not a confounder.
- No dose-response gradient across days used or joint-year categories.
- Tobacco is strongly associated with cannabis: current smoking 32.5% among ever-users vs 10.1% among never-users.

### Judgment calls
- **Headline exposure contrasts are vs never-users** for every definition (ever, regular, past-30-day, ≥20 joint-years), so the definitions differ in intensity and share a reference group. People in between (e.g. former occasional users in the past-30-day contrast) are left out of that contrast. Dose-response models keep everyone in categories.
- **Fixed analytic sample per exposure/outcome/sample**: complete cases on all four covariate blocks (n = 20,449 of 22,208 for ever-use; 1,685 lost to missing income-to-poverty ratio). OR movement in the toggle therefore reflects adjustment, not a changing sample. Missing PIR is a limitation (not imputed).
- **Covariates:** age + age² (centered), sex, race/ethnicity (RIDRETH1), survey cycle; smoking status (never/former/current; no pack-years, so residual confounding by intensity likely); alcohol (none/moderate/heavy); education, PIR (<1, 1–2, 2–4, ≥4), any health insurance.
- **Precision flag for ORs** (no NCHS standard exists for ORs): "imprecise" if exposed or unexposed cases < 10 or residual df < 8. No headline model is flagged.
- **Reverse-causation exclusion is outcome-specific:** a case is dropped if use started after the first diagnosis of a cancer that counts toward that outcome (e.g. first non-skin cancer for the skin-excluded outcome). Bug caught by a test and fixed.
- **ORs use t-based CIs** on the model's residual design df. ORs approximate prevalence ratios only when the outcome is rare; cancer history is ~5%, so they are close.

### UNVERIFIED / to check
- The joint-year proxy's thresholds (<5, 5–19.9, ≥20) were chosen from the distribution among regular users (median 6.3), not from the literature.
