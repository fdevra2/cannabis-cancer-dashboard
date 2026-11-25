# Run from project root: Rscript analysis/tests/run_tests.R
suppressMessages(library(testthat))
Sys.setenv(CCD_ROOT = normalizePath("."))
res <- test_dir("analysis/tests/testthat", reporter = "summary", stop_on_failure = TRUE)
