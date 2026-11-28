# Methods & Limitations

*Cannabis & Cancer: What the Evidence Can and Cannot Tell Us* is an independent student project by Dev Raj (MS Health Data Science, Dartmouth). It is not an official Dartmouth product. Nothing here is medical advice, and **no estimate on this site is evidence that cannabis causes or prevents cancer.**

## 1. Data sources

### NHANES (survey data)

- **Source:** National Health and Nutrition Examination Survey (NHANES), National Center for Health Statistics (NCHS), public-use files from 2005–2006 through 2017–2018. Each file is downloaded from `wwwn.cdc.gov` and its SHA-256 checksum is recorded in `data/raw/MANIFEST.csv`.
- **Components used:**

  | Topic | Files | Cycles |
  |---|---|---|
  | Demographics | DEMO | all |
  | Drug use | DUQ | all |
  | Smoking | SMQ | all |
  | Medical conditions | MCQ | all |
  | Alcohol | ALQ | all |
  | Health insurance | HIQ | all |
  | Body measures | BMX | all; used only for validation |
  | Sexual behaviour | SXQ | 2005–2016 |
  | Oral-rinse HPV | ORHPV | 2009–2016 |
  | Vaginal-swab HPV DNA | HPVSWR | 2005–2016 |
  | Serum HPV antibodies | HPVSRM | 2005–2006 |

- **Restricted files are not used.**

  | Excluded file | Content | Status on CDC documentation pages |
  |---|---|---|
  | `P_DUQ_R` | Drug use, 2017–March 2020 | "RDC Only … not available publicly" |
  | `DUQ_L_R` | Drug use, 2021–2023 | "RDC Only … not available publicly" |
  | `SXQ_J_R` | Sexual behaviour, 2017–2018 | RDC-only |

- **Marijuana questions stop at age 59.** Several documentation pages describe public drug-use data for ages 18–69. In the public files, however, every participant aged 60–69 is missing DUQ200, which a test confirms. The public marijuana sample is ages 20–59 in 2005–2008 and 18–59 from 2009.
- **Variables by cycle:** see `docs/variables.md`, which is generated from the CDC codebooks. Regular use (DUQ211), age at starting regular use (DUQ213), use frequency (DUQ217) and joints per day (DUQ219) exist only from 2009–2010. E-cigarette items exist only from 2015–2016.

### Published literature (Evidence Map)

- Records are fetched by DOI from Europe PMC: abstracts, plus open-access full text where available. Crossref is the fallback.
- National Academies of Sciences, Engineering, and Medicine (NASEM). *The Health Effects of Cannabis and Cannabinoids* (2017), doi:10.17226/24625. Evidence grades are taken verbatim from the official committee-conclusions PDF.

## 2. NHANES analytic sample

- **Primary sample:** adults aged 20–59 who answered DUQ200 and were examined at the mobile examination center (MEC), pooled over 2005–2018. n = 22,208; 893 report a cancer history.
- People aged 18–19 are excluded because the cancer questions (MCQ) are not asked below age 20.
- **Model sample:** complete cases on the exposure, the outcome and every covariate in all four covariate blocks. For ever-use this is n = 20,449 with 836 cases; 1,685 people are lost to a missing income-to-poverty ratio. The same people are used in every covariate set for a given exposure, outcome and sample, so movement in the odds ratio reflects adjustment rather than a changing sample.

## 3. Survey design and estimation

- **Weights:** MEC examination weights, `WTMEC2YR / 7` for the pooled seven cycles.
- **Variance:** strata `SDMVSTRA` and PSUs `SDMVPSU` (`nest = TRUE`), with Taylor-series linearization in the R `survey` package.
- **Domains:** the design is built on the **full pooled sample** (all 70,190 DEMO participants) and the analytic sample is taken with `subset()`. Filtering first would drop PSUs and strata and misstate variances. A test demonstrates this on a small domain where filtering first leaves single-PSU strata. `survey.lonely.psu = "fail"` makes any lonely PSU an error rather than a silent adjustment.
- **Prevalence** uses Korn–Graubard 95% confidence intervals and the NCHS Data Presentation Standards for Proportions (Parker et al., 2017; criteria as summarized in the NHANES tutorial "Reliability of Estimates"):
  - suppress if the actual or effective n is below 30;
  - suppress if the absolute CI width is 30 points or more;
  - suppress if the CI width is between 5 and 30 points and the relative CI width exceeds 130%;
  - flag for review if the degrees of freedom are below 8 (subgroup df = PSUs − strata with observations) or there are no events.
