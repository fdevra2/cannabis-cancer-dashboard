# The headline is GENERATED from all three estimates (complete case, multiple imputation, missing-indicator)
# by analysis/R/headline.R. These tests regenerate it and fail if any document or the site data disagrees.
withr::with_dir(Sys.getenv("CCD_ROOT"), source("analysis/R/headline.R"))
root <- Sys.getenv("CCD_ROOT")
read <- function(f) paste(readLines(file.path(root, f), warn = FALSE, encoding = "UTF-8"), collapse = "\n")
h <- withr::with_dir(root, build_headline())

test_that("every document contains exactly the generated headline block", {
  for (f in HEADLINE_DOCS) {
    blk <- extract_block(read(f))
    expect_false(is.na(blk), info = paste(f, "has no HEADLINE markers"))
    expect_identical(blk, h$block, info = paste(f, "disagrees with the generated headline (run Rscript analysis/R/headline.R)"))
  }
})

test_that("site headline.json matches the generated statement and estimates", {
  j <- jsonlite::fromJSON(file.path(root, "site/public/data/headline.json"))$data
  expect_identical(j$statement, h$statement)
  for (k in c("complete_case", "multiple_imputation", "missing_indicator"))
    expect_equal(j$estimates[[k]]$or, h$estimates[[k]]$or, info = k)
})

test_that("the statement is derived from all three estimates", {
  ors <- c(h$estimates$complete_case$or, h$estimates$multiple_imputation$or, h$estimates$missing_indicator$or)
  lo <- round(min(ors), 1); hi <- round(max(ors), 1)
  expect_true(grepl(if (lo == hi) sprintf("OR ~%.1f", lo) else sprintf("OR ~%.1f–%.1f", lo, hi), h$statement, fixed = TRUE))
  expect_true(grepl("modest association", h$statement) && grepl("attenuated by smoking adjustment", h$statement) &&
              grepl("not robust across analytic choices", h$statement))
  expect_false(grepl("no clear association", h$statement))
  # each estimate line (with E-values) appears in the block
  for (k in c("complete_case", "multiple_imputation", "missing_indicator"))
    expect_true(grepl(est_str(as.data.frame(h$estimates[[k]][c("or", "lcl", "ucl")])), h$block, fixed = TRUE), info = k)
  # attenuation: demographics-only OR is larger than the fully adjusted complete-case OR
  expect_gt(h$estimates$demographics_only$or, h$estimates$complete_case$or)
})

test_that("E-values follow VanderWeele & Ding and use the CI limit closest to 1", {
  expect_equal(evalue_rr(2), 2 + sqrt(2))
  expect_equal(evalue_rr(0.5), evalue_rr(2))
  expect_equal(evalue_ci(1.19, 0.96, 1.47), 1)
  expect_equal(evalue_ci(1.28, 1.03, 1.59), evalue_rr(1.03))
})

test_that("no 'increased risk' wording in site text or docs we wrote", {
  txt <- paste(sapply(c(list.files(file.path(root, "site/src"), recursive = TRUE, full.names = TRUE),
                        file.path(root, "docs/methods.md"), file.path(root, "README.md")),
                      function(f) paste(readLines(f, warn = FALSE), collapse = "\n")), collapse = "\n")
  expect_false(grepl("increased risk|higher risk|lower risk|reduced risk", txt, ignore.case = TRUE))
})
