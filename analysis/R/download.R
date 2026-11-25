# Download public NHANES XPT files + their codebook HTML, and maintain a checksum manifest.
# Usage: Rscript analysis/R/download.R [--refresh]
#   Without --refresh: files already on disk are re-hashed and compared with MANIFEST.csv;
#   a mismatch is an error (CDC revised a file -> results may change; rerun with --refresh
#   deliberately and review).
source("analysis/R/config.R")

args <- commandArgs(TRUE)
refresh <- "--refresh" %in% args

raw_dir <- root_path("data", "raw")
xpt_dir <- file.path(raw_dir, "xpt")
cb_dir  <- file.path(raw_dir, "codebooks")
dir.create(xpt_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(cb_dir, recursive = TRUE, showWarnings = FALSE)
manifest_path <- file.path(raw_dir, "MANIFEST.csv")

old <- if (file.exists(manifest_path)) read.csv(manifest_path, stringsAsFactors = FALSE) else NULL

fetch <- function(url, dest) {
  for (i in 1:3) {
    ok <- tryCatch({
      utils::download.file(url, dest, mode = "wb", quiet = TRUE, method = "libcurl")
      TRUE
    }, error = function(e) FALSE, warning = function(w) FALSE)
    if (ok && file.exists(dest) && file.size(dest) > 2000) return(invisible(TRUE))
    Sys.sleep(2 * i)
  }
  stop("Failed to download ", url)
}

fl <- file_list()
rows <- list()
for (i in seq_len(nrow(fl))) {
  f <- fl[i, ]
  for (kind in c("xpt", "htm")) {
    url  <- if (kind == "xpt") f$xpt_url else f$htm_url
    dest <- file.path(if (kind == "xpt") xpt_dir else cb_dir, paste0(f$file, ".", kind))
    if (!file.exists(dest) || refresh) {
      message("Downloading ", url)
      fetch(url, dest)
      when <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
    } else {
      when <- NA
    }
    sha <- digest::digest(file = dest, algo = "sha256")
    prev <- if (!is.null(old)) old[old$path == basename(dest), , drop = FALSE] else NULL
    if (!refresh && !is.null(prev) && nrow(prev) == 1 && kind == "xpt" && prev$sha256 != sha) {
      stop("Checksum changed for ", basename(dest), " (CDC may have revised it). ",
           "Review and rerun with --refresh.")
    }
    if (is.na(when)) when <- if (!is.null(prev) && nrow(prev) == 1) prev$downloaded_utc else
      format(file.mtime(dest), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
    rows[[length(rows) + 1]] <- data.frame(
      component = f$component, cycle = f$suffix, kind = kind, path = basename(dest),
      url = url, bytes = file.size(dest), sha256 = sha, downloaded_utc = when,
      stringsAsFactors = FALSE)
  }
}
man <- do.call(rbind, rows)
write.csv(man, manifest_path, row.names = FALSE)
message("Manifest: ", nrow(man), " files -> ", manifest_path)