- **Regression:** survey-weighted logistic regression (`svyglm`, quasibinomial). Odds ratios have t-based 95% CIs on the model's residual design degrees of freedom. Cancer history affects about 5% of the sample, so ORs approximate prevalence ratios. ORs are flagged "imprecise" when exposed or unexposed cases number fewer than 10, or the df is below 8. NCHS has no presentation standard for ORs, so this rule is ours.

## 4. Variable definitions

**Exposure definitions (each compared with never-users):**

| Definition | Coding | Cycles |
|---|---|---|
| Ever used | DUQ200 = yes | all |
| Regular use | DUQ211: used at least monthly for ≥1 year | 2009–2018 |
| Past 30 days | DUQ220Q/U: last use ≤30 days ago | all |
| ≥20 joint-years (crude proxy) | see below | 2009–2018 |

The joint-year proxy is calculated as frequency × amount × duration:
* **Frequency:** the midpoint of the DUQ217 frequency category, converted to times per day.
* **Amount:** DUQ219 joints or pipes per day; "6 or more" is counted as 6.
* **Duration:** years of regular use, from DUQ213 to the time since regular use stopped (DUQ215).

This is unvalidated and is **not** the Cannabis Exposure Index (CEI).

Two sets of joint-year cut-offs are shown:
- **Data-driven:** <5, 5–19.9 and ≥20 joint-years, chosen from the distribution among regular users in this sample (median 6.3). These are not from the literature.
- **Literature-based:** ≥1 joint-year (the "ever use" definition in Ghasemiesfe et al. 2019, doi:10.1001/jamanetworkopen.2019.16318) and ≥10 joint-years (a category used by Zhang et al. 2015, doi:10.1002/ijc.29036).

**Dose categories:**
- **Days used in the past 30:** DUQ230 is asked only if last use was ≤30 days ago, so others are coded 0. Categories are never, not in the past 30 days, 1–19 days, and 20–30 days.
- **Joint-years:** never; ever but never regular; regular use with <5, 5–19.9 or ≥20 joint-years.

**Outcomes:** MCQ220, "ever told by a doctor you had cancer or a malignancy", in four versions:
- any cancer;
- excluding non-melanoma skin cancer (MCQ230 codes 32 and 33, the latter being skin cancer of unknown kind);
- excluding cervical cancer (code 15);
- excluding both.

A person whose only reported cancers fall in the excluded types is counted as a non-case. Cases whose cancer type is unknown remain cases.

**Covariate blocks:**

| Block | Variables |
|---|---|
| Demographics | Age and age² (centred), sex, race and Hispanic origin (RIDRETH1), survey cycle |
| Tobacco | Never / former (≥100 lifetime cigarettes, not smoking now) / current cigarette smoking |
| Alcohol | None in the past year / moderate (≤7 drinks a week for women, ≤14 for men) / heavy |
| Socioeconomic | Education (4 levels), income-to-poverty ratio (<1, 1–<2, 2–<4, ≥4), any health insurance |

Alcohol is built from ALQ120Q/U × ALQ130 for 2005–2016 and from ALQ121 category midpoints × ALQ130 for 2017–2018.

Refused and don't-know codes are removed using each cycle's own codebook, because the codes differ between cycles.

**HPV sensitivity measures** (each on its own subsample):
- lifetime number of sex partners (SXQ, 2005–2016);
- oral HPV 16/18 DNA (ORHPV, 2009–2016);
- vaginal HPV 16/18 DNA in women (HPVSWR, 2005–2016).

## 5. Headline result

<!-- HEADLINE:START (generated by analysis/R/headline.R from the model outputs; do not edit by hand) -->

**Headline.** Among U.S. adults aged 20–59 (NHANES 2005–2018), ever-use of cannabis shows a modest association with self-reported cancer (OR ~1.2–1.3) that is attenuated by smoking adjustment and not robust across analytic choices.

- Complete case (main analysis; n = 20,449, 836 cases): OR 1.19 (95% CI 0.96–1.47); E-value 1.66 (CI bound 1.00)
- Multiple imputation (m = 20; n = 22,195, 893 cases): OR 1.28 (95% CI 1.03–1.58); E-value 1.87 (CI bound 1.22)
- Missing-indicator category for income (n = 22,119, 890 cases): OR 1.28 (95% CI 1.03–1.59); E-value 1.88 (CI bound 1.22)
- Before smoking adjustment (demographics only): OR 1.32 (95% CI 1.07–1.62)
- Across all 192 specifications for any cancer, ORs range 0.98–1.90 and 74 of 192 confidence intervals exclude 1.

All models: ever-use vs never-use, any self-reported cancer, adjusted for demographics, smoking, alcohol and socioeconomic factors (except the demographics-only line). E-values treat the OR as a risk ratio (cancer history ≈5%).

