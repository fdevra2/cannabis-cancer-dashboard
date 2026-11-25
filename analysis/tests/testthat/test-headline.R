# The headline estimate must be stated identically everywhere it is written by hand.
root <- Sys.getenv("CCD_ROOT")
f2 <- function(x) sprintf("%.2f", x)
fmt <- function(r) sprintf("OR %s (95%% CI %s–%s)", f2(r$or), f2(r$lcl), f2(r$ucl))
grid <- jsonlite::fromJSON(file.path(root, "site/public/data/models_grid.json"))$data
pir <- jsonlite::fromJSON(file.path(root, "site/public/data/models_pir.json"))$data
H <- fmt(grid[grid$exposure == "x_ever" & grid$outcome == "cancer_any" & grid$sample == "main" & grid$blocks == "demo+tobacco+alcohol+ses", ])
P <- fmt(pir[pir$exposure == "x_ever" & pir$outcome == "cancer_any" & pir$approach == "missing_category", ])
read <- function(f) paste(readLines(file.path(root, f), warn = FALSE, encoding = "UTF-8"), collapse = "\n")

test_that("headline string matches the model output in README, methods and PROGRESS", {
  for (f in c("README.md", "docs/methods.md", "PROGRESS.md")) {
    expect_true(grepl(H, read(f), fixed = TRUE), info = paste(f, H))
    expect_true(grepl(P, read(f), fixed = TRUE), info = paste(f, P))
  }
  # complete-case headline equals the PIR file's complete-case row (same model)
  cc <- pir[pir$exposure == "x_ever" & pir$outcome == "cancer_any" & pir$approach == "complete_case", ]
  expect_equal(fmt(cc), H)
})

test_that("no 'increased risk' wording in site text or docs we wrote", {
  txt <- paste(sapply(c(list.files(file.path(root, "site/src"), recursive = TRUE, full.names = TRUE),
                        file.path(root, "docs/methods.md"), file.path(root, "README.md")),
                      function(f) paste(readLines(f, warn = FALSE), collapse = "\n")), collapse = "\n")
  expect_false(grepl("increased risk|higher risk|lower risk|reduced risk", txt, ignore.case = TRUE))
})
