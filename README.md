# Cannabis & Cancer: What the Evidence Can and Cannot Tell Us

An interactive dashboard on what the cannabis–cancer literature and U.S. survey data can and cannot show, and why: confounding by tobacco and other exposures, reverse causation, crude exposure measurement, and cross-sectional self-report.

*Dev Raj · MS Health Data Science, Dartmouth · independent student project. Not an official Dartmouth site.*

**Live site:** https://fdevra2.github.io/cannabis-cancer-dashboard/

## Headline result

Among U.S. adults aged 20–59 (NHANES 2005–2018), ever using cannabis versus never using it, adjusted for demographics, smoking, alcohol and socioeconomic factors: **OR 1.19 (95% CI 0.96–1.47)** for any self-reported cancer. This is **no clear association after accounting for smoking**. The result depends on how missing income data are handled: coding missing income-to-poverty ratio as its own category gives OR 1.28 (95% CI 1.03–1.59). Unrounded: OR 1.188209943066222, 95% CI 0.960481746440144–1.469932014881263 (n = 20,449; 836 cases; residual df 84). This is a cross-sectional association in survivors; see Methods & Limitations.

## Reproduce

Requirements: R 4.6.1 (packages pinned in `renv.lock`), Node 24 LTS (`.nvmrc`), `make`.

```sh
Rscript -e 'renv::restore()'     # install pinned R packages
make all                          # download → harmonize → estimates → tests → site build
make dev                          # local dev server
```

`make all` downloads public NHANES files from CDC (checksums recorded in `data/raw/MANIFEST.csv`), harmonizes them, runs the design-based analyses, runs the validation tests, and builds the static site into `site/dist/`.

## Checks that run

- `make test`: R tests. These replicate NCHS Data Brief 360 and a *BMJ Open* NHANES paper exactly, check the design (full-sample design + `subset()`), compare harmonized counts with the CDC codebooks, confirm every evidence quote verbatim against its archived source, and test the models, the AI helpers and the policy data.
- `cd site && npm test`: data contracts and E-value math.
- `cd site && node scripts/a11y.mjs`: axe-core WCAG 2.1 AA audit of every tab (light and dark) plus a keyboard-reachability check. It needs the dev server running.

## Human labels for the AI triage demo

Label `data/labels/validation_template.csv` following `docs/labeling_guide.md`, save it as `data/labels/validation_labels.csv`, then run `make analysis`. Optional, and billed: `make llm-triage` with `ANTHROPIC_API_KEY` in `.env`.

## Layout

| Path | What |
|---|---|
| `analysis/R/` | Download, codebook parsing, harmonization, survey design, estimates |
| `analysis/tests/` | Validation tests (e.g. NCHS Data Brief 360 replication), design and data-contract tests |
| `data/raw/` | Downloads (gitignored) + `MANIFEST.csv` |
| `data/evidence.csv` | Literature evidence table (every row has a verified DOI) |
| `docs/` | `methods.md`, `variables.md` (variable availability by cycle) |
| `site/` | Vite + TypeScript + Observable Plot static site |
| `PROGRESS.md` | Build log: what was built, verified, and left unverified |

## Data

NHANES public-use files, 2005–2006 through 2017–2018. The marijuana questions for 2017–March 2020 and 2021–2023 are restricted (Research Data Center only) and are not used. See `docs/methods.md`.

## How to cite

See the Methods & Limitations tab of the site, or `docs/methods.md`.
