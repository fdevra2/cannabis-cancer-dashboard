# CLAUDE.md — Cannabis & Cancer: What the Evidence Can and Cannot Tell Us

Byline: “Dev Raj · MS Health Data Science, Dartmouth · independent student project”. **Independent student project: do not name any lab or imply affiliation. Not an official Dartmouth site; no Dartmouth logos or branding.**

## Non-negotiable rules
1. **Never invent data, effect sizes, or citations.** Every number shown must trace to (a) a file in `data/raw` with a documented source URL (see `data/raw/MANIFEST.csv`), or (b) a published paper with a DOI that was fetched and checked. Anything unverifiable is marked `UNVERIFIED` in `data/evidence.csv` and is kept off the site.
2. **Causal language:** "associated with", not "causes", unless the evidence grade justifies more.
3. **NHANES is design-based:** MEC weights (`WTMEC2YR`, divided by the number of pooled cycles), strata `SDMVSTRA`, PSU `SDMVPSU`, `nest = TRUE`, Taylor linearization. Report weighted estimates with 95% CIs and unweighted n. Apply NCHS Data Presentation Standards for Proportions (Parker et al. 2017; Korn–Graubard CIs) and suppress unreliable estimates.
   - **Build the design on the FULL pooled sample, then `subset()`** for the analytic sample. Never filter the data frame before `svydesign()`. (Enforced by `analysis/tests/testthat/test-design.R`.)
4. **Public data only.** DUQ public cycles: 2005–2006 (D) through 2017–2018 (J). `P_DUQ_R` and `DUQ_L_R` are RDC-only. `SXQ_J_R` is RDC-only. Marijuana items are answered only by ages ≤59 in public files (20–59 in D–E, 18–59 in F–J).
5. **Reproducible:** `make all` rebuilds everything from raw downloads. R packages pinned with `renv`; Node pinned via `.nvmrc` + `package-lock.json`.
6. **Accessible:** colorblind-safe palette, keyboard navigable, alt text, readable on a laptop projector.

## Additions (approved)
- Measured HPV (oral rinse ORHPV 2009–2016; vaginal swab HPVSWR 2005–2016, women; serum HPVSRM 2005–2006) as a **sensitivity block on its own subsample**; SXQ (sexual behavior) is the broader proxy.
- **Survivorship bias** (only people alive and well enough to attend the MEC are captured; fatal cancers such as lung are under-represented) must appear in Methods/Limitations and in the NHANES Explorer caption.
- Sensitivity outcomes: any cancer; excluding non-melanoma skin; excluding cervical. All shown in the toggle.
- The 2^k covariate grid is presented as a **specification curve** (Simonsohn, Simmons & Nelson); the toggle is the interactive view of the same results.
- PubMed E-utilities: `tool=cannabis-cancer-dashboard`, `email` from `NCBI_EMAIL` in `.env` (gitignored). ≤3 requests/second without an API key.
- Evidence table also checks recent meta-analyses (2025 oral cancer, J Ethn Subst Abuse; 2025 testicular GCT; 2026 lung, Karimi et al.). Verify DOI + numbers or mark UNVERIFIED.
- Validation tests are written only after the published figure AND the published sample definition are confirmed verbatim.

## Layout
- `analysis/R/` — pipeline (`config.R`, `download.R`, `codebook.R`, `harmonize.R`, `design.R`, analysis + export scripts)
- `analysis/tests/testthat/` — R tests
- `data/raw/` — downloads (XPT/HTML gitignored; `MANIFEST.csv` committed)
- `data/derived/` — harmonized data (gitignored)
- `data/evidence.csv` — literature evidence table
- `site/` — Vite + TypeScript + Observable Plot front end; `site/public/data/*.json` are committed pipeline outputs
- `docs/` — methods, variable availability
- `PROGRESS.md` — phase log (what was built / verified / UNVERIFIED / judgment calls)

## Conventions
- Run R from the project root (`Rscript analysis/R/<script>.R`).
- Node lives at `~/.local/opt/node/bin` (not on the default PATH); the Makefile sets PATH.
- Never commit `.env`, raw XPT files, or derived microdata.
