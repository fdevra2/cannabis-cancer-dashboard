# Helpers to read archived literature texts (normalized for verbatim matching).
source("analysis/R/config.R")
suppressMessages({ library(xml2); library(jsonlite) })

lit_dir <- function() root_path("data", "raw", "literature")
safe_doi <- function(doi) gsub("[^A-Za-z0-9]+", "_", tolower(doi))
norm_ws <- function(x) gsub("\\s+", " ", x)

#' Text for a DOI from the archived record: "abstract" (Europe PMC/Crossref) or "fulltext" (OA XML).
lit_text <- function(doi, which = c("abstract", "fulltext")) {
  which <- match.arg(which)
  base <- file.path(lit_dir(), safe_doi(doi))
  if (which == "abstract") {
    r <- fromJSON(paste0(base, ".json"))
    if (is.null(r$abstract)) return("")
    # Abstracts mix formatting tags (<h4>, <i>, <sup>) with literal "<" in text ("P < .001", "10-<20 years",
    # "<or=55 yrs"). Strip ONLY known formatting tags, escape every other "<"/">", then decode entities.
    a <- gsub("</?(h[1-6]|p|i|b|em|strong|sup|sub|br|span|div|a|abstracttext)(\\s[^>]*)?/?>", " ", r$abstract,
              ignore.case = TRUE, perl = TRUE)
    a <- gsub(">", "&gt;", gsub("<", "&lt;", a, fixed = TRUE), fixed = TRUE)
    return(norm_ws(xml_text(read_html(paste0("<div>", a, "</div>")))))
  }
  p <- paste0(base, ".xml")
  if (!file.exists(p)) return("")
  norm_ws(xml_text(read_xml(p)))
}

nasem_text <- function() {
  p <- file.path(lit_dir(), "nasem_2017_conclusions.pdf")
  norm_ws(paste(pdftools::pdf_text(p), collapse = " "))
}
