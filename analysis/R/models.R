# Survey-weighted logistic regression grid: cancer history ~ cannabis exposure + covariate blocks.
# Every model: design built on the full pooled sample, analytic sample via subset(), quasibinomial svyglm,
# OR with t-based 95% CI on the model's residual design df.
#
# Outputs (site/public/data):
#   models_grid.json      outcome x exposure x sample x 2^4 covariate sets (specification curve + toggle)
#   models_hpv.json       HPV sensitivity models on their own subsamples (SXQ proxy; measured oral/vaginal HPV)
#   models_dose.json      categorical exposure definitions (days in past 30; joint-year proxy)
source("analysis/R/analysis_vars.R")
source("analysis/R/export_utils.R")

MIN_CELL <- 10  # flag ORs as imprecise when exposed or unexposed cases < 10 (or df < 8)

fit_or <- function(des, keep, outcome, exposure_terms, covars) {
  sub <- subset(des, keep)
  rhs <- paste(c(exposure_terms, covars), collapse = " + ")
  f <- as.formula(paste(outcome, "~", rhs))
  m <- svyglm(f, design = sub, family = quasibinomial())
  cf <- coef(m); se <- sqrt(diag(vcov(m))); df <- m$df.residual
  q <- qt(0.975, df)
  v <- des$variables[keep, ]
  lapply(names(cf)[grepl(paste0("^(", paste(exposure_terms, collapse = "|"), ")"), names(cf))], function(term) {
    list(term = term, or = exp(cf[[term]]), lcl = exp(cf[[term]] - q * se[[term]]),
         ucl = exp(cf[[term]] + q * se[[term]]), log_or = cf[[term]], se = se[[term]], df = df)
  })
}

block_sets <- function(blocks = names(BLOCKS)) {
  sets <- list()
  for (mask in 0:(2^length(blocks) - 1)) {
    on <- blocks[bitwAnd(mask, 2^(seq_along(blocks) - 1)) > 0]
    sets[[length(sets) + 1]] <- on
  }
  sets
}

all_covars <- unlist(BLOCKS)

base_keep <- function(v, cycles) {
  k <- v$duq_answered == 1 & v$age >= 20 & v$age <= 59 & v$wt_pooled > 0 & v$cycle %in% cycles
  # complete cases on ALL main-block covariates so the sample is identical across covariate sets
  k <- k & complete.cases(v[, all_covars])
  k[is.na(k)] <- FALSE
  k
}

SAMPLES <- c(main = "All respondents",
             excl_after = "Excluding cases who started using after diagnosis",
             excl_after_same = "Excluding cases who started after or in the same year as diagnosis")

# Age at first diagnosis of a cancer that COUNTS toward each outcome.
DX_AGE <- c(cancer_any = "age_dx_first", cancer_excl_skin = "age_dx_first_nonskin",
            cancer_excl_cervical = "age_dx_first_noncervical",
            cancer_excl_skin_cervical = "age_dx_first_nonskin_noncervical",
            cancer_cervical = "age_dx_cervical")

#' Reverse-causation samples: drop CASES (of this outcome) whose cannabis use began after
#' (or, for excl_after_same, in the same year as) their first diagnosis of a cancer counted by the outcome.
#' Start age = first use (DUQ210) for ever/past-30 exposures; regular-use onset (DUQ213) for regular/heavy.
sample_keep <- function(v, exposure, sample, outcome) {
  if (sample == "main") return(rep(TRUE, nrow(v)))
  age_use <- if (exposure %in% c("x_regular", "x_heavy")) ifelse(v$mj_regular %in% 1, v$mj_age_regular, NA)
             else ifelse(v$mj_ever %in% 1, v$mj_age_first, NA)
  age_dx <- v[[DX_AGE[[outcome]]]]
  case <- v[[outcome]] %in% 1
  known <- case & !is.na(age_use) & !is.na(age_dx)
  drop <- if (sample == "excl_after") known & age_use > age_dx else known & age_use >= age_dx
  !drop
}

