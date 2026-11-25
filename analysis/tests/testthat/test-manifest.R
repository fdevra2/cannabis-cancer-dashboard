test_that("every raw file is in the manifest with a matching SHA-256 and a CDC source URL", {
  man <- read.csv(file.path(Sys.getenv("CCD_ROOT"), "data/raw/MANIFEST.csv"), stringsAsFactors = FALSE)
  expect_true(all(grepl("^https://wwwn\\.cdc\\.gov/Nchs/Data/Nhanes/Public/", man$url)))
  x <- man[man$kind == "xpt", ]
  for (i in seq_len(nrow(x))) {
    p <- file.path(Sys.getenv("CCD_ROOT"), "data/raw/xpt", x$path[i])
    expect_true(file.exists(p), info = x$path[i])
    expect_equal(digest::digest(file = p, algo = "sha256"), x$sha256[i], info = x$path[i])
  }
  # no restricted files
  expect_false(any(grepl("_R\\.|P_DUQ|DUQ_L", man$path)))
})
