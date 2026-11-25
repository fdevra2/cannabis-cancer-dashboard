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

---

## Phase C — Evidence table (2026-11-25)

### Built
- `data/literature_sources.csv` (21 DOIs) → `analysis/R/literature_fetch.R` archives each record from Europe PMC (abstract; open-access full text when available) or Crossref, plus the official NASEM 2017 committee-conclusions PDF, in `data/raw/literature/` (gitignored, rebuilt by `make data`).
- `data/evidence.csv`: 39 rows (38 VERIFIED, 1 UNVERIFIED) covering lung (8), head & neck/oral (15), esophageal (1), testicular germ cell (10), bladder (1), prostate (1), cervical (1), all sites (2). Columns include site, design, exposure definition, comparison, effect measure, estimate + CI, adjusted-for-tobacco (Y/N/Mixed/NR), DOI, NASEM evidence grade, a **verbatim quote** from the source, status, notes.
- `data/evidence_grades.csv`: NASEM 2017 grade per site with verbatim wording.
- `analysis/R/evidence_export.R` → `site/public/data/evidence.json` (VERIFIED rows only).
- `analysis/tests/testthat/test-evidence.R`.

### Verified
- **Every row has a DOI** that was fetched (test).
- **Every VERIFIED row's quote appears verbatim in the archived abstract/full text, and the estimate, lower and upper CI values appear in that quote** (test, 38/38).
- **NASEM grades** (5-1 lung: moderate evidence of no association; 5-2 head & neck: moderate evidence of no association; 5-3 non-seminoma TGCT: limited evidence of association; 5-4 esophageal and 5-5 prostate/cervical/bladder: insufficient) match the official NAP conclusions PDF verbatim (test).
- Findings in every direction: 16 higher risk, 4 lower risk, 18 no clear association (rule: CI entirely above 1 / entirely below 1 / includes 1).
- The three recent meta-analyses you named were found and verified:
  - **Oral cancer, J Ethn Subst Abuse 2025** (Ibrahim Mohammad et al., doi:10.1080/15332640.2025.2581692): pooled OR 0.659 (0.500–0.869), case-control only.
  - **Testicular GCT** (Kardoust Parizi et al., *BJU Int*, doi:10.1111/bju.70062; Europe PMC lists 2026): current use OR 1.62 (1.13–2.31); ≥10 years 1.68 (1.19–2.36).
  - **Lung, Karimi et al.** (*Addict Health* 2026, doi:10.34172/ahj.1710): cohort studies ES 2.06 (1.04–4.07); case-control 1.16 (0.71–1.88).
  - Also found: Jan et al. 2026 (*Health Sci Rep*) oral-cancer meta-analysis, pooled OR 0.481 overall but 2.51 (0.244–25.823) in cohort studies.

### UNVERIFIED (kept off the site)
- **A02** Sidney et al. 1997, all-site RR for men: the abstract prints the CI as "0.7-12" (apparently a typo for 1.2). Excluded because the number cannot be confirmed from the source text.

### Judgment calls
- Quotes come from abstracts unless a number appears only in the open-access full text (Ghasemiesfe 2019: HNSCC 1.26, oral 1.22, ever-use TGCT 1.11).
- Multiple estimates per study are separate rows (e.g. Gallagher 2024 by subsite) and are labelled with exposure/comparison so they are not double-counted as independent studies.
- Meta-analyses are marked "Mixed" for tobacco adjustment (component studies vary).
- **Gallagher et al. 2024** (*JAMA Otolaryngol*) has a published "Error in Abstract" correction (doi:10.1001/jamaoto.2025.0242). Its text is only available as a PDF I could not retrieve. The current PubMed abstract shows the same RRs used here.
- Text normalization for matching strips only known formatting tags, because abstracts contain literal "<" (e.g. "<or=55 yrs", "10-<20 years"). A naive HTML parse silently dropped text; the verbatim test caught it.

---

## Phase D — Front-end tabs (2026-11-25)

