# Weighted prevalence estimates for the site.
# Phase A: ever-use of marijuana by cycle (first real chart).
source("analysis/R/design.R")
source("analysis/R/export_utils.R")

prev_by <- function(des, var, groups, group_name) {
  v <- des$variables
  do.call(rbind, lapply(names(groups), function(g) {
    r <- nchs_proportion(des, var, groups[[g]])
    cbind(data.frame(measure = var, group_var = group_name, group = g, stringsAsFactors = FALSE), r)
  }))
}

if (sys.nframe() == 0) {
  pooled <- load_pooled()
  des <- make_design(pooled)
  sub <- analytic_subset(des)
  v <- des$variables
  in_sample <- is.finite(sub$prob)  # not used directly; domains below are defined on des
  base <- v$duq_answered == 1 & v$age >= 20 & v$age <= 59 & v$wt_pooled > 0
  base[is.na(base)] <- FALSE

  cyc <- setNames(lapply(CYCLES$suffix, function(s) base & v$cycle == s), CYCLES$label)
  ever <- prev_by(des, "mj_ever", cyc, "cycle")
  write_site_json(ever, "prev_ever_by_cycle.json", list(
    title = "Ever used marijuana or hashish (DUQ200), by NHANES cycle",
    sample = SAMPLE_PRIMARY, design = DESIGN_NOTE, reliability = RELIABILITY_NOTE,
    source_files = "DEMO_D-J, DUQ_D-J (see data/raw/MANIFEST.csv)"))
}
