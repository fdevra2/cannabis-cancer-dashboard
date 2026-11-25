# Survey design construction and NCHS reliability standards.
#
# Rule (CLAUDE.md #3): the design is built on the FULL pooled sample of the selected cycles
# (every DEMO participant, including those not examined, who carry WTMEC2YR = 0), and analytic
# samples are taken with subset(design, ...). Filtering the data frame first would drop PSUs/strata
# with no analytic observations and understate variance / misstate degrees of freedom.
source("analysis/R/config.R")
suppressMessages(library(survey))
# A lonely PSU should never be silently "adjusted": with the full-sample design + subset() none
# can arise (the full 2005-2018 design has 2-3 PSUs in every stratum), so fail loudly if one does.
options(survey.lonely.psu = "fail")

load_pooled <- function() readRDS(root_path("data", "derived", "nhanes_pooled.rds"))

demo_counts <- function() {
  p <- root_path("data", "derived", "demo_counts.csv")
  if (!file.exists(p)) {
    n <- vapply(CYCLES$suffix, function(s)
      nrow(haven::read_xpt(root_path("data", "raw", "xpt", paste0("DEMO_", s, ".xpt")))), 0L)
    write.csv(data.frame(cycle = CYCLES$suffix, n = n), p, row.names = FALSE)
  }
  read.csv(p, stringsAsFactors = FALSE)
}

#' Build the MEC-weighted design on the full pooled sample of `cycles`.
#' Weight = WTMEC2YR / (number of pooled 2-year cycles), per NHANES analytic guidelines.
make_design <- function(d, cycles = CYCLES$suffix) {
  d <- d[d$cycle %in% cycles, , drop = FALSE]
  expected <- sum(demo_counts()$n[demo_counts()$cycle %in% cycles])
  if (nrow(d) != expected) {
    stop(sprintf("make_design() needs the FULL pooled sample (%d DEMO rows for cycles %s) but got %d rows. ",
                 expected, paste(cycles, collapse = ""), nrow(d)),
         "Do not filter before svydesign(); use subset(design, ...) instead.")
  }
  if (anyDuplicated(d$SEQN)) stop("Duplicate SEQN in pooled data")
  d$wt_pooled <- ifelse(is.na(d$WTMEC2YR), 0, d$WTMEC2YR) / length(cycles)
  svydesign(ids = ~SDMVPSU, strata = ~SDMVSTRA, weights = ~wt_pooled, nest = TRUE, data = d)
}

#' Primary analytic subset: answered DUQ200, ages lo-hi, examined (MEC weight > 0).
analytic_subset <- function(des, lo = 20, hi = 59) {
  v <- des$variables
  keep <- v$duq_answered == 1 & v$age >= lo & v$age <= hi & v$wt_pooled > 0
  keep[is.na(keep)] <- FALSE
  subset(des, keep)   # survey retains the full design's PSU counts per stratum (fpc$sampsize)
}

#' NCHS subgroup degrees of freedom: #PSUs with sampled obs in subgroup - #strata with obs in subgroup.
domain_df <- function(des, idx) {
  v <- des$variables
  ok <- idx & is.finite(des$prob)
  psu <- paste(v$SDMVSTRA[ok], v$SDMVPSU[ok])
  length(unique(psu)) - length(unique(v$SDMVSTRA[ok]))
}

#' Proportion with Korn-Graubard CI and NCHS Data Presentation Standards for Proportions
#' (Parker et al. 2017, Vital Health Stat 2(175); criteria as given in the NHANES tutorial
#' "Reliability of Estimates"):
#'  - suppress if actual n < 30 or effective n < 30
#'  - suppress if absolute CI width >= 0.30
#'  - suppress if 0.05 < CI width < 0.30 and relative CI width > 130%
#'  - flag for statistical review if df < 8 or number of events == 0
#' Effective n = p(1-p)/Var(p), capped at n; KG df-adjusted n* = n_eff * (t_{n-1}/t_df)^2, capped at n.
nchs_proportion <- function(des, var, domain = NULL) {
  v <- des$variables
  x <- v[[var]]
  idx <- is.finite(des$prob) & !is.na(x)
  if (!is.null(domain)) idx <- idx & !is.na(domain) & domain
  n <- sum(idx); events <- sum(x[idx] == 1)
  if (n == 0) return(data.frame(p = NA, se = NA, lcl = NA, ucl = NA, n = 0, events = 0, n_eff = NA,
                                df = NA, ciw = NA, rciw = NA, status = "suppress", reason = "n = 0"))
  sub <- subset(des, idx)
  est <- svymean(as.formula(paste0("~", var)), sub)
  p <- as.numeric(coef(est)); se <- as.numeric(SE(est))
  df <- domain_df(des, idx)
  n_eff <- if (p > 0 && p < 1 && se > 0) min(n, p * (1 - p) / se^2) else n
  n_star <- if (df > 0) min(n, n_eff * (qt(0.975, n - 1) / qt(0.975, df))^2) else n_eff
  xk <- p * n_star
  lcl <- if (xk > 0) qbeta(0.025, xk, n_star - xk + 1) else 0
  ucl <- if (xk < n_star) qbeta(0.975, xk + 1, n_star - xk) else 1
  ciw <- ucl - lcl
  rciw <- if (p > 0) 100 * ciw / p else Inf
  status <- "ok"; reason <- ""
  if (n < 30) { status <- "suppress"; reason <- "n < 30" }
  else if (n_eff < 30) { status <- "suppress"; reason <- "effective n < 30" }
  else if (ciw >= 0.30) { status <- "suppress"; reason <- "CI width >= 30 points" }
  else if (ciw > 0.05 && rciw > 130) { status <- "suppress"; reason <- "relative CI width > 130%" }
  else if (df < 8) { status <- "review"; reason <- "df < 8" }
  else if (events == 0) { status <- "review"; reason <- "0 events" }
  data.frame(p = p, se = se, lcl = lcl, ucl = ucl, n = n, events = events, n_eff = n_eff, df = df,
             ciw = ciw, rciw = rciw, status = status, reason = reason)
}
