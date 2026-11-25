grid <- jsonlite::fromJSON(file.path(Sys.getenv("CCD_ROOT"), "site/public/data/models_grid.json"))$data

test_that("grid covers outcome x exposure x sample x 16 covariate sets", {
  expect_equal(nrow(grid), 4 * 4 * 3 * 16)
  expect_true(all(grid$lcl <= grid$or & grid$or <= grid$ucl))
})

test_that("each exposure/outcome/sample uses the SAME people across covariate sets", {
  k <- split(grid$n, paste(grid$exposure, grid$outcome, grid$sample))
  expect_true(all(vapply(k, function(x) length(unique(x)) == 1, TRUE)))
})

test_that("crude survey-weighted OR equals the OR from weighted 2x2 proportions", {
  withr::with_dir(Sys.getenv("CCD_ROOT"), {
    source("analysis/R/analysis_vars.R")
    source("analysis/R/models.R")
  })
  d <- add_analysis_vars(pooled)
  des <- make_design(d)
  v <- des$variables
  keep <- base_keep(v, CYCLES$suffix) & !is.na(v$x_ever) & !is.na(v$cancer_any)
  w <- v$wt_pooled[keep]; x <- v$x_ever[keep]; y <- v$cancer_any[keep]
  p1 <- sum(w[x == 1 & y == 1]) / sum(w[x == 1]); p0 <- sum(w[x == 0 & y == 1]) / sum(w[x == 0])
  or_2x2 <- (p1 / (1 - p1)) / (p0 / (1 - p0))
  crude <- grid[grid$exposure == "x_ever" & grid$outcome == "cancer_any" & grid$sample == "main" & grid$blocks == "", ]
  expect_equal(crude$or, or_2x2, tolerance = 1e-6)
  expect_equal(crude$n, sum(keep))
})

test_that("reverse-causation samples only remove cancer cases", {
  m <- grid[grid$sample == "main" & grid$blocks == "", ]
  for (s in c("excl_after", "excl_after_same")) {
    e <- grid[grid$sample == s & grid$blocks == "", ]
    e <- e[match(paste(m$exposure, m$outcome), paste(e$exposure, e$outcome)), ]
    expect_true(all(m$n - e$n == m$cases - e$cases))
  }
})
