# AI-assisted literature triage (demo b).
#  1) Retrieve cannabis + cancer records from PubMed via NCBI E-utilities (esearch/efetch), and publication
#     counts per year. tool = "cannabis-cancer-dashboard"; email from NCBI_EMAIL in .env (if set);
#     <= 3 requests/second without an API key (we pause 0.4 s between requests).
#  2) Classify study design and cancer site with a transparent rule-based classifier (rules below).
#  3) Export a stratified random validation sample for HUMAN labelling (blind: no predictions in the template)
#     and, if human labels exist, benchmark the classifier (Cohen's kappa, confusion matrices).
# Outputs: data/raw/pubmed/ (gitignored), data/labels/validation_template.csv, site/public/data/ai_triage.json
source("analysis/R/config.R")
source("analysis/R/export_utils.R")
source("analysis/R/ai_utils.R")
suppressMessages({ library(xml2); library(jsonlite) })

read_env <- function(path = root_path(".env")) {
  if (!file.exists(path)) return(list())
  l <- grep("^[A-Z_]+=", readLines(path, warn = FALSE), value = TRUE)
  setNames(as.list(sub("^[A-Z_]+=", "", l)), sub("=.*$", "", l))
}
env <- read_env()
EMAIL <- trimws(env$NCBI_EMAIL %||% "")
API_KEY <- trimws(env$NCBI_API_KEY %||% "")
TOOL <- "cannabis-cancer-dashboard"
PAUSE <- if (nzchar(API_KEY)) 0.12 else 0.4   # NCBI: 3 req/s without key, 10 with key

QUERY <- paste(
  '(cannabis[tiab] OR marijuana[tiab] OR marihuana[tiab] OR "Cannabis"[Mesh] OR "Marijuana Smoking"[Mesh] OR "Marijuana Use"[Mesh])',
  'AND (cancer[tiab] OR neoplasm*[tiab] OR carcinoma*[tiab] OR tumor*[tiab] OR tumour*[tiab] OR malignan*[tiab] OR "Neoplasms"[Mesh])',
  'AND (risk[tiab] OR incidence[tiab] OR association[tiab] OR associated[tiab] OR odds[tiab] OR hazard[tiab] OR epidemiolog*[tiab])')

eutils <- function(endpoint, params) {
  params$tool <- TOOL
  if (nzchar(EMAIL)) params$email <- EMAIL
  if (nzchar(API_KEY)) params$api_key <- API_KEY
  url <- paste0("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/", endpoint, ".fcgi")
  Sys.sleep(PAUSE)
  for (i in 1:4) {
    r <- tryCatch(httr2::req_perform(httr2::req_body_form(httr2::request(url), !!!params)), error = function(e) NULL)
    if (!is.null(r) && httr2::resp_status(r) == 200) return(httr2::resp_body_string(r))
    Sys.sleep(2^i)
  }
  stop("E-utilities request failed: ", endpoint)
}

# ---------------- 1) Retrieve ----------------
raw <- root_path("data", "raw", "pubmed"); dir.create(raw, recursive = TRUE, showWarnings = FALSE)
corpus_path <- file.path(raw, "corpus.rds")
if (!file.exists(corpus_path)) {
  s <- fromJSON(eutils("esearch", list(db = "pubmed", term = QUERY, retmax = 10000, retmode = "json", usehistory = "y")))$esearchresult
  pmids <- unlist(s$idlist)
  message("PubMed hits: ", length(pmids))
  recs <- list()
  for (b in split(pmids, ceiling(seq_along(pmids) / 200))) {
    x <- read_xml(eutils("efetch", list(db = "pubmed", id = paste(b, collapse = ","), retmode = "xml")))
    for (a in xml_find_all(x, "//PubmedArticle")) {
      txt <- function(p) paste(xml_text(xml_find_all(a, p)), collapse = " ")
      yr <- xml_text(xml_find_first(a, ".//Article/Journal/JournalIssue/PubDate/Year"))
      if (is.na(yr)) yr <- substr(xml_text(xml_find_first(a, ".//Article/Journal/JournalIssue/PubDate/MedlineDate")), 1, 4)
      recs[[length(recs) + 1]] <- data.frame(
        pmid = xml_text(xml_find_first(a, ".//MedlineCitation/PMID")),
        year = suppressWarnings(as.integer(yr)),
        title = txt(".//ArticleTitle"), abstract = txt(".//Abstract/AbstractText"),
        pubtypes = paste(xml_text(xml_find_all(a, ".//PublicationType")), collapse = "; "),
        mesh = paste(xml_text(xml_find_all(a, ".//MeshHeading/DescriptorName")), collapse = "; "),
        journal = xml_text(xml_find_first(a, ".//Journal/ISOAbbreviation")),
        stringsAsFactors = FALSE)
    }
    message("fetched ", length(recs))
  }
  corpus <- do.call(rbind, recs)
  attr(corpus, "query") <- QUERY
  attr(corpus, "retrieved_utc") <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  saveRDS(corpus, corpus_path)
}
corpus <- readRDS(corpus_path)

