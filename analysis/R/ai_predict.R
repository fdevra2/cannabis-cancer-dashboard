# Predictive-model demo (demo a): who reports a cancer history? Prediction, NOT causation.
# Logistic regression vs gradient boosting (xgboost) on NHANES features; temporal validation:
# train on 2005-2014 (cycles D-H), test on 2015-2018 (I-J). MEC weights used in fitting and in all metrics.
# Outputs: site/public/data/ai_predict.json
source("analysis/R/analysis_vars.R")
source("analysis/R/export_utils.R")
source("analysis/R/ai_utils.R")
suppressMessages({ library(xgboost) })
set.seed(20261125)

d <- load_analysis()
FEATURES <- c("age", "sex", "race", "educ", "pir_cat", "insured", "smk_status", "alc_cat", "bmi", "mj_ever", "mj_past30")
FEATURE_LABELS <- c(age = "Age", sex = "Sex", race = "Race/ethnicity", educ = "Education", pir_cat = "Income-to-poverty ratio",
                    insured = "Health insurance", smk_status = "Cigarette smoking", alc_cat = "Alcohol use", bmi = "Body mass index",
                    mj_ever = "Ever used cannabis", mj_past30 = "Cannabis in past 30 days")
a <- d[d$duq_answered == 1 & d$age >= 20 & d$age <= 59 & d$WTMEC2YR > 0, c("SEQN", "cycle", "WTMEC2YR", "SDMVSTRA", "SDMVPSU", "cancer_any", FEATURES)]
a <- a[complete.cases(a), ]
a$w <- a$WTMEC2YR / mean(a$WTMEC2YR)
train <- a[a$cycle %in% c("D", "E", "F", "G", "H"), ]
test <- a[a$cycle %in% c("I", "J"), ]
message(sprintf("train n=%d (cases %d); test n=%d (cases %d)", nrow(train), sum(train$cancer_any), nrow(test), sum(test$cancer_any)))

fml <- as.formula(paste("cancer_any ~", paste(FEATURES, collapse = " + ")))
# ---- Logistic regression (weighted) ----
lr <- suppressWarnings(glm(fml, data = train, family = quasibinomial(), weights = w))
p_lr <- predict(lr, newdata = test, type = "response")

# ---- Gradient boosting (xgboost), weighted; nrounds by 5-fold CV on training data ----
mm <- function(df) model.matrix(as.formula(paste("~", paste(FEATURES, collapse = " + "))), data = df)[, -1]
Xtr <- mm(train); Xte <- mm(test)
dtr <- xgb.DMatrix(Xtr, label = train$cancer_any, weight = train$w)
params <- list(objective = "binary:logistic", eval_metric = "logloss", eta = 0.03, max_depth = 3, subsample = 0.8,
               colsample_bytree = 0.8, min_child_weight = 5, nthread = 1)
cv <- xgb.cv(params = params, data = dtr, nrounds = 1500, nfold = 5, early_stopping_rounds = 50, verbose = 0)
best <- cv$early_stop$best_iteration %||% cv$best_iteration
gb <- xgb.train(params = params, data = dtr, nrounds = best, verbose = 0)
p_gb <- predict(gb, xgb.DMatrix(Xte))

# ---- Weighted metrics ----
cal <- function(p, y, w, bins = 10) {
  q <- cut(p, unique(quantile(p, seq(0, 1, length.out = bins + 1))), include.lowest = TRUE)
  do.call(rbind, lapply(split(seq_along(p), q), function(i)
    data.frame(pred = weighted.mean(p[i], w[i]), obs = weighted.mean(y[i], w[i]), n = length(i))))
}
cal_slope <- function(p, y, w) {
  lp <- qlogis(pmin(pmax(p, 1e-6), 1 - 1e-6))
  cf <- coef(suppressWarnings(glm(y ~ lp, family = quasibinomial(), weights = w)))
  citl <- coef(suppressWarnings(glm(y ~ offset(lp), family = quasibinomial(), weights = w)))[1]
  c(slope = unname(cf[2]), intercept_in_large = unname(citl))
}
brier <- function(p, y, w) weighted.mean((p - y)^2, w)

