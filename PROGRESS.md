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
