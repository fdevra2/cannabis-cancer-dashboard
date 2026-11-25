# One command rebuilds everything from raw downloads:   make all
# Node is expected at ~/.local/opt/node/bin (override with NODE_BIN=...).
NODE_BIN ?= $(HOME)/.local/opt/node/bin
export PATH := $(NODE_BIN):$(PATH)
R := Rscript

.PHONY: all data harmonize analysis test site-install site-build dev preview clean-derived

all: data harmonize analysis test site-build

data:            ## download NHANES files + codebooks (checksums verified), parse codebooks, fetch literature
	$(R) analysis/R/download.R
	$(R) analysis/R/codebook.R
	$(R) analysis/R/literature_fetch.R

harmonize: data/derived/nhanes_pooled.rds

data/derived/nhanes_pooled.rds: analysis/R/harmonize.R analysis/R/config.R data/raw/MANIFEST.csv
	$(R) analysis/R/harmonize.R

analysis: harmonize   ## all estimates -> site/public/data/*.json
	$(R) analysis/R/prevalence.R
	$(R) analysis/R/models.R
	$(R) analysis/R/evidence_export.R
	$(R) analysis/R/policy.R

test:            ## R validation + unit tests
	$(R) analysis/tests/run_tests.R

site-install:
	cd site && npm ci

site-build: site-install
	cd site && npm run test && npm run build

dev:
	cd site && npm run dev

preview:
	cd site && npm run build && npm run preview

clean-derived:
	rm -rf data/derived