# Cluster bootstrap over PSUs (within strata) for AUROC CIs
boot_auc <- function(p, y, w, df, B = 300) {
  cl <- paste(df$SDMVSTRA, df$SDMVPSU); ucl <- unique(cl); st <- df$SDMVSTRA[match(ucl, cl)]
  idx_by <- split(seq_along(cl), cl)
  replicate(B, {
    pick <- unlist(lapply(split(ucl, st), function(u) sample(u, length(u), replace = TRUE)))
    i <- unlist(idx_by[pick], use.names = FALSE)
    wauc(p[i], y[i], w[i])
  })
}
y <- test$cancer_any; w <- test$w
models <- list(`Logistic regression` = p_lr, `Gradient boosting (xgboost)` = p_gb)
perf <- do.call(rbind, lapply(names(models), function(m) {
  p <- models[[m]]; b <- boot_auc(p, y, w, test); cs <- cal_slope(p, y, w)
  data.frame(model = m, auroc = wauc(p, y, w), auroc_lcl = quantile(b, 0.025), auroc_ucl = quantile(b, 0.975),
             brier = brier(p, y, w), cal_slope = cs[["slope"]], cal_intercept = cs[["intercept_in_large"]],
             mean_pred = weighted.mean(p, w), obs_rate = weighted.mean(y, w), row.names = NULL)
}))
calib <- do.call(rbind, lapply(names(models), function(m) cbind(model = m, cal(models[[m]], y, w))))

# Subgroup performance (fairness): AUROC and calibration-in-the-large by sex, race, age group
test$age_grp <- cut(test$age, c(19, 39, 49, 59), labels = c("20–39", "40–49", "50–59"))
subs <- list(Sex = "sex", `Race/ethnicity` = "race", `Age group` = "age_grp")
sub <- do.call(rbind, lapply(names(subs), function(sv) do.call(rbind, lapply(levels(factor(test[[subs[[sv]]]])), function(lv) {
  i <- which(test[[subs[[sv]]]] == lv)
  do.call(rbind, lapply(names(models), function(m) {
    p <- models[[m]][i]; ok <- sum(y[i]) >= 10
    b <- if (ok) boot_auc(p, y[i], w[i], test[i, ], B = 200) else NA
    data.frame(dimension = sv, group = lv, model = m, n = length(i), cases = sum(y[i]),
               auroc = if (ok) wauc(p, y[i], w[i]) else NA,
               auroc_lcl = if (ok) unname(quantile(b, 0.025, na.rm = TRUE)) else NA, auroc_ucl = if (ok) unname(quantile(b, 0.975, na.rm = TRUE)) else NA,
               pred_rate = weighted.mean(p, w[i]), obs_rate = weighted.mean(y[i], w[i]),
               note = if (ok) "" else "fewer than 10 cases: AUROC not shown")
  }))
}))))

# SHAP (TreeSHAP via xgboost predcontrib), aggregated over one-hot columns to the original feature
contrib <- predict(gb, xgb.DMatrix(Xte), predcontrib = TRUE)
# Columns: features in input order, then the bias term (its name differs across xgboost versions)
stopifnot(ncol(contrib) == ncol(Xte) + 1)
contrib <- contrib[, seq_len(ncol(Xte)), drop = FALSE]
colnames(contrib) <- colnames(Xte)
feat_of <- function(col) FEATURES[which(vapply(FEATURES, function(f) startsWith(col, f), TRUE))[1]]
fmap <- vapply(colnames(contrib), feat_of, "")
stopifnot(!anyNA(fmap))
agg <- sapply(FEATURES, function(f) rowSums(contrib[, fmap == f, drop = FALSE]))
shap <- data.frame(feature = FEATURES, label = FEATURE_LABELS[FEATURES],
                   mean_abs_shap = apply(abs(agg), 2, weighted.mean, w = w), row.names = NULL)
shap <- shap[order(-shap$mean_abs_shap), ]
# Logistic coefficient for ever-use (for contrast) - an adjusted association, still not causal
lr_mj <- data.frame(term = "mj_ever", or = exp(coef(lr)[["mj_ever"]]))

write_site_json(list(performance = perf, calibration = calib, subgroups = sub, shap = shap, lr_mj = lr_mj,
                     sizes = data.frame(split = c("train (2005–2014)", "test (2015–2018)"), n = c(nrow(train), nrow(test)),
                                        cases = c(sum(train$cancer_any), sum(test$cancer_any)))),
  "ai_predict.json", list(
    task = "Predict self-reported cancer history (MCQ220) among NHANES adults 20–59",
    features = as.list(FEATURE_LABELS),
    validation = "Temporal: train 2005–2014, test 2015–2018. MEC weights (normalized) used in fitting and in every metric.",
    xgboost = c(params[c("eta", "max_depth", "subsample", "colsample_bytree", "min_child_weight")], list(nrounds = best, nrounds_selection = "5-fold CV with early stopping on training data")),
    auroc_ci = "Cluster bootstrap over PSUs within strata (300 replicates), percentile 95% CI",
    caution = "Prediction is not causation: a feature can be highly predictive (e.g. age) or carry SHAP importance because it is correlated with true causes, measurement patterns or survival, not because changing it would change cancer risk."))
message("AUROC: ", paste(sprintf("%s %.3f", perf$model, perf$auroc), collapse = "; "))
