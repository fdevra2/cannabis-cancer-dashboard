withr::with_dir(Sys.getenv("CCD_ROOT"), source("analysis/R/literature.R"))
ev <- read.csv(file.path(Sys.getenv("CCD_ROOT"), "data/evidence.csv"), stringsAsFactors = FALSE,
               colClasses = "character", encoding = "UTF-8")
src <- read.csv(file.path(Sys.getenv("CCD_ROOT"), "data/literature_sources.csv"), stringsAsFactors = FALSE, colClasses = "character")

test_that("every evidence row has a DOI that was fetched", {
  expect_true(all(nzchar(ev$doi)))
  expect_true(all(grepl("^10\\.", ev$doi)))
  expect_true(all(tolower(ev$doi) %in% tolower(src$doi)))
  for (d in unique(ev$doi)) expect_true(file.exists(file.path(lit_dir(), paste0(safe_doi(d), ".json"))), info = d)
})

test_that("VERIFIED rows: quote is verbatim in the archived source and contains the estimate and CI", {
  v <- ev[ev$status == "VERIFIED", ]
  expect_gt(nrow(v), 30)
  for (i in seq_len(nrow(v))) {
    txt <- lit_text(v$doi[i], v$source_text[i])
    expect_true(grepl(v$quote[i], txt, fixed = TRUE), info = paste(v$id[i], v$quote[i]))
    for (k in c("estimate", "lcl", "ucl")) expect_true(grepl(v[[k]][i], v$quote[i], fixed = TRUE), info = paste(v$id[i], k))
    expect_true(as.numeric(v$lcl[i]) <= as.numeric(v$estimate[i]) && as.numeric(v$estimate[i]) <= as.numeric(v$ucl[i]), info = v$id[i])
  }
})

test_that("direction label follows the CI rule", {
  v <- ev[ev$status == "VERIFIED", ]
  l <- as.numeric(v$lcl); u <- as.numeric(v$ucl)
  expect_equal(v$direction, ifelse(l > 1, "positive association", ifelse(u < 1, "inverse association", "no clear association")))
})

test_that("evidence covers required sites and all directions", {
  v <- ev[ev$status == "VERIFIED", ]
  expect_true(all(c("Lung", "Head and neck (incl. oral)", "Testicular germ cell") %in% v$site_group))
  expect_true(all(c("positive association", "inverse association", "no clear association") %in% v$direction))
})

test_that("NASEM grade wording is verbatim in the official conclusions PDF", {
  gr <- read.csv(file.path(Sys.getenv("CCD_ROOT"), "data/evidence_grades.csv"), stringsAsFactors = FALSE, colClasses = "character")
  txt <- nasem_text()
  for (i in which(nzchar(gr$quote_header))) {
    expect_true(grepl(gr$quote_header[i], txt, fixed = TRUE), info = gr$site_group[i])
    expect_true(grepl(gr$quote_item[i], txt, fixed = TRUE), info = gr$site_group[i])
  }
})

test_that("UNVERIFIED rows never reach the site", {
  j <- jsonlite::fromJSON(file.path(Sys.getenv("CCD_ROOT"), "site/public/data/evidence.json"))$data
  expect_false(any(j$id %in% ev$id[ev$status != "VERIFIED"]))
})

test_that("Gallagher 2024 rows (correction text unavailable) are UNVERIFIED", {
  expect_true(all(ev$status[ev$id %in% c("H08", "H09", "H10", "H11")] == "UNVERIFIED"))
})
