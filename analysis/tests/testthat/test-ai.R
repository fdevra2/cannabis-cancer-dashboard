withr::with_dir(Sys.getenv("CCD_ROOT"), source("analysis/R/ai_utils.R"))

test_that("Cohen's kappa matches a hand-calculated example", {
  # po = 0.75; pe = 0.5*0.25 + 0.5*0.75 = 0.5; kappa = 0.5
  k <- kappa(c("y", "y", "n", "n"), c("y", "n", "n", "n"))
  expect_equal(k$kappa, 0.5); expect_equal(k$agreement, 0.75)
  expect_equal(kappa(c("a", "b", "c"), c("a", "b", "c"))$kappa, 1)
})

test_that("weighted AUROC equals pROC's AUROC when all weights are 1 (with ties)", {
  set.seed(1); y <- rbinom(500, 1, 0.3); p <- round(runif(500) + 0.3 * y, 2)
  expect_equal(wauc(p, y, rep(1, 500)), as.numeric(pROC::auc(y, p, quiet = TRUE, direction = "<")), tolerance = 1e-10)
})

test_that("validation template is blind and has 200 abstracts", {
  v <- read.csv(file.path(Sys.getenv("CCD_ROOT"), "data/labels/validation_template.csv"), stringsAsFactors = FALSE)
  expect_equal(nrow(v), 200)
  expect_false(any(grepl("rule|llm|pred", names(v))))
  expect_true(all(c("human_design", "human_site") %in% names(v)))
  expect_true(all(nzchar(v$abstract)))
})

test_that("AI outputs exist and the prediction caution is present", {
  j <- jsonlite::fromJSON(file.path(Sys.getenv("CCD_ROOT"), "site/public/data/ai_predict.json"))
  expect_true(grepl("not causation", j$meta$caution))
  expect_true(all(j$data$performance$auroc > 0.5 & j$data$performance$auroc < 1))
  expect_false(anyNA(j$data$shap$mean_abs_shap))
})
