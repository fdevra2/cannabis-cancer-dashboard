withr::with_dir(Sys.getenv("CCD_ROOT"), source("analysis/R/literature.R"))

test_that("potency values are quoted verbatim from the archived abstracts", {
  pot <- read.csv(file.path(Sys.getenv("CCD_ROOT"), "data/potency.csv"), stringsAsFactors = FALSE)
  for (i in seq_len(nrow(pot))) {
    txt <- lit_text(pot$doi[i])
    expect_true(grepl(pot$quote[i], txt, fixed = TRUE), info = pot$quote[i])
    expect_true(grepl(paste0(pot$thc_pct[i], "%"), pot$quote[i], fixed = TRUE), info = pot$year[i])
    expect_true(grepl(as.character(pot$year[i]), pot$quote[i], fixed = TRUE), info = pot$year[i])
  }
})

test_that("NCSL-derived years appear in NCSL's own text for each row", {
  x <- read.csv(file.path(Sys.getenv("CCD_ROOT"), "data/policy_ncsl.csv"), stringsAsFactors = FALSE)
  expect_gte(sum(x$type == "State"), 40)
  for (i in seq_len(nrow(x))) {
    if (!is.na(x$medical_first_year[i])) expect_true(grepl(sprintf("(%d)", x$medical_first_year[i]), x$medical_text[i], fixed = TRUE), info = x$jurisdiction[i])
    if (!is.na(x$adult_use_first_year[i])) expect_true(grepl(sprintf("(%d)", x$adult_use_first_year[i]), x$adult_use_text[i], fixed = TRUE), info = x$jurisdiction[i])
  }
  # spot checks against NCSL text: Colorado Amendment 64 (2012), Washington Initiative 502 (2012)
  expect_equal(x$adult_use_first_year[x$jurisdiction == "Colorado"], 2012)
  expect_equal(x$adult_use_first_year[x$jurisdiction == "Washington"], 2012)
  expect_equal(x$medical_first_year[x$jurisdiction == "California"], 1996)
})
