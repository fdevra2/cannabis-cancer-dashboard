# Cannabis & Cancer: What the Evidence Can and Cannot Tell Us

An interactive dashboard on what the cannabis–cancer literature and U.S. survey data can and cannot show, and why: confounding by tobacco and other exposures, reverse causation, crude exposure measurement, and cross-sectional self-report.

*Dev Raj · MS Health Data Science, Dartmouth · independent student project. Not an official Dartmouth site.*

## Reproduce

Requirements: R 4.6.1 (packages pinned in `renv.lock`), Node 24 LTS (`.nvmrc`), `make`.

```sh
Rscript -e 'renv::restore()'     # install pinned R packages
make all                          # download → harmonize → estimates → tests → site build
make dev                          # local dev server
```

`make all` downloads public NHANES files from CDC (checksums recorded in `data/raw/MANIFEST.csv`), harmonizes them, runs the design-based analyses, runs the validation tests, and builds the static site into `site/dist/`.

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
