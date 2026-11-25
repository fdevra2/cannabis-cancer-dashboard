cbv <- read.csv(file.path(Sys.getenv("CCD_ROOT"), "data/derived/codebook_values.csv"), stringsAsFactors = FALSE)
cb_count <- function(var, cyc, codes) sum(cbv$count[cbv$variable == var & cbv$cycle == cyc & cbv$code %in% codes])

test_that("marijuana items are unanswered for every participant aged 60+", {
  expect_equal(sum(pooled$duq_answered == 1 & pooled$age >= 60, na.rm = TRUE), 0)
})

test_that("DUQ200 and MCQ220 counts match CDC codebook frequencies in every cycle", {
  for (s in CYCLES$suffix) {
    x <- pooled[pooled$cycle == s, ]
    expect_equal(sum(x$mj_ever == 1, na.rm = TRUE), cb_count("DUQ200", s, "1"), info = s)
    expect_equal(sum(x$mj_ever == 0, na.rm = TRUE), cb_count("DUQ200", s, "2"), info = s)
    expect_equal(sum(x$cancer_any == 1, na.rm = TRUE), cb_count("MCQ220", s, "1"), info = s)
  }
})

test_that("refused/don't-know codes never survive harmonization", {
  expect_true(all(pooled$mj_age_first < 77, na.rm = TRUE))
  expect_true(all(pooled$mj_days30 <= 30, na.rm = TRUE))
  expect_true(all(pooled$age_dx_first <= 85, na.rm = TRUE))
  expect_true(all(pooled$drinks_wk < 500, na.rm = TRUE))
})

test_that("exclusion outcomes only ever turn cases into non-cases", {
  expect_true(all(pooled$cancer_excl_skin <= pooled$cancer_any, na.rm = TRUE))
  expect_true(all(pooled$cancer_excl_cervical <= pooled$cancer_any, na.rm = TRUE))
  expect_true(all(pooled$cancer_excl_skin_cervical <= pmin(pooled$cancer_excl_skin, pooled$cancer_excl_cervical), na.rm = TRUE))
})

test_that("regular use and joint-year proxy only exist from 2009-2010 (F) on", {
  expect_true(all(is.na(pooled$mj_regular[pooled$cycle %in% c("D", "E")])))
  expect_true(all(is.na(pooled$mj_joint_years[pooled$cycle %in% c("D", "E")])))
  expect_true(all(pooled$mj_joint_years[pooled$mj_ever == 0] == 0, na.rm = TRUE))
})

test_that("pooled file keeps one row per DEMO participant", {
  expect_equal(nrow(pooled), sum(demo_counts()$n))
  expect_false(anyDuplicated(pooled$SEQN) > 0)
})
