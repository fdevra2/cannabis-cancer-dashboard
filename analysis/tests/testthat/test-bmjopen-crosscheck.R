# Independent cross-check of the marijuana variables + weighting against a peer-reviewed NHANES analysis.
# Source (full text fetched via Europe PMC, PMC7389483, 2026-11-25):
#   Mitchell W, Bhatia R, Zebardast N. Retrospective cross-sectional analysis of the changes in
#   marijuana use in the USA, 2005-2018. BMJ Open 2020;10:e037905. doi:10.1136/bmjopen-2020-037905
# Table 1, "Lifetime use": unweighted N and prevalence % by cycle, 2-year MEC weights.
# Their sample = everyone with a DUQ200 answer (public ages 18/20-59). The table note says estimates are
# age-standardised to the 2000 Census; our crude estimates nonetheless match to 1 decimal in every cycle,
# and the Ns match exactly.
test_that("lifetime marijuana use by cycle reproduces BMJ Open 2020 Table 1", {
  published <- data.frame(
    cycle = c("D", "E", "F", "G", "H", "I", "J"),
    n     = c(2922, 3255, 3739, 3333, 3690, 3422, 3199),
    pct   = c(61.5, 60.5, 57.2, 59.9, 59.2, 57.3, 60.9))
  des <- make_design(pooled)
  v <- des$variables
  for (i in seq_len(nrow(published))) {
    dm <- v$duq_answered == 1 & v$cycle == published$cycle[i] & v$wt_pooled > 0
    r <- nchs_proportion(des, "mj_ever", dm)
    expect_equal(r$n, published$n[i], info = published$cycle[i])
    expect_equal(round(100 * r$p, 1), published$pct[i], tolerance = 0.11, info = published$cycle[i])
  }
})