### Built (all live on the dev server, http://127.0.0.1:5173/)
- **Overview:** 5 plain-language takeaway cards, each linked to its evidence. **Every number on the card is computed from the data files at load time**, not typed in.
- **Evidence Map:** forest plot per cancer site (log scale; diamonds = meta-/pooled analyses), with filters for design, tobacco adjustment and publication year range. Each site has a NASEM 2017 grade badge. Hover shows citation and DOI; there is a data table and a DOI reference list per site, and a "map, not a meta-analysis" caveat.
- **NHANES Explorer:**
  - ★ confounding toggle: outcome/exposure/sample selectors and 4 covariate-block checkboxes; hero OR + CI, n, cases, E-value; cumulative-adjustment chart; button to send the estimate to the E-value calculator;
  - ★ specification curve: 192 models per outcome, with an indicator panel; the toggle's current selection is highlighted;
  - ★ reverse-causation lens: segmented bars of when survivors started (before/same year/after diagnosis), ORs re-estimated after exclusions, current use by years since diagnosis;
  - HPV sensitivity panels;
  - prevalence explorer (11 measures × 7 breakdowns) and the ever-use-by-cycle chart.
  - The survivorship-bias caveat (addition 3) appears at the top of the tab and in the NHANES chart notes.
- **Measuring Exposure:** share counted as users under four definitions; ORs by definition (crude vs fully adjusted); dose–response by days used and by joint-year proxy; "what surveys miss" cards; a CEI paragraph citing two verified 2026 papers.
- **Causal Reasoning:** keyboard-accessible DAG (11 factors: confounders, combustion pathway, medical use after diagnosis, survival/selection, measurement), with a detail panel. E-value calculator with presets (NHANES ORs and key published estimates), rare/common-outcome OR handling, and a bias curve.
- **Policy Context:** cumulative number of states with medical / adult-use laws by year of the law (NCSL Table 1), with the NHANES years shaded; THC potency of DEA-seized cannabis (ElSohly et al. 2016, 2021).
- **Methods & Limitations:** renders `docs/methods.md` (one source for repo docs and site), with 12 numbered limitations and reproduce/cite instructions.
- **AI in Health Research:** placeholder until Phase E.
- Pipeline additions: `analysis/R/policy.R` → `data/policy_ncsl.csv`, `site/public/data/policy.json`; `data/potency.csv`; `test-policy.R`.