<!-- HEADLINE:END -->

**Handling missing covariate data.** Three approaches are reported side by side:

- **Complete case (main analysis):** people with any missing covariate are excluded (n = 20,449 for ever-use; mostly the 1,685 with a missing income-to-poverty ratio).
- **Missing-indicator category:** income-to-poverty ratio coded with an extra "Missing" level, so those people are kept. **This method can give biased estimates when the variable with missing values is a confounder**, as it is here: the indicator does not recover the confounder's value for those people, so the adjustment is incomplete for them. It is shown as a sensitivity check only.
- **Multiple imputation (MI):** chained equations (R `mice`), m = 20 independent chains, 10 iterations each.
  - Imputed: income-to-poverty ratio (predictive mean matching), education, alcohol, smoking status (polytomous regression) and health insurance (logistic regression).
  - Predictors: the outcome, ever-use, age, sex, race/ethnicity, survey cycle and the **survey design** (log MEC weight for every variable; survey stratum for income, where cycle is dropped because strata are nested within cycles).
  - In each completed dataset, the design is rebuilt on the full pooled sample, the analytic sample is taken with `subset()`, and the same survey-weighted logistic models are fitted.
  - Estimates are pooled with Rubin's rules (`mitools::MIcombine`, Barnard–Rubin degrees of freedom).
  - MI assumes data are missing at random given these variables; that cannot be checked from the data.

The MI and missing-indicator estimates are close to each other and higher than the complete-case estimate. Both keep the 1,670 people with missing income (whose cancer and cannabis profiles differ), so the difference from complete case reflects **who is included** more than how income is adjusted for. The between-imputation variance of the cannabis coefficient is very small relative to the within-imputation variance (the ratio is reported in `models_mi.json`).

## 6. Analyses

- **Confounding toggle and specification curve:** 768 models, covering 4 outcomes × 4 exposure definitions × 3 samples × 16 covariate sets (all subsets of the 4 blocks). The specification curve follows Simonsohn, Simmons & Nelson (2020) descriptively; their joint permutation test is not performed.
- **Reverse-causation lens:**
  - Compares age at first use (DUQ210) with age at first diagnosis of a cancer that counts toward the outcome. For regular use and the joint-year proxy it uses age at starting regular use (DUQ213).
  - Ages are recorded in whole years, so "same year" cannot be ordered.
  - Models are re-estimated excluding cases who started after diagnosis, or after or in the same year.
  - Current use is also described by years since diagnosis.
- **E-value** (VanderWeele & Ding, 2017): E = RR + √(RR × (RR − 1)), with RR < 1 inverted. Odds ratios are treated as risk ratios when the outcome is rare, and converted as RR ≈ √OR when it is common.

## 7. Validation

- **NCHS Data Brief 360** (Hales et al., 2020): crude obesity prevalence among adults aged 20+ in 2017–2018, excluding pregnant women and using MEC weights. Published: 42.5% overall, 43.0% men, 42.1% women, and 40.0%, 44.8% and 42.8% by age group. Our code reproduces every figure exactly at one decimal (test).
- **Mitchell, Bhatia & Zebardast, *BMJ Open* 2020** (doi:10.1136/bmjopen-2020-037905): lifetime marijuana use by cycle, 2005–2018. All seven estimates match at one decimal and all Ns match exactly (test).
- **Headline consistency** (test): the headline block in README, this document and PROGRESS.md is regenerated from all three estimates (complete case, multiple imputation, missing-indicator) and must match each document exactly; the site reads the same text from `headline.json`.
- **Evidence table checks** (test):
  - every row has a fetched DOI;
  - every verified row's quoted sentence appears verbatim in the archived source text, and contains the estimate and both CI limits;
  - NASEM wording matches the official PDF.

## 8. Limitations

1. **Cross-sectional, self-reported data.** Cannabis use and cancer history come from one interview. Timing is reconstructed from recalled ages, and use is under-reported to an unknown degree.
2. **Survivorship and participation bias.** NHANES includes only people alive, living in the community and able to attend the exam. Fatal cancers such as lung are under-represented, and "cancer history" mostly reflects survivors of less lethal cancers. If cannabis use is related to survival or participation, the estimates can be biased in either direction (collider bias).
3. **Age range.** The public marijuana data stop at 59, so most cancers occur after the observation window. The cancers in this sample (cervical, skin, breast, thyroid, testicular) are not the sites the cannabis literature focuses on (lung, head and neck).
4. **Too few cases for site-specific analysis.** About 900 cancers spread over 30+ sites. Site-specific evidence comes only from the published literature.
5. **Residual confounding.**
   - Tobacco is adjusted as smoking status only, with no pack-years, cigars or other combustibles. E-cigarette data exist only for 2015–2018 and are not used.
   - Alcohol categories changed in 2017–2018.
   - HPV is measured imperfectly: a single DNA test reflects current infection, not the past infection behind a diagnosed cancer.
   - Diet, occupational exposures, family history and cancer screening are not modelled.