# Publication counts per year (esearch with [dp] limits), 1970-2025 complete years
counts_path <- file.path(raw, "counts_by_year.rds")
if (!file.exists(counts_path)) {
  yrs <- 1970:2025
  n <- vapply(yrs, function(y) as.integer(fromJSON(eutils("esearch", list(db = "pubmed", retmode = "json", retmax = 0,
    term = sprintf("(%s) AND %d[dp]", QUERY, y))))$esearchresult$count), 0L)
  saveRDS(data.frame(year = yrs, n = n), counts_path)
}
counts <- readRDS(counts_path)

# ---------------- 2) Rule-based classifier ----------------
# Design: first matching rule wins (order matters). Uses PubMed publication types, then title/abstract keywords.
DESIGN_RULES <- list(
  list(label = "Systematic review / meta-analysis", pt = "Meta-Analysis|Systematic Review", kw = "meta-analys|systematic review|pooled analysis"),
  list(label = "Randomized / clinical trial", pt = "Randomized Controlled Trial|Clinical Trial", kw = "randomi[sz]ed|placebo-controlled|clinical trial"),
  list(label = "Preclinical (cell/animal)", pt = "$^", kw = "\\bin vitro\\b|cell line|\\bmice\\b|\\bmouse\\b|\\brats?\\b|xenograft|murine|cultured cells"),
  list(label = "Cohort", pt = "$^", kw = "cohort|prospective|longitudinal|follow-up|followed up"),
  list(label = "Case-control", pt = "$^", kw = "case-control|case control|matched controls"),
  list(label = "Cross-sectional / survey", pt = "$^", kw = "cross-sectional|cross sectional|survey|nhanes|questionnaire"),
  list(label = "Case report / series", pt = "Case Reports", kw = "case report|we report a|we present a|case series"),
  list(label = "Narrative review / commentary", pt = "Review|Editorial|Comment|Letter", kw = "\\breview\\b|commentary|perspective")
)
SITE_RULES <- list(
  list(label = "Lung", kw = "lung|pulmonary|bronch"),
  list(label = "Head & neck / oral", kw = "head and neck|oral cancer|oral cavity|oropharyn|pharyn|laryn|mouth|tongue|hnscc|oral squamous"),
  list(label = "Testicular", kw = "testicul|testis|germ cell tumo|seminoma"),
  list(label = "Breast", kw = "breast"),
  list(label = "Prostate", kw = "prostat"),
  list(label = "Colorectal", kw = "colorectal|colon|rectal|bowel"),
  list(label = "Brain / glioma", kw = "glioma|glioblastoma|brain tumo|astrocytoma"),
  list(label = "Bladder / urologic", kw = "bladder|urothelial|kidney|renal cell"),
  list(label = "Hematologic", kw = "leuk[a]?emia|lymphoma|myeloma"),
  list(label = "Other specific site", kw = "melanoma|skin cancer|pancrea|hepatocellular|liver cancer|esophag|oesophag|gastric|cervical cancer|ovarian|thyroid|neuroblastoma|sarcoma")
)
classify_design <- function(title, abstract, pubtypes) {
  t <- tolower(paste(title, abstract))
  for (r in DESIGN_RULES) if (grepl(r$pt, pubtypes, perl = TRUE) || grepl(r$kw, t, perl = TRUE)) return(r$label)
  "Other / unclear"
}
classify_site <- function(title, abstract) {
  t <- tolower(paste(title, abstract))
  hits <- vapply(SITE_RULES, function(r) grepl(r$kw, t, perl = TRUE), TRUE)
  if (sum(hits) == 1) return(SITE_RULES[[which(hits)]]$label)
  if (sum(hits) > 1) return("Multiple sites")
  "Cancer in general / unspecified"
}
corpus$rule_design <- mapply(classify_design, corpus$title, corpus$abstract, corpus$pubtypes)
corpus$rule_site <- mapply(classify_site, corpus$title, corpus$abstract)
corpus$has_abstract <- nzchar(corpus$abstract)

