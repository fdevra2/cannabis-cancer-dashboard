# OPTIONAL LLM classifier for the literature-triage demo (not part of `make all`; run with `make llm-triage`).
# Classifies ONLY the 200 abstracts in data/labels/validation_template.csv, using the same label set and
# definitions as docs/labeling_guide.md, so it can be benchmarked against the human labels exactly like the
# rule-based baseline. Requires ANTHROPIC_API_KEY in .env (gitignored). Each run makes ~200 billed API calls.
#
# Claude API via raw HTTP (R has no official Anthropic SDK): POST /v1/messages, model claude-opus-5-5,
# structured output (output_config.format = json_schema with enums), low effort for classification,
# server-side fallbacks enabled ("default"), refusals recorded as NA rather than guessed.
source("analysis/R/config.R")
suppressMessages({ library(jsonlite); library(httr2) })

env_lines <- if (file.exists(root_path(".env"))) readLines(root_path(".env"), warn = FALSE) else character(0)
key <- sub("^ANTHROPIC_API_KEY=", "", grep("^ANTHROPIC_API_KEY=", env_lines, value = TRUE))
if (!length(key) || !nzchar(key)) key <- Sys.getenv("ANTHROPIC_API_KEY")
if (!nzchar(key)) stop("ANTHROPIC_API_KEY not set (in .env or the environment). The LLM classifier is optional; skipping.")

DESIGNS <- c("Systematic review / meta-analysis", "Randomized / clinical trial", "Preclinical (cell/animal)", "Cohort",
             "Case-control", "Cross-sectional / survey", "Case report / series", "Narrative review / commentary", "Other / unclear")
SITES <- c("Lung", "Head & neck / oral", "Testicular", "Breast", "Prostate", "Colorectal", "Brain / glioma", "Bladder / urologic",
           "Hematologic", "Other specific site", "Multiple sites", "Cancer in general / unspecified")
guide <- paste(readLines(root_path("docs", "labeling_guide.md"), warn = FALSE), collapse = "\n")
SYSTEM <- paste0(
  "You classify PubMed abstracts for a literature-triage benchmark. Follow the labelling guide below exactly, ",
  "use only the title and abstract provided, and pick exactly one design label and one site label.\n\n", guide)
SCHEMA <- list(type = "object", additionalProperties = FALSE, required = list("design", "site"),
               properties = list(design = list(type = "string", enum = as.list(DESIGNS)),
                                 site = list(type = "string", enum = as.list(SITES))))

classify <- function(title, abstract) {
  body <- list(
    model = "claude-opus-5-5", max_tokens = 4000,
    system = SYSTEM,
    messages = list(list(role = "user", content = paste0("Title: ", title, "\n\nAbstract: ", abstract))),
    output_config = list(effort = "low", format = list(type = "json_schema", schema = SCHEMA)),
    fallbacks = "default")
  req <- request("https://api.anthropic.com/v1/messages") |>
    req_headers(`x-api-key` = key, `anthropic-version` = "2026-10-21",
                `anthropic-beta` = "server-side-fallback-2026-07-01", `content-type` = "application/json") |>
    req_body_json(body, auto_unbox = TRUE) |>
    req_retry(max_tries = 4, is_transient = function(r) resp_status(r) %in% c(408, 409, 429, 500, 502, 503, 529)) |>
    req_error(is_error = function(r) FALSE)
  r <- req_perform(req)
  if (resp_status(r) != 200) return(list(design = NA, site = NA, stop = paste("http", resp_status(r)), model = NA))
  j <- resp_body_json(r)
  if (identical(j$stop_reason, "refusal")) return(list(design = NA, site = NA, stop = "refusal", model = j$model))
  txt <- paste(vapply(Filter(function(b) identical(b$type, "text"), j$content), function(b) b$text, ""), collapse = "")
  out <- tryCatch(fromJSON(txt), error = function(e) NULL)
  if (is.null(out) || !(out$design %in% DESIGNS) || !(out$site %in% SITES))
    return(list(design = NA, site = NA, stop = paste("unparsed", j$stop_reason), model = j$model))
  list(design = out$design, site = out$site, stop = j$stop_reason, model = j$model)
}

v <- read.csv(root_path("data", "labels", "validation_template.csv"), stringsAsFactors = FALSE, colClasses = "character")
res <- lapply(seq_len(nrow(v)), function(i) { if (i %% 20 == 0) message(i, "/", nrow(v)); classify(v$title[i], v$abstract[i]) })
out <- data.frame(pmid = v$pmid, llm_design = vapply(res, `[[`, "", "design"), llm_site = vapply(res, `[[`, "", "site"),
                  stop_reason = vapply(res, function(x) as.character(x$stop), ""), model = vapply(res, function(x) as.character(x$model), ""))
write.csv(out, root_path("data", "labels", "llm_predictions.csv"), row.names = FALSE)
message("LLM predictions written: ", sum(!is.na(out$llm_design)), " classified; ", sum(is.na(out$llm_design)), " missing")
