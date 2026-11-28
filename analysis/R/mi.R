# Multiple imputation (MI) of missing covariates, with survey-weighted models pooled by Rubin's rules.
#
# Imputed (analytic population: DUQ answered, ages 20-59, MEC-examined, outcome known):
#   income-to-poverty ratio (continuous, predictive mean matching), education, alcohol category,
#   smoking status (polytomous regression), health insurance (logistic regression).
# Imputation-model predictors: outcome (any cancer; cancer excl. skin & cervical), exposure (ever use),
#   age, sex, race/ethnicity, survey cycle, and the survey design: log MEC weight (all variables) and
#   stratum SDMVSTRA (income-to-poverty ratio). Categorical variables with very few missing values use log
#   weight + cycle rather than the 105-level stratum factor.
# Each completed dataset is merged back into the FULL pooled file, the design is rebuilt on the full sample
# (make_design), the analytic sample is taken with subset(), and svyglm is fitted. Estimates are pooled with
# mitools::MIcombine (Rubin's rules; Barnard-Rubin df using the complete-data residual design df).
# Output: site/public/data/models_mi.json
source("analysis/R/analysis_vars.R")
source("analysis/R/models.R")
source("analysis/R/export_utils.R")
suppressMessages({ library(mice); library(mitools) })

M <- 20; MAXIT <- 10; SEED <- 20261125
d <- load_analysis()
ana <- d$duq_answered == 1 & d$age >= 20 & d$age <= 59 & d$WTMEC2YR > 0 & !is.na(d$cancer_any)
ana[is.na(ana)] <- FALSE

imp_vars <- c("pir", "educ", "alc_cat", "smk_status", "insured")
x <- d[ana, c("cancer_any", "cancer_excl_skin_cervical", "mj_ever", "age", "sex", "race", "cycle_f", imp_vars,
              "WTMEC2YR", "SDMVSTRA")]
x$insured <- factor(x$insured, levels = c(0, 1), labels = c("No", "Yes"))
x$mj_ever <- factor(x$mj_ever); x$cancer_any <- factor(x$cancer_any)
x$cancer_excl_skin_cervical <- factor(x$cancer_excl_skin_cervical)
x$log_wt <- log(x$WTMEC2YR); x$WTMEC2YR <- NULL
x$stratum <- factor(x$SDMVSTRA); x$SDMVSTRA <- NULL
miss_before <- vapply(imp_vars, function(v) sum(is.na(x[[v]])), 0L)

meth <- make.method(x)
meth[setdiff(names(meth), imp_vars)] <- ""
meth["pir"] <- "pmm"; meth["educ"] <- "polyreg"; meth["alc_cat"] <- "polyreg"
meth["smk_status"] <- "polyreg"; meth["insured"] <- "logreg"
pred <- make.predictorMatrix(x)
pred[, ] <- 0
base_pred <- c("cancer_any", "cancer_excl_skin_cervical", "mj_ever", "age", "sex", "race", "cycle_f", "log_wt", imp_vars)
for (v in imp_vars) pred[v, setdiff(base_pred, v)] <- 1
# The categorical covariates have <0.2% missing (7-42 values); a compact predictor set (outcome, exposure,
# demographics, cycle, log weight) keeps their multinomial models fast without affecting the income model.
small <- c("cancer_any", "cancer_excl_skin_cervical", "mj_ever", "age", "sex", "race", "cycle_f", "log_wt")
for (v in c("educ", "alc_cat", "smk_status", "insured")) { pred[v, ] <- 0; pred[v, small] <- 1 }
pred["pir", "stratum"] <- 1   # design stratum in the income model (the variable with substantial missingness)
pred["pir", "cycle_f"] <- 0   # strata are nested within survey cycles: keep stratum, drop cycle (avoids collinearity)

# Run the M imputations as M independent single-dataset chains (seed SEED + k); each one
# completes its dataset, rebuilds the full-sample design and fits the models. Results are deterministic.
full_cov <- unlist(BLOCKS)
drop_derived <- c("age2", "age_grp", "cycle_f", "pir_cat", "pir_cat_m", "smk_ever", "smk_current", "mj_daily",
  "couse_current", "couse_ever", "mj_ever_f", "x_ever", "x_regular", "x_past30", "x_heavy", "mj_days_cat",
  "mj_jy_cat", "mj_jy_lit_cat", "first_use_timing", "regular_timing", "years_since_dx", "ysd_cat")