run_grid <- function(des) {
  v <- des$variables
  rows <- list()
  sets <- block_sets()
  for (ex in names(EXPOSURES)) for (oc in names(OUTCOMES)) for (sm in names(SAMPLES)) {
    keep <- base_keep(v, EXPOSURE_CYCLES[[ex]]) & !is.na(v[[ex]]) & !is.na(v[[oc]]) & sample_keep(v, ex, sm, oc)
    keep[is.na(keep)] <- FALSE
    y <- v[[oc]][keep]; x <- v[[ex]][keep]
    cells <- c(exp_cases = sum(y == 1 & x == 1), unexp_cases = sum(y == 1 & x == 0),
               exp_n = sum(x == 1), unexp_n = sum(x == 0))
    for (s in sets) {
      covars <- unlist(BLOCKS[s])
      r <- fit_or(des, keep, oc, ex, covars)[[1]]
      flag <- if (min(cells[["exp_cases"]], cells[["unexp_cases"]]) < MIN_CELL || r$df < 8) "imprecise" else "ok"
      rows[[length(rows) + 1]] <- data.frame(
        outcome = oc, exposure = ex, sample = sm,
        blocks = paste(s, collapse = "+"), n_blocks = length(s),
        or = r$or, lcl = r$lcl, ucl = r$ucl, log_or = r$log_or, se = r$se, df = r$df,
        n = sum(keep), cases = sum(y == 1), exp_cases = cells[["exp_cases"]],
        unexp_cases = cells[["unexp_cases"]], exp_n = cells[["exp_n"]], unexp_n = cells[["unexp_n"]],
        flag = flag, stringsAsFactors = FALSE)
    }
    message(sprintf("grid: %s / %s / %s done (n=%d)", ex, oc, sm, sum(keep)))
  }
  do.call(rbind, rows)
}

run_hpv <- function(des) {
  v <- des$variables
  specs <- list(
    list(id = "sxq", label = "Sexual-behavior proxy: lifetime sex partners (SXQ, 2005–2016)",
         cycles = c("D", "E", "F", "G", "H", "I"), extra = "partners_cat", sex = NULL,
         outcomes = c("cancer_any", "cancer_excl_skin", "cancer_excl_cervical")),
    list(id = "oral", label = "Measured oral HPV 16/18 (oral rinse, 2009–2016)",
         cycles = c("F", "G", "H", "I"), extra = "hpv_oral_1618", sex = NULL,
         outcomes = c("cancer_any", "cancer_excl_skin", "cancer_excl_cervical")),
    list(id = "vaginal", label = "Measured vaginal HPV 16/18 (women, 2005–2016)",
         cycles = c("D", "E", "F", "G", "H", "I"), extra = "hpv_vag_1618", sex = "Female",
         outcomes = c("cancer_any", "cancer_excl_skin", "cancer_cervical")))
  rows <- list()
  for (sp in specs) for (oc in sp$outcomes) for (ex in c("x_ever", "x_regular")) {
    cyc <- intersect(sp$cycles, EXPOSURE_CYCLES[[ex]])
    keep <- base_keep(v, cyc) & !is.na(v[[ex]]) & !is.na(v[[oc]]) & !is.na(v[[sp$extra]])
    if (!is.null(sp$sex)) keep <- keep & v$sex == sp$sex
    keep[is.na(keep)] <- FALSE
    y <- v[[oc]][keep]; x <- v[[ex]][keep]
    demo <- if (!is.null(sp$sex)) setdiff(BLOCKS$demo, "sex") else BLOCKS$demo
    sets <- list(crude = character(0), demo = demo,
                 main4 = c(demo, BLOCKS$tobacco, BLOCKS$alcohol, BLOCKS$ses),
                 main4_hpv = c(demo, BLOCKS$tobacco, BLOCKS$alcohol, BLOCKS$ses, sp$extra))
    for (sn in names(sets)) {
      r <- fit_or(des, keep, oc, ex, sets[[sn]])[[1]]
      ec <- sum(y == 1 & x == 1); uc <- sum(y == 1 & x == 0)
      rows[[length(rows) + 1]] <- data.frame(
        subsample = sp$id, subsample_label = sp$label, outcome = oc, exposure = ex, set = sn,
        or = r$or, lcl = r$lcl, ucl = r$ucl, df = r$df, n = sum(keep), cases = sum(y == 1),
        exp_cases = ec, unexp_cases = uc,
        flag = if (min(ec, uc) < MIN_CELL || r$df < 8) "imprecise" else "ok", stringsAsFactors = FALSE)
    }
    message(sprintf("hpv: %s / %s / %s (n=%d)", sp$id, oc, ex, sum(keep)))
  }
  do.call(rbind, rows)
}

