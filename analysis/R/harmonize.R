# Harmonize NHANES 2005-2018 public files into one pooled person-level file.
# Output: data/derived/nhanes_pooled.rds
#
# IMPORTANT: the output keeps EVERY DEMO participant (all ages, interviewed-only included),
# so that the survey design can be built on the full pooled sample and analytic samples
# are taken with subset(design, ...). See analysis/R/design.R.
#
# Refused / Don't know codes are taken from the parsed CDC codebooks (they differ by cycle,
# e.g. DUQ210 uses 77/99 in 2005-2006 and 777/999 later), not hard-coded.
source("analysis/R/config.R")
suppressMessages({ library(haven); library(dplyr) })

cb_vals <- read.csv(root_path("data", "derived", "codebook_values.csv"), stringsAsFactors = FALSE)
special <- cb_vals[grepl("^(refused|don't know|dont know)$", tolower(cb_vals$description)), ]
special_codes <- split(suppressWarnings(as.numeric(special$code)),
                       paste(special$variable, special$cycle))

read_comp <- function(comp, s) {
  p <- root_path("data", "raw", "xpt", paste0(comp, "_", s, ".xpt"))
  if (!file.exists(p)) return(NULL)
  d <- read_xpt(p)
  names(d) <- toupper(names(d))
  d <- zap_labels(d)
  # blank out refused / don't know using this cycle's codebook
  for (v in setdiff(names(d), "SEQN")) {
    sc <- special_codes[[paste(v, s)]]
    if (!is.null(sc) && is.numeric(d[[v]])) d[[v]][d[[v]] %in% sc] <- NA
  }
  d
}

col <- function(d, v) if (v %in% names(d)) d[[v]] else rep(NA_real_, nrow(d))

yn <- function(x) ifelse(x == 1, 1L, ifelse(x == 2, 0L, NA_integer_))

# Convert quantity + unit (1=days,2=weeks,3=months,4=years) to days
to_days <- function(q, u) {
  ifelse(u == 1, q, ifelse(u == 2, q * 7, ifelse(u == 3, q * 30.4375, ifelse(u == 4, q * 365.25, NA))))
}

# MCQ240 letter suffix -> MCQ230 cancer-type code (verified against codebook labels:
# A bladder(10) ... Z stomach(35), AA testis(36), BB thyroid(37), CC uterus(38), DD other(39))
MCQ240_SUFFIX <- c(LETTERS, "AA", "BB", "CC", "DD")
MCQ240_CODE   <- 10:39
SKIN_CODES     <- c(32, 33)   # non-melanoma skin; skin, unknown kind
CERVICAL_CODE  <- 15

