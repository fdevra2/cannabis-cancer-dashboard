# Helpers for writing site data files (deterministic: no timestamps, fixed rounding).
suppressMessages(library(jsonlite))

site_data_path <- function(name) {
  d <- root_path("site", "public", "data")
  dir.create(d, recursive = TRUE, showWarnings = FALSE)
  file.path(d, name)
}

write_site_json <- function(x, name, meta = list()) {
  out <- list(meta = c(list(generated_by = "analysis/R pipeline (see docs/methods.md)"), meta), data = x)
  writeLines(toJSON(out, auto_unbox = TRUE, digits = I(6), na = "null", pretty = TRUE), site_data_path(name))
  message("wrote site/public/data/", name)
}

SAMPLE_PRIMARY <- "Adults aged 20-59 who answered the NHANES marijuana question (DUQ200), MEC-examined, NHANES 2005-2018 public files"
DESIGN_NOTE <- "Weights WTMEC2YR/7 (pooled 2005-2018), strata SDMVSTRA, PSU SDMVPSU, Taylor linearization; design built on the full pooled sample and restricted with subset()"
RELIABILITY_NOTE <- "Korn-Graubard 95% CIs; NCHS Data Presentation Standards for Proportions (Parker et al. 2017) applied"