# ---------------- 3) Validation sample (blind) ----------------
lab_dir <- root_path("data", "labels"); dir.create(lab_dir, showWarnings = FALSE)
tmpl <- file.path(lab_dir, "validation_template.csv")
if (!file.exists(tmpl)) {
  set.seed(20261125)
  pool <- corpus[corpus$has_abstract, ]
  # stratify by rule-predicted design so rare designs appear; cap at 200
  per <- ceiling(200 / length(unique(pool$rule_design)))
  idx <- unlist(lapply(split(seq_len(nrow(pool)), pool$rule_design), function(i) if (length(i) <= per) i else sample(i, per)))
  if (length(idx) < 200) idx <- c(idx, sample(setdiff(seq_len(nrow(pool)), idx), 200 - length(idx)))
  idx <- sample(idx)[1:min(200, length(idx))]
  v <- pool[idx, c("pmid", "year", "title", "abstract")]
  v$human_design <- ""; v$human_site <- ""; v$labeler <- ""; v$notes <- ""
  write.csv(v, tmpl, row.names = FALSE)
  message("Wrote blind validation template: ", nrow(v), " abstracts")
}

labels_path <- file.path(lab_dir, "validation_labels.csv")
bench <- list(status = "awaiting_human_labels",
              message = "Benchmark will appear once data/labels/validation_labels.csv (the completed template) exists.")
if (file.exists(labels_path)) {
  lab <- read.csv(labels_path, stringsAsFactors = FALSE, colClasses = "character")
  lab <- lab[nzchar(lab$human_design) | nzchar(lab$human_site), ]
  m <- merge(lab, corpus[, c("pmid", "rule_design", "rule_site")], by = "pmid")
  bench <- list(status = "complete", n_labeled = nrow(m),
                design = if (any(nzchar(m$human_design))) kappa(m$human_design[nzchar(m$human_design)], m$rule_design[nzchar(m$human_design)]) else NULL,
                site = if (any(nzchar(m$human_site))) kappa(m$human_site[nzchar(m$human_site)], m$rule_site[nzchar(m$human_site)]) else NULL)
  llm_path <- file.path(lab_dir, "llm_predictions.csv")
  if (file.exists(llm_path)) {   # optional LLM classifier (analysis/R/ai_triage_llm.R)
    llm <- read.csv(llm_path, stringsAsFactors = FALSE, colClasses = "character")
    ml <- merge(m, llm, by = "pmid")
    okd <- nzchar(ml$human_design) & !is.na(ml$llm_design) & nzchar(ml$llm_design)
    oks <- nzchar(ml$human_site) & !is.na(ml$llm_site) & nzchar(ml$llm_site)
    bench$llm <- list(model = unique(na.omit(llm$model)), n_missing = sum(is.na(llm$llm_design) | !nzchar(llm$llm_design)),
                      design = if (any(okd)) kappa(ml$human_design[okd], ml$llm_design[okd]) else NULL,
                      site = if (any(oks)) kappa(ml$human_site[oks], ml$llm_site[oks]) else NULL)
  }
}

summ <- function(col) { t <- sort(table(corpus[[col]]), decreasing = TRUE); data.frame(label = names(t), n = as.integer(t)) }
write_site_json(list(counts_by_year = counts, design_counts = summ("rule_design"), site_counts = summ("rule_site"),
                     benchmark = bench,
                     examples = head(corpus[corpus$has_abstract, c("pmid", "year", "title", "rule_design", "rule_site")], 0)),
  "ai_triage.json", list(
    query = QUERY, retrieved_utc = attr(corpus, "retrieved_utc"), n_records = nrow(corpus), n_with_abstract = sum(corpus$has_abstract),
    tool = TOOL, email_supplied = nzchar(EMAIL),
    design_rules = lapply(DESIGN_RULES, function(r) list(label = r$label, publication_types = r$pt, keywords = r$kw)),
    site_rules = lapply(SITE_RULES, function(r) list(label = r$label, keywords = r$kw)),
    validation = list(template = "data/labels/validation_template.csv", n = 200, sampling = "Stratified by rule-predicted design (equal allocation, seed 20261125), abstracts only; template is blind to predictions")))
saveRDS(corpus, file.path(raw, "corpus_classified.rds"))
message("records: ", nrow(corpus), "; benchmark: ", bench$status)