run_dose <- function(des) {
  v <- des$variables
  rows <- list()
  defs <- list(mj_days_cat = CYCLES$suffix, mj_jy_cat = c("F", "G", "H", "I", "J"))
  sets <- list(crude = character(0), demo = BLOCKS$demo, demo_tobacco = c(BLOCKS$demo, BLOCKS$tobacco),
               all = unlist(BLOCKS))
  for (ex in names(defs)) for (oc in names(OUTCOMES)) {
    keep <- base_keep(v, defs[[ex]]) & !is.na(v[[ex]]) & !is.na(v[[oc]])
    keep[is.na(keep)] <- FALSE
    lv <- levels(v[[ex]])
    y <- v[[oc]][keep]; x <- v[[ex]][keep]
    for (sn in names(sets)) {
      res <- fit_or(des, keep, oc, ex, sets[[sn]])
      for (r in res) {
        level <- sub(paste0("^", ex), "", r$term)
        rows[[length(rows) + 1]] <- data.frame(
          exposure = ex, outcome = oc, set = sn, level = level, level_order = match(level, lv),
          or = r$or, lcl = r$lcl, ucl = r$ucl, df = r$df, n = sum(keep),
          level_n = sum(x == level), level_cases = sum(x == level & y == 1),
          ref_n = sum(x == lv[1]), ref_cases = sum(x == lv[1] & y == 1),
          flag = if (sum(x == level & y == 1) < MIN_CELL || r$df < 8) "imprecise" else "ok",
          stringsAsFactors = FALSE)
      }
    }
    message(sprintf("dose: %s / %s", ex, oc))
  }
  do.call(rbind, rows)
}

if (sys.nframe() == 0) {
  d <- load_analysis()
  des <- make_design(d)
  t0 <- Sys.time()
  grid <- run_grid(des)
  message("grid fits: ", nrow(grid), " in ", round(difftime(Sys.time(), t0, units = "secs")), "s")
  meta <- list(sample = SAMPLE_PRIMARY, design = DESIGN_NOTE,
               model = "Survey-weighted logistic regression (svyglm, quasibinomial); OR with t-based 95% CI on residual design df",
               analytic_sample_rule = "Complete cases on the exposure, the outcome and ALL covariates in every block, so each exposure/outcome/sample uses the same people across covariate sets",
               flag_rule = sprintf("'imprecise' when exposed or unexposed cases < %d or residual df < 8 (shown greyed, not interpreted)", MIN_CELL),
               blocks = as.list(BLOCK_LABELS), outcomes = as.list(OUTCOMES), exposures = as.list(EXPOSURES),
               samples = as.list(SAMPLES))
  write_site_json(grid, "models_grid.json", meta)
  write_site_json(run_hpv(des), "models_hpv.json", meta[c("design", "model", "flag_rule")])
  write_site_json(run_dose(des), "models_dose.json", meta[c("design", "model", "flag_rule", "outcomes")])
}