harmonize_cycle <- function(s) {
  demo <- read_comp("DEMO", s)
  d <- demo |> transmute(
    SEQN, cycle = s,
    cycle_start = CYCLES$start[CYCLES$suffix == s],
    RIDSTATR, WTMEC2YR, WTINT2YR, SDMVSTRA, SDMVPSU,
    age = RIDAGEYR,
    sex = factor(ifelse(RIAGENDR == 1, "Male", "Female"), levels = c("Male", "Female")),
    race = factor(RIDRETH1, levels = 1:5, labels = c("Mexican American", "Other Hispanic",
      "Non-Hispanic White", "Non-Hispanic Black", "Other/Multiracial")),
    educ = factor(case_when(DMDEDUC2 %in% 1:2 ~ "Less than high school",
                            DMDEDUC2 == 3 ~ "High school/GED",
                            DMDEDUC2 == 4 ~ "Some college/AA",
                            DMDEDUC2 == 5 ~ "College graduate+"),
                  levels = c("Less than high school", "High school/GED", "Some college/AA", "College graduate+")),
    pir = INDFMPIR,
    pregnant = as.integer(!is.na(col(demo, "RIDEXPRG")) & col(demo, "RIDEXPRG") == 1)
  )

  # ---- Marijuana (DUQ) ----
  duq <- read_comp("DUQ", s)
  last_days <- to_days(col(duq, "DUQ220Q"), col(duq, "DUQ220U"))
  ever <- yn(col(duq, "DUQ200"))
  days30 <- col(duq, "DUQ230")
  regular <- yn(col(duq, "DUQ211"))
  since_reg_days <- to_days(col(duq, "DUQ215Q"), col(duq, "DUQ215U"))
  u <- data.frame(
    SEQN = duq$SEQN,
    mj_ever = ever,
    mj_age_first = col(duq, "DUQ210"),
    mj_last_days = ifelse(ever == 1, last_days, NA),
    mj_past12m = ifelse(ever == 0, 0L, ifelse(is.na(last_days), NA, as.integer(last_days <= 365.25))),
    mj_past30 = ifelse(ever == 0, 0L, ifelse(is.na(last_days), NA, as.integer(last_days <= 30))),
    # DUQ230 is asked only when last use <= 30 days; others used on 0 of the past 30 days
    mj_days30 = ifelse(ever == 0, 0, ifelse(!is.na(days30), days30,
                  ifelse(!is.na(last_days) & last_days > 30, 0, NA))),
    # Regular use (DUQ211, 2009+ only): never-users are not regular users
    mj_regular = if ("DUQ211" %in% names(duq)) ifelse(ever == 0, 0L, regular) else NA_integer_,
    mj_age_regular = col(duq, "DUQ213"),
    mj_years_since_regular = since_reg_days / 365.25,
    mj_freq_code = col(duq, "DUQ217"),
    mj_joints_code = col(duq, "DUQ219")
  )
  d <- left_join(d, u, by = "SEQN")
  d$duq_answered <- as.integer(d$SEQN %in% duq$SEQN[!is.na(col(duq, "DUQ200"))])

  # Crude "joint-year-like" proxy (2009+): uses/day during regular use x joints/day x years of regular use.
  # DUQ217 category midpoints (times/month): 1->1, 2->2.5, 3->6, 4->16.5, 5->27.5
  # DUQ219 joints/day: 1->1, 2->2, 3->4 (3-5), 4->6 (open-ended "6 or more": lower bound used)
  fmid <- c(1, 2.5, 6, 16.5, 27.5)[d$mj_freq_code]
  jmid <- c(1, 2, 4, 6)[d$mj_joints_code]
  dur <- (d$age - d$mj_years_since_regular) - d$mj_age_regular
  dur[!is.na(dur) & dur < 0] <- 0
  d$mj_regular_years <- ifelse(d$mj_regular == 1, dur, ifelse(d$mj_regular == 0, 0, NA))
  d$mj_joint_years <- ifelse(d$mj_regular == 0, 0, (fmid / 30.4375) * jmid * d$mj_regular_years)
  d$mj_joint_years[d$cycle %in% c("D", "E")] <- NA

  # ---- Tobacco (SMQ) ----
  smq <- read_comp("SMQ", s)
  sm <- data.frame(SEQN = smq$SEQN,
    smk_status = factor(case_when(
      col(smq, "SMQ020") == 2 ~ "Never",
      col(smq, "SMQ020") == 1 & col(smq, "SMQ040") == 3 ~ "Former",
      col(smq, "SMQ020") == 1 & col(smq, "SMQ040") %in% 1:2 ~ "Current"),
      levels = c("Never", "Former", "Current")),
    cigs_per_day_30 = col(smq, "SMD650"),
    ecig_ever = yn(col(smq, "SMQ900")))
  d <- left_join(d, sm, by = "SEQN")

  # ---- Alcohol (ALQ) ----
  alq <- read_comp("ALQ", s)
  if (s == "J") {
    perwk <- c(`1` = 7, `2` = 5.5, `3` = 3.5, `4` = 2, `5` = 1, `6` = 2.5 / 4.345, `7` = 1 / 4.345,
               `8` = 9 / 52.18, `9` = 4.5 / 52.18, `10` = 1.5 / 52.18)
    f <- col(alq, "ALQ121")
    freq_wk <- ifelse(f == 0, 0, perwk[as.character(f)])
    none <- (col(alq, "ALQ111") == 2) | (f == 0)
  } else {
    q <- col(alq, "ALQ120Q"); un <- col(alq, "ALQ120U")
    freq_wk <- ifelse(q == 0, 0, ifelse(un == 1, q, ifelse(un == 2, q / 4.345, ifelse(un == 3, q / 52.18, NA))))
    none <- (q == 0) | (is.na(q) & col(alq, "ALQ101") == 2 & col(alq, "ALQ110") == 2)
  }
  dpd <- col(alq, "ALQ130")
  drinks_wk <- ifelse(!is.na(none) & none, 0, freq_wk * dpd)
  al <- data.frame(SEQN = alq$SEQN, drinks_wk = as.numeric(drinks_wk))
  d <- left_join(d, al, by = "SEQN")
  d$alc_cat <- factor(case_when(
    d$drinks_wk == 0 ~ "None in past year",
    d$sex == "Female" & d$drinks_wk <= 7 ~ "Moderate",
    d$sex == "Male" & d$drinks_wk <= 14 ~ "Moderate",
    !is.na(d$drinks_wk) ~ "Heavy"),
    levels = c("None in past year", "Moderate", "Heavy"))

  # ---- Insurance (HIQ) ----
  hiq <- read_comp("HIQ", s)
  d <- left_join(d, data.frame(SEQN = hiq$SEQN, insured = yn(col(hiq, "HIQ011"))), by = "SEQN")

  # ---- Cancer (MCQ) ----
  mcq <- read_comp("MCQ", s)
  types <- as.matrix(mcq[, intersect(paste0("MCQ230", c("A", "B", "C", "D")), names(mcq)), drop = FALSE])
  types[!(types %in% 10:39)] <- NA   # drop 66 (>3 kinds), 77, 99
  anytype <- rowSums(!is.na(types)) > 0
  has_code <- function(codes) rowSums(matrix(types %in% codes, nrow = nrow(types))) > 0
  nonskin <- rowSums(matrix(!is.na(types) & !(types %in% SKIN_CODES), nrow = nrow(types))) > 0
  noncerv <- rowSums(matrix(!is.na(types) & types != CERVICAL_CODE, nrow = nrow(types))) > 0
  nonskin_noncerv <- rowSums(matrix(!is.na(types) & !(types %in% c(SKIN_CODES, CERVICAL_CODE)), nrow = nrow(types))) > 0
  ca <- yn(col(mcq, "MCQ220"))

  # Age at diagnosis. D-I: one variable per site (MCQ240A..DD, plus MCQ240DK = unknown kind).
  # J: MCD240A-C = age at 1st/2nd/3rd reported cancer (16 = "16 or younger", 80 = "80+").
  if (s == "J") {
    agem <- as.matrix(mcq[, intersect(c("MCD240A", "MCD240B", "MCD240C"), names(mcq)), drop = FALSE])
    typem <- types[, 1:ncol(agem), drop = FALSE]
  } else {
    sfx <- MCQ240_SUFFIX[paste0("MCQ240", MCQ240_SUFFIX) %in% names(mcq)]
    agem <- as.matrix(mcq[, paste0("MCQ240", sfx), drop = FALSE])
    typem <- matrix(rep(MCQ240_CODE[match(sfx, MCQ240_SUFFIX)], each = nrow(mcq)), nrow = nrow(mcq))
    if ("MCQ240DK" %in% names(mcq)) {
      agem <- cbind(agem, mcq$MCQ240DK); typem <- cbind(typem, NA)
    }
  }
  agem[agem > 120] <- NA
  rmin <- function(m) { r <- suppressWarnings(apply(m, 1, min, na.rm = TRUE)); r[!is.finite(r)] <- NA; r }
  m_nonskin <- agem; m_nonskin[!is.na(typem) & typem %in% SKIN_CODES] <- NA
  m_nonskin_noncerv <- m_nonskin; m_nonskin_noncerv[!is.na(typem) & typem == CERVICAL_CODE] <- NA

  cancer <- data.frame(
    SEQN = mcq$SEQN,
    cancer_any = ca,
    # Exclusion outcomes: a person whose ONLY reported cancers are the excluded type(s) is a non-case.
    # Cases with unknown type (MCQ220 = yes but no valid MCQ230 code) remain cases.
    cancer_excl_skin = ifelse(ca == 1 & anytype & !nonskin, 0L, ca),
    cancer_excl_cervical = ifelse(ca == 1 & anytype & !noncerv, 0L, ca),
    cancer_excl_skin_cervical = ifelse(ca == 1 & anytype & !nonskin_noncerv, 0L, ca),
    cancer_type_known = as.integer(anytype),
    cancer_lung = as.integer(has_code(23)),
    cancer_cervical = as.integer(has_code(CERVICAL_CODE)),
    cancer_skin_nm = as.integer(has_code(SKIN_CODES)),
    cancer_melanoma = as.integer(has_code(25)),
    cancer_breast = as.integer(has_code(14)),
    cancer_testis = as.integer(has_code(36)),
    cancer_thyroid = as.integer(has_code(37)),
    cancer_mouth_larynx = as.integer(has_code(c(20, 26))),
    cancer_first_type = types[, 1],
    age_dx_first = rmin(agem),
    age_dx_first_nonskin = rmin(m_nonskin),
    n_cancer_types = rowSums(!is.na(types))
  )
  d <- left_join(d, cancer, by = "SEQN")

  # ---- Sexual behavior (SXQ; 2005-2016 public) ----
  sxq <- read_comp("SXQ", s)
  if (!is.null(sxq)) {
    ever_sex <- if ("SXD021" %in% names(sxq)) yn(sxq$SXD021) else yn(col(sxq, "SXQ021"))
    male_partners_f <- if ("SXD101" %in% names(sxq)) sxq$SXD101 else col(sxq, "SXQ101")  # women: male partners
    female_partners_f <- col(sxq, "SXQ130")                                               # women: female partners
    female_partners_m <- col(sxq, "SXD171")                                               # men: female partners
    male_partners_m <- col(sxq, "SXQ410")                                                 # men: male partners
    s2 <- function(a, b) ifelse(is.na(a) & is.na(b), NA, pmax(a, 0, na.rm = TRUE) + pmax(b, 0, na.rm = TRUE))
    sx <- data.frame(SEQN = sxq$SEQN, ever_sex = ever_sex,
                     partners_f = s2(male_partners_f, female_partners_f),
                     partners_m = s2(female_partners_m, male_partners_m),
                     age_first_sex = col(sxq, "SXD031"))
    d <- left_join(d, sx, by = "SEQN")
    d$partners_life <- ifelse(d$ever_sex == 0, 0, ifelse(d$sex == "Female", d$partners_f, d$partners_m))
    d$partners_f <- NULL; d$partners_m <- NULL
  } else {
    d$ever_sex <- NA_integer_; d$partners_life <- NA_real_; d$age_first_sex <- NA_real_
  }
  d$partners_cat <- factor(cut(d$partners_life, c(-Inf, 1, 4, 9, Inf), labels = c("0-1", "2-4", "5-9", "10+")),
                           levels = c("0-1", "2-4", "5-9", "10+"))

  # ---- Measured HPV ----
  pos <- function(x) ifelse(x == 1, 1L, ifelse(x == 2, 0L, NA_integer_))   # 3 = not evaluated / inadequate
  or <- read_comp("ORHPV", s)
  if (!is.null(or)) d <- left_join(d, data.frame(SEQN = or$SEQN, hpv_oral_any = pos(or$ORXHPV),
    hpv_oral_1618 = ifelse(is.na(pos(or$ORXHPV)), NA, as.integer(pmax(pos(or$ORXH16), pos(or$ORXH18), na.rm = TRUE) == 1))), by = "SEQN")
  else { d$hpv_oral_any <- NA_integer_; d$hpv_oral_1618 <- NA_integer_ }
  vs <- read_comp("HPVSWR", s)
  if (!is.null(vs) && "LBDRPCR" %in% names(vs)) d <- left_join(d, data.frame(SEQN = vs$SEQN, hpv_vag_any = pos(vs$LBDRPCR),
    hpv_vag_1618 = ifelse(is.na(pos(vs$LBDRPCR)), NA, as.integer(pmax(pos(col(vs, "LBDR16")), pos(col(vs, "LBDR18")), na.rm = TRUE) == 1))), by = "SEQN")
  else { d$hpv_vag_any <- NA_integer_; d$hpv_vag_1618 <- NA_integer_ }
  sr <- read_comp("HPVSRM", s)
  if (!is.null(sr)) d <- left_join(d, data.frame(SEQN = sr$SEQN,
    hpv_sero_1618 = as.integer(pmax(pos(sr$LBXPV16), pos(sr$LBXPV18), na.rm = TRUE) == 1)), by = "SEQN")
  else d$hpv_sero_1618 <- NA_integer_

  # ---- Body measures (BMX) ----
  bmx <- read_comp("BMX", s)
  d <- left_join(d, data.frame(SEQN = bmx$SEQN, bmi = col(bmx, "BMXBMI")), by = "SEQN")

  d
}

if (sys.nframe() == 0) {
  pooled <- bind_rows(lapply(CYCLES$suffix, harmonize_cycle))
  pooled$cycle_label <- factor(CYCLES$label[match(pooled$cycle, CYCLES$suffix)], levels = CYCLES$label)
  saveRDS(pooled, root_path("data", "derived", "nhanes_pooled.rds"))
  message("Pooled rows: ", nrow(pooled), "; DUQ answered: ", sum(pooled$duq_answered))
}