6. **Crude exposure measurement.** There is no information on potency, route (smoked or edible), product type or mg THC. Lifetime exposure is approximated, and the joint-year proxy uses category midpoints and an arbitrary cap.
7. **Reverse causation is only partly addressed.** First-use timing cannot detect people who resumed or increased use after diagnosis.
8. **Missing data.** The main analysis is complete case; the income-to-poverty ratio is the main source of missingness (≈8%). Multiple imputation and a missing-indicator sensitivity model both keep people with missing income and give larger ORs whose CIs exclude 1 (see the headline above and NHANES Explorer → Missing data). The headline is therefore stated as not robust to this analytic choice. MI assumes missing at random; the missing-indicator method can be biased for confounders.
9. **Cervical cancer self-report.** Self-reported "cervical cancer" may include treated pre-cancerous lesions. This has not been verified within this project, so results excluding cervical cancer are shown alongside.
10. **Multiple comparisons.** Hundreds of models are shown on purpose, to display variability. No single model should be singled out because its CI excludes 1.
11. **Literature map ≠ meta-analysis.** Published estimates differ in exposure definition, comparison group, effect measure, population and adjustment. NASEM grades date from 2017; later studies have not been graded by NASEM.
12. **Ecological context.** The Policy Context tab is descriptive. Changes in laws or potency over time cannot be linked to cancer in these data. Potency figures come from DEA-seized illicit herbal cannabis and **do not represent products sold in state-legal markets**. Law years are as listed by NCSL (year of the statute or ballot measure, not the effective date); "medical use law" means a comprehensive program by NCSL's definition, so low-THC/CBD-only programs are not counted (e.g. Georgia counts from SB 220, 2026, which converted its low-THC oil program).
13. **Evidence-table exclusions.** Gallagher et al. 2024 (*JAMA Otolaryngol Head Neck Surg*) has a published "Error in Abstract" correction whose text could not be retrieved, so its four estimates are marked UNVERIFIED and are not shown. Direction labels in the Evidence Map ("positive association", "inverse association", "no clear association") describe confidence intervals, not causal effects.

## 9. Reproduce

```sh
git clone <repo> && cd cannabis-cancer-dashboard
Rscript -e 'renv::restore()'   # R 4.6.1; package versions pinned in renv.lock
make all                        # download → codebooks → literature → harmonize → models → tests → site build
make dev                        # local preview
```

Node 24 LTS is pinned in `site/.nvmrc` and npm packages in `site/package-lock.json`.

Core R packages: survey 4.5, haven 2.5.5, dplyr 1.2.1, jsonlite 2.0.0, xml2 1.6.0, testthat 3.3.2.

Front end: Vite 8.1.7, TypeScript 6.0.3, Observable Plot 0.6.19, d3 7.9.2.

## 10. How to cite

> Raj D. *Cannabis & Cancer: What the Evidence Can and Cannot Tell Us* [interactive dashboard]. Independent student project, MS Health Data Science, Dartmouth; 2026. Data: CDC/NCHS NHANES 2005–2018 public-use files.

Please also cite NHANES and the original studies shown in the Evidence Map.

## 11. Methods references

- Hales CM, Carroll MD, Fryar CD, Ogden CL. Prevalence of obesity and severe obesity among adults: United States, 2017–2018. NCHS Data Brief No. 360. 2020.
- Mitchell W, Bhatia R, Zebardast N. Retrospective cross-sectional analysis of the changes in marijuana use in the USA, 2005–2018. *BMJ Open*. 2020;10:e037905. doi:10.1136/bmjopen-2020-037905
- Parker JD, Talih M, Malec DJ, et al. National Center for Health Statistics Data Presentation Standards for Proportions. *Vital Health Stat 2*. 2017;(175).
- Simonsohn U, Simmons JP, Nelson LD. Specification curve analysis. *Nat Hum Behav*. 2020;4(11):1208–1214. doi:10.1038/s41562-020-0912-z
- VanderWeele TJ, Ding P. Sensitivity analysis in observational research: introducing the E-value. *Ann Intern Med*. 2017;167(4):268–274. doi:10.7326/M16-2607
- National Academies of Sciences, Engineering, and Medicine. *The Health Effects of Cannabis and Cannabinoids*. Washington, DC: The National Academies Press; 2017. doi:10.17226/24625