one_imputation <- function(k) {
  imp <- mice(x, m = 1, maxit = MAXIT, method = meth, predictorMatrix = pred, seed = SEED + k, printFlag = FALSE)
  ck <- complete(imp, 1)
  dk <- d
  dk$pir[ana] <- ck$pir
  dk$educ[ana] <- ck$educ
  dk$alc_cat[ana] <- ck$alc_cat
  dk$smk_status[ana] <- ck$smk_status
  dk$insured[ana] <- as.integer(ck$insured == "Yes")
  dk <- add_analysis_vars(dk[, setdiff(names(dk), drop_derived)])
  des <- make_design(dk)
  v <- des$variables
  res <- list()
  for (ex in names(EXPOSURES)) for (oc in names(OUTCOMES)) {
    keep <- v$duq_answered == 1 & v$age >= 20 & v$age <= 59 & v$wt_pooled > 0 & v$cycle %in% EXPOSURE_CYCLES[[ex]] &
      !is.na(v[[ex]]) & !is.na(v[[oc]]) & complete.cases(v[, full_cov])
    keep[is.na(keep)] <- FALSE
    r <- fit_or(des, keep, oc, ex, full_cov)[[1]]
    y <- v[[oc]][keep]; xx <- v[[ex]][keep]
    res[[paste(ex, oc)]] <- list(coef = r$log_or, var = r$se^2, df = r$df, n = sum(keep), cases = sum(y == 1), exp_cases = sum(y == 1 & xx == 1))
  }
  list(fits = res, logged = NROW(imp$loggedEvents),
       pir_imputed_mean = mean(ck$pir[is.na(x$pir)]), pir_observed_mean = mean(x$pir, na.rm = TRUE))
}
t0 <- Sys.time()
# Serial on purpose: forked workers were far slower on this machine (multithreaded BLAS contention / memory).
out_k <- lapply(seq_len(M), function(k) { r <- one_imputation(k); message("imputation ", k, "/", M, " done"); r })
bad <- vapply(out_k, function(o) inherits(o, "try-error") || is.null(o$fits), TRUE)
if (any(bad)) stop("Imputation worker failed: ", paste(which(bad), collapse = ", "), "\n", paste(out_k[bad], collapse = "\n"))
fits <- lapply(out_k, `[[`, "fits")
message("MI: ", M, " imputations fitted in ", round(difftime(Sys.time(), t0, units = "secs")), "s")
imp <- list(loggedEvents = seq_len(sum(vapply(out_k, `[[`, 0, "logged"))))
pir_check <- c(imputed_mean = mean(vapply(out_k, `[[`, 0, "pir_imputed_mean")), observed_mean = out_k[[1]]$pir_observed_mean)

rows <- list()
for (key in names(fits[[1]])) {
  co <- lapply(fits, function(f) c(b = f[[key]]$coef)); va <- lapply(fits, function(f) matrix(f[[key]]$var, 1, 1))
  pooled <- MIcombine(results = co, variances = va, df.complete = fits[[1]][[key]]$df)
  b <- unname(coef(pooled)); se <- sqrt(unname(diag(vcov(pooled)))); dfp <- unname(pooled$df)
  within <- mean(vapply(va, function(m) m[1, 1], 0)); between <- var(vapply(co, function(z) z[[1]], 0))
  q <- qt(0.975, dfp)
  ex <- strsplit(key, " ")[[1]][1]; oc <- strsplit(key, " ")[[1]][2]
  rows[[key]] <- data.frame(exposure = ex, outcome = oc, approach = "multiple_imputation",
    or = exp(b), lcl = exp(b - q * se), ucl = exp(b + q * se), log_or = b, se = se, df = dfp,
    fmi = unname(pooled$missinfo), between_within_ratio = between / within, m = M,
    n = fits[[1]][[key]]$n, cases = fits[[1]][[key]]$cases, exp_cases = fits[[1]][[key]]$exp_cases, stringsAsFactors = FALSE)
}
out <- do.call(rbind, rows); rownames(out) <- NULL

write_site_json(out, "models_mi.json", list(
  method = sprintf("Multiple imputation by chained equations (mice %s; m = %d independent chains, maxit = %d, seeds %d + k). pmm for income-to-poverty ratio; polyreg for education, alcohol, smoking status; logreg for insurance. Predictors: outcome, ever-use, age, sex, race/ethnicity, survey cycle, log MEC weight, and (for income) survey stratum. Survey-weighted logistic models (design built on the full pooled sample, subset() to the analytic sample) fitted in each completed dataset and pooled with mitools::MIcombine (Rubin's rules; Barnard-Rubin degrees of freedom).",
    as.character(packageVersion("mice")), M, MAXIT, SEED),
  missing_before_imputation = as.list(miss_before),
  analytic_population = "DUQ answered, ages 20-59, MEC-examined, cancer history known",
  logged_events = NROW(imp$loggedEvents),
  pir_mean_observed_vs_imputed = as.list(pir_check),
  chains = "Each imputation is an independent single-dataset chain with seed SEED + k (k = 1..m)."))
h <- out[out$exposure == "x_ever" & out$outcome == "cancer_any", ]
message(sprintf("MI headline: OR %.4f (%.4f-%.4f), df %.1f, fmi %.3f", h$or, h$lcl, h$ucl, h$df, h$fmi))
