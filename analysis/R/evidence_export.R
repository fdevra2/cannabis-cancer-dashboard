# Export VERIFIED evidence rows + NASEM grades to the site. UNVERIFIED rows never reach the site.
source("analysis/R/literature.R")
source("analysis/R/export_utils.R")
ev <- read.csv(root_path("data", "evidence.csv"), stringsAsFactors = FALSE, colClasses = "character", encoding = "UTF-8")
gr <- read.csv(root_path("data", "evidence_grades.csv"), stringsAsFactors = FALSE, colClasses = "character", encoding = "UTF-8")
v <- ev[ev$status == "VERIFIED", ]
for (k in c("estimate", "lcl", "ucl")) v[[k]] <- as.numeric(v[[k]])
v$year <- as.integer(v$year)
src <- read.csv(root_path("data", "literature_sources.csv"), stringsAsFactors = FALSE, colClasses = "character")
recs <- lapply(unique(v$doi), function(d) fromJSON(file.path(lit_dir(), paste0(safe_doi(d), ".json"))))
names(recs) <- unique(v$doi)
v$journal <- vapply(v$doi, function(d) recs[[d]]$journal %||% "", "")
v$authors <- vapply(v$doi, function(d) recs[[d]]$authors %||% "", "")
v$title <- vapply(v$doi, function(d) recs[[d]]$title %||% "", "")
write_site_json(v, "evidence.json", list(
  note = "Only rows whose DOI was fetched and whose estimate, CI and quoted sentence were matched verbatim to the archived source text (test-evidence.R).",
  n_unverified_excluded = sum(ev$status != "VERIFIED"),
  direction_rule = "higher risk: lower CI bound > 1; lower risk: upper CI bound < 1; otherwise no clear association",
  grades = gr,
  nasem = list(citation = "National Academies of Sciences, Engineering, and Medicine. 2017. The Health Effects of Cannabis and Cannabinoids: The Current State of Evidence and Recommendations for Research. Washington, DC: The National Academies Press.",
               doi = "10.17226/24625")))