### Verified
- `tsc`, `vitest` and `vite build` pass; all R tests pass (incl. potency quotes verbatim in abstracts; NCSL years present in NCSL's own text; spot checks CA 1996 medical, CO and WA 2012 adult use).
- Every tab screenshotted at 1280px (and key tabs at 400px, light and dark); no page errors.
- Methods citations verified against PubMed/Europe PMC (VanderWeele & Ding 2017;167(4):268–274; Simonsohn et al. 2020;4(11):1208–1214; Parker et al. 2017, Vital Health Stat 2(175):1–22).
- Text claims such as "intervals overlap" or "rise across categories" are computed from the data; two hard-coded versions were found and replaced.

### Judgment calls
- **Policy timeline uses years, not exact effective dates.** NCSL Table 1 gives the year of each statute or ballot measure. Exact effective dates would need state-by-state primary-source checks, which were not done, so they are not shown. The chart counts the 41 states in NCSL's table. DC (NCSL note: 1998 initiative "blocked") is flagged and listed in the table only; territories are listed but not charted. NCSL page "Updated September 02, 2026"; it lists Georgia SB 220 (2026).
- **Potency** shows only the abstract-stated values (2 + 3 points), from DEA-seized illicit cannabis. It is labelled as not representative of legal retail products. The 2024 regional paper (Front Public Health) was fetched, but its abstract gives no national trend numbers, so it is not charted.
- **Overview card 2** says tobacco is "a major confounder", not "the biggest". In these models tobacco moves the OR more than any other block, but other confounders are unmeasured.
- **CEI wording:** the 2026 *Drug Alcohol Depend* title says "Cannabis Exposure **Index**" but its abstract spells out "Cannabis Exposure **Inventory**". The site uses the title wording; please confirm the preferred name.
- Methods are rendered from Markdown with `marked` 18.2.0 (trusted repo file; DOIs auto-linked).


---

## Phase E — AI demos (2026-11-25)

### Built
- **(a) Predictive model** (`analysis/R/ai_predict.R` → `ai_predict.json`):
  - task: predict self-reported cancer history among NHANES adults 20–59, using age, sex, race/ethnicity, education, income-to-poverty ratio, insurance, smoking, alcohol, BMI, ever and past-30-day cannabis use;
  - **temporal validation:** train 2005–2014, test 2015–2018; MEC weights used in fitting and in every metric;
  - models: weighted logistic regression vs xgboost (rounds chosen by 5-fold CV with early stopping);
  - metrics: weighted AUROC with PSU-cluster bootstrap CIs, decile calibration, calibration slope, Brier, subgroup AUROC (with bootstrap CIs) and calibration-in-the-large by sex/race/age, and TreeSHAP importance.
- **(b) Literature triage** (`analysis/R/ai_triage.R` → `ai_triage.json`):
  - retrieval: PubMed E-utilities (`tool=cannabis-cancer-dashboard`, email from `.env` if set, ≤3 req/s), 1115 records plus per-year counts 1970–2025;
  - **transparent rule-based classifier** for design (9 labels) and cancer site (12 labels);
  - **blind 200-abstract validation template** (`data/labels/validation_template.csv`, stratified by predicted design, seed 20261125) and `docs/labeling_guide.md`;
  - Cohen's kappa + confusion matrices are computed automatically once `data/labels/validation_labels.csv` exists.
- **Optional LLM classifier** (`analysis/R/ai_triage_llm.R`, `make llm-triage`): Claude `claude-opus-5-5` via raw HTTP (R has no official SDK), JSON-schema structured output limited to the guide's categories, low effort, server-side fallbacks (`fallbacks: "default"`), refusals recorded as missing. **Not run** (no API key; ~200 billed calls). Benchmarked against the same human labels if run.
- **AI in Health Research tab:** both demos, with "prediction ≠ causation" framing, calibration, a subgroup fairness forest plot, a SHAP chart with a "why SHAP ≠ causal effect" panel, publication counts, rule tables, and an "awaiting human labels" benchmark panel (no simulated numbers).
- Tests: `test-ai.R` (kappa vs hand calculation; weighted AUROC = pROC with unit weights; template is blind and has 200 rows; SHAP not NA); vitest E-value tests; data-contract test generalized.

### Results (test set 2015–2018, n = 5,465, 223 cases)
- Logistic regression AUROC 0.737 (0.71–0.76), calibration slope 0.86; xgboost AUROC 0.728 (0.70–0.76), slope 0.93. The complex model does not beat the simple one.
- SHAP: age ≫ sex > race/ethnicity ≫ the rest; ever-use of cannabis ranks 9 of 11.

### Judgment calls
- Temporal rather than random split: it better reflects how a model would be used, and it avoids leakage within survey clusters.
- AUROC CIs use a PSU-cluster bootstrap within strata (not design-based variance formulas). Subgroup AUROCs are shown only with ≥10 cases.
- The triage validation sample is stratified by *predicted* design so rare designs are represented. This over-samples rare classes, so kappa describes performance on this sample, not the corpus mix.
- 1,126 PubMed hits vs 1,115 parsed records: the 11 missing are non-`PubmedArticle` records (e.g. book chapters).

### For you to do
- Label `data/labels/validation_template.csv` following `docs/labeling_guide.md`, save it as `data/labels/validation_labels.csv`, then run `make analysis`.
- Optional: put `NCBI_EMAIL` (and `ANTHROPIC_API_KEY` if you want the LLM comparison) in `.env`.
