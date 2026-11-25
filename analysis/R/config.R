# Project configuration: NHANES cycles and files used.
# Only PUBLIC files. DUQ for 2017-Mar 2020 (P_DUQ_R) and 2021-2023 (DUQ_L_R) are
# RDC-only (verified on CDC documentation pages, Nov 2026) and are NOT used.

`%||%` <- function(a, b) if (is.null(a)) b else a

root_path <- function(...) {
  r <- Sys.getenv("CCD_ROOT", unset = "")
  if (r == "") r <- rprojroot_find()
  file.path(r, ...)
}

rprojroot_find <- function() {
  d <- normalizePath(getwd())
  repeat {
    if (file.exists(file.path(d, "CLAUDE.md")) && dir.exists(file.path(d, "analysis"))) return(d)
    p <- dirname(d)
    if (p == d) stop("Could not find project root (CLAUDE.md + analysis/). Set CCD_ROOT.")
    d <- p
  }
}

CYCLES <- data.frame(
  suffix = c("D", "E", "F", "G", "H", "I", "J"),
  start  = c(2005, 2007, 2009, 2011, 2013, 2015, 2017),
  stringsAsFactors = FALSE
)
CYCLES$label <- paste0(CYCLES$start, "–", CYCLES$start + 1)

# Components per cycle. NULL = all cycles.
COMPONENTS <- list(
  DEMO   = CYCLES$suffix,
  DUQ    = CYCLES$suffix,
  SMQ    = CYCLES$suffix,
  MCQ    = CYCLES$suffix,
  ALQ    = CYCLES$suffix,
  HIQ    = CYCLES$suffix,
  BMX    = CYCLES$suffix,
  SXQ    = c("D", "E", "F", "G", "H", "I"),        # SXQ_J is RDC-only (SXQ_J_R)
  ORHPV  = c("F", "G", "H", "I"),                  # oral rinse HPV, 2009-2016
  HPVSWR = c("D", "E", "F", "G", "H", "I"),        # vaginal swab HPV DNA (women)
  HPVSRM = c("D")                                  # serum HPV antibodies 2005-2006
)

nhanes_url <- function(component, suffix, ext = "xpt") {
  start <- CYCLES$start[CYCLES$suffix == suffix]
  sprintf("https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/%d/DataFiles/%s_%s.%s",
          start, component, suffix, ext)
}

file_list <- function() {
  do.call(rbind, lapply(names(COMPONENTS), function(comp) {
    s <- COMPONENTS[[comp]]
    data.frame(component = comp, suffix = s, file = paste0(comp, "_", s),
               xpt_url = vapply(s, function(x) nhanes_url(comp, x, "xpt"), ""),
               htm_url = vapply(s, function(x) nhanes_url(comp, x, "htm"), ""),
               stringsAsFactors = FALSE, row.names = NULL)
  }))
}
