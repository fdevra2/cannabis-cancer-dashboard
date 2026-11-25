# Policy context (descriptive only):
#  1) State cannabis laws from NCSL "State Medical Cannabis Laws", Table 1 (year of the law/ballot measure as listed)
#  2) THC potency points from ElSohly et al. (abstract numbers; see data/potency.csv)
# Output: data/policy_ncsl.csv (committed, parsed), site/public/data/policy.json
source("analysis/R/config.R")
source("analysis/R/export_utils.R")
suppressMessages({ library(xml2) })

url <- "https://www.ncsl.org/health/state-medical-cannabis-laws"
dir.create(root_path("data", "raw", "policy"), recursive = TRUE, showWarnings = FALSE)
html_path <- root_path("data", "raw", "policy", "ncsl_medical.html")
if (!file.exists(html_path)) utils::download.file(url, html_path, quiet = TRUE, mode = "wb", headers = c(`User-Agent` = "Mozilla/5.0"))
doc <- read_html(html_path)
page_txt <- gsub("\\s+", " ", xml_text(doc))
updated <- regmatches(page_txt, regexpr("Updated\\s+[A-Z][a-z]+ \\d{2}, \\d{4}", page_txt))
as_of <- regmatches(page_txt, regexpr("as of [A-Z][a-z]+ \\d{1,2}, \\d{4}", page_txt))

tab <- xml_find_first(doc, "//table")
trs <- xml_find_all(tab, ".//tr")
cells <- lapply(trs, function(tr) trimws(gsub("[\\s\u00a0]+", " ", xml_text(xml_find_all(tr, "./th|./td")), perl = TRUE)))
cells <- Filter(function(x) length(x) >= 3 && !grepl("^State", x[1]), cells)
years <- function(s) as.integer(regmatches(s, gregexpr("\\((\\d{4})\\)", s))[[1]] |> gsub(pattern = "[()]", replacement = ""))
first_year <- function(s) { y <- years(s); if (length(y)) min(y) else NA_integer_ }
STATES <- c(state.name, "District of Columbia")
out <- do.call(rbind, lapply(cells, function(x) {
  med <- x[2]; adult <- x[3]
  x[1] <- trimws(sub("\\s*Medical program info.*$", "", x[1]))
  flag <- grepl("blocked|pending|repeal", paste(med, adult), ignore.case = TRUE)
  data.frame(jurisdiction = x[1], type = ifelse(x[1] %in% state.name, "State", ifelse(x[1] == "District of Columbia", "DC", "Territory")),
             medical_text = med, medical_first_year = first_year(med),
             adult_use_text = adult, adult_use_first_year = if (nzchar(adult)) first_year(adult) else NA_integer_,
             needs_review = flag, stringsAsFactors = FALSE)
}))
write.csv(out, root_path("data", "policy_ncsl.csv"), row.names = FALSE)

pot <- read.csv(root_path("data", "potency.csv"), stringsAsFactors = FALSE)
write_site_json(out, "policy.json", list(
  ncsl = list(url = url, page_updated = updated, laws_as_of = as_of,
              sha256 = digest::digest(file = html_path, algo = "sha256"),
              note = "Year = earliest year in parentheses in NCSL Table 1 for the medical-use statute/ballot measure, and for the adult-use column. This is the year of the law or ballot measure as listed by NCSL, not necessarily the effective date or the start of retail sales. Rows NCSL annotates as blocked/pending are flagged for review and not charted."),
  potency = pot,
  potency_note = "Mean THC concentration in illicit herbal cannabis seized by the U.S. DEA and analyzed by the University of Mississippi Potency Monitoring Program; values as stated in the study abstracts (~ = approximate). Not representative of state-legal retail products."))
message(sprintf("NCSL rows: %d (%s; %s); flagged: %d", nrow(out), updated, as_of, sum(out$needs_review)))
