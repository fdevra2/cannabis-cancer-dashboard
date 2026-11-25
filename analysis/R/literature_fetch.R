# Fetch bibliographic metadata + abstracts (and open-access full text when available) for every DOI in
# data/literature_sources.csv, from Europe PMC (and Crossref as fallback). Saved to data/raw/literature/
# (gitignored). analysis/tests/testthat/test-evidence.R checks every number in data/evidence.csv
# against these saved texts.
source("analysis/R/config.R")
suppressMessages({ library(jsonlite) })

out <- root_path("data", "raw", "literature")
dir.create(out, recursive = TRUE, showWarnings = FALSE)
safe <- function(doi) gsub("[^A-Za-z0-9]+", "_", tolower(doi))
src <- read.csv(root_path("data", "literature_sources.csv"), stringsAsFactors = FALSE, colClasses = "character")

get_json <- function(u) { Sys.sleep(0.4); fromJSON(u, simplifyVector = FALSE) }

for (i in seq_len(nrow(src))) {
  doi <- tolower(src$doi[i]); f <- file.path(out, paste0(safe(doi), ".json"))
  if (file.exists(f)) next
  q <- utils::URLencode(sprintf('DOI:"%s"', doi), reserved = TRUE)
  res <- get_json(sprintf("https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=%s&format=json&resultType=core&pageSize=1", q))
  hit <- res$resultList$result
  rec <- list(doi = doi, fetched_utc = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"))
  if (length(hit)) {
    h <- hit[[1]]
    rec$source <- "Europe PMC"
    rec$title <- h$title; rec$authors <- h$authorString; rec$journal <- h$journalInfo$journal$title
    rec$year <- h$pubYear; rec$pmid <- h$pmid; rec$pmcid <- h$pmcid
    rec$abstract <- h$abstractText; rec$is_open_access <- h$isOpenAccess
    if (!is.null(h$pmcid) && identical(h$isOpenAccess, "Y")) {
      xml_path <- file.path(out, paste0(safe(doi), ".xml"))
      try(utils::download.file(sprintf("https://www.ebi.ac.uk/europepmc/webservices/rest/%s/fullTextXML", h$pmcid),
                               xml_path, quiet = TRUE, mode = "wb"), silent = TRUE)
      rec$fulltext <- file.exists(xml_path)
    }
  } else {
    cr <- get_json(sprintf("https://api.crossref.org/works/%s", utils::URLencode(doi, reserved = TRUE)))$message
    rec$source <- "Crossref"
    rec$title <- unlist(cr$title)[1]; rec$journal <- unlist(cr$`container-title`)[1]
    rec$year <- cr$issued$`date-parts`[[1]][[1]]; rec$publisher <- cr$publisher
    rec$authors <- paste(vapply(cr$author %||% list(), function(a) paste(c(a$family, a$given, a$name), collapse = " "), ""), collapse = ", ")
    rec$abstract <- cr$abstract
  }
  writeLines(toJSON(rec, auto_unbox = TRUE, pretty = TRUE, null = "null"), f)
  message(sprintf("%-40s %s | abstract:%s fulltext:%s", doi, rec$source, !is.null(rec$abstract), isTRUE(rec$fulltext)))
}

# NASEM 2017 committee conclusions (official NAP resource PDF). The NAP HTML reader blocks scripted access,
# so the conclusions PDF is the archived, testable source for the evidence grades.
nasem_pdf <- file.path(out, "nasem_2017_conclusions.pdf")
if (!file.exists(nasem_pdf)) {
  utils::download.file("https://nap.nationalacademies.org/resource/24625/Cannabis_committee_conclusions.pdf",
                       nasem_pdf, mode = "wb", quiet = TRUE, headers = c(`User-Agent` = "Mozilla/5.0"))
  message("NASEM conclusions PDF: ", file.size(nasem_pdf), " bytes")
}
