# Weighted prevalence estimates (NCHS reliability applied) for the site.
#   prev_ever_by_cycle.json   ever-use by cycle (first chart)
#   prevalence.json           measures x grouping variables
#   reverse_causation.json    timing of cannabis initiation vs first cancer diagnosis; current use by time since dx
source("analysis/R/analysis_vars.R")
source("analysis/R/export_utils.R")

prev_by <- function(des, var, groups, group_name) {
  do.call(rbind, lapply(names(groups), function(g) {
    r <- nchs_proportion(des, var, groups[[g]])
    cbind(data.frame(measure = var, group_var = group_name, group = g, stringsAsFactors = FALSE), r)
  }))
}

MEASURES <- list(
  mj_ever       = list(label = "Ever used cannabis", cycles = CYCLES$suffix),
  mj_regular    = list(label = "Regular cannabis use (monthly for ≥1 year), ever", cycles = c("F", "G", "H", "I", "J")),
  mj_past30     = list(label = "Used cannabis in past 30 days", cycles = CYCLES$suffix),
  mj_daily      = list(label = "Used cannabis on 20–30 of past 30 days", cycles = CYCLES$suffix),
  smk_ever      = list(label = "Ever smoked cigarettes (≥100 lifetime)", cycles = CYCLES$suffix),
  smk_current   = list(label = "Currently smokes cigarettes", cycles = CYCLES$suffix),
  couse_ever    = list(label = "Ever used both cannabis and cigarettes", cycles = CYCLES$suffix),
  couse_current = list(label = "Current co-use (cannabis past 30 days + current smoking)", cycles = CYCLES$suffix),
  cancer_any    = list(label = "Ever told had cancer (any type)", cycles = CYCLES$suffix),
  cancer_excl_skin = list(label = "Ever told had cancer, excluding non-melanoma skin", cycles = CYCLES$suffix),
  cancer_excl_cervical = list(label = "Ever told had cancer, excluding cervical", cycles = CYCLES$suffix)
)

if (sys.nframe() == 0) {
  d <- load_analysis()
  des <- make_design(d)
  v <- des$variables
  base <- v$duq_answered == 1 & v$age >= 20 & v$age <= 59 & v$wt_pooled > 0
  base[is.na(base)] <- FALSE

  # 1) First chart: ever-use by cycle
  cyc <- setNames(lapply(CYCLES$suffix, function(s) base & v$cycle == s), CYCLES$label)
  write_site_json(prev_by(des, "mj_ever", cyc, "cycle"), "prev_ever_by_cycle.json", list(
    title = "Ever used marijuana or hashish (DUQ200), by NHANES cycle",
    sample = SAMPLE_PRIMARY, design = DESIGN_NOTE, reliability = RELIABILITY_NOTE,
    source_files = "DEMO_D-J, DUQ_D-J (see data/raw/MANIFEST.csv)"))

  # 2) Measures x groups
  groupings <- list(
    overall = list(All = base),
    cycle = setNames(lapply(CYCLES$suffix, function(s) base & v$cycle == s), CYCLES$label),
    age_grp = setNames(lapply(levels(v$age_grp), function(a) base & v$age_grp %in% a), levels(v$age_grp)),
    sex = setNames(lapply(levels(v$sex), function(a) base & v$sex %in% a), levels(v$sex)),
    race = setNames(lapply(levels(v$race), function(a) base & v$race %in% a), levels(v$race)),
    mj_ever = setNames(lapply(levels(v$mj_ever_f), function(a) base & v$mj_ever_f %in% a), levels(v$mj_ever_f)),
    smk_status = setNames(lapply(levels(v$smk_status), function(a) base & v$smk_status %in% a),
                          paste(levels(v$smk_status), "cigarette smoker")))
  rows <- list()
  for (m in names(MEASURES)) {
    inc <- v$cycle %in% MEASURES[[m]]$cycles
    for (g in names(groupings)) {
      if (g == "mj_ever" && grepl("^(mj_|couse)", m)) next
      if (g == "smk_status" && grepl("^(smk_|couse)", m)) next
      gr <- lapply(groupings[[g]], function(x) x & inc)
      if (g == "cycle") gr <- gr[names(gr) %in% CYCLES$label[CYCLES$suffix %in% MEASURES[[m]]$cycles]]
      rows[[length(rows) + 1]] <- prev_by(des, m, gr, g)
    }
    message("prevalence: ", m)
  }
  prev <- do.call(rbind, rows)
  write_site_json(prev, "prevalence.json", list(
    sample = SAMPLE_PRIMARY, design = DESIGN_NOTE, reliability = RELIABILITY_NOTE,
    measures = lapply(MEASURES, function(x) list(label = x$label,
      cycles = CYCLES$label[CYCLES$suffix %in% x$cycles]))))

  # 3) Reverse-causation lens
  rc <- list()
  for (tv in c("first_use_timing", "regular_timing")) {
    known <- base & !is.na(v[[tv]])
    for (lev in c("Before diagnosis", "Same year", "After diagnosis")) {
      des$variables$tmp_ind <- as.integer(v[[tv]] == lev)
      r <- nchs_proportion(des, "tmp_ind", known)
      rc[[length(rc) + 1]] <- cbind(data.frame(measure = tv, group_var = "timing", group = lev,
                                               count = sum(known & v[[tv]] %in% lev)), r)
    }
  }
  # current (past-30-day) use among cancer survivors by years since first diagnosis, and among never-diagnosed
  surv <- base & v$cancer_any %in% 1
  for (lev in levels(v$ysd_cat)) {
    r <- nchs_proportion(des, "mj_past30", surv & v$ysd_cat %in% lev)
    rc[[length(rc) + 1]] <- cbind(data.frame(measure = "mj_past30", group_var = "years_since_dx", group = lev,
                                             count = NA), r)
  }
  r <- nchs_proportion(des, "mj_past30", base & v$cancer_any %in% 0)
  rc[[length(rc) + 1]] <- cbind(data.frame(measure = "mj_past30", group_var = "years_since_dx",
                                           group = "No cancer history", count = NA), r)
  des$variables$tmp_ind <- NULL
  write_site_json(do.call(rbind, rc), "reverse_causation.json", list(
    sample = SAMPLE_PRIMARY, design = DESIGN_NOTE, reliability = RELIABILITY_NOTE,
    timing_note = "Ages are recorded in whole years, so 'Same year' cannot be ordered. First use = DUQ210 (all cycles); regular use onset = DUQ213 (2009–2018). Diagnosis age = earliest reported cancer diagnosis (MCQ240*/MCD240A–C).",
    limitation = "First-use timing cannot detect people who resumed or increased use after diagnosis."))
}
