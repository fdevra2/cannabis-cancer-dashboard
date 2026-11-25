# Analysis variables derived on the FULL pooled file (before the design is built).
source("analysis/R/design.R")

add_analysis_vars <- function(d) {
  d$age2 <- (d$age - 40)^2 / 100
  d$age_grp <- factor(cut(d$age, c(19, 29, 39, 49, 59), labels = c("20–29", "30–39", "40–49", "50–59")),
                      levels = c("20–29", "30–39", "40–49", "50–59"))
  d$cycle_f <- factor(d$cycle)
  d$pir_cat <- cut(d$pir, c(-Inf, 1, 2, 4, Inf), right = FALSE,
                   labels = c("<1.00", "1.00–1.99", "2.00–3.99", "≥4.00"))
  # Sensitivity: income-to-poverty ratio with an explicit "Missing" category (instead of complete-case)
  d$pir_cat_m <- factor(ifelse(is.na(d$pir_cat), "Missing", as.character(d$pir_cat)),
                        levels = c(levels(d$pir_cat), "Missing"))
  d$smk_ever <- ifelse(d$smk_status %in% c("Former", "Current"), 1L, ifelse(d$smk_status == "Never", 0L, NA_integer_))
  d$smk_current <- ifelse(d$smk_status == "Current", 1L, ifelse(d$smk_status %in% c("Never", "Former"), 0L, NA_integer_))
  d$mj_daily <- ifelse(is.na(d$mj_days30), NA_integer_, as.integer(d$mj_days30 >= 20))
  d$couse_current <- ifelse(is.na(d$mj_past30) | is.na(d$smk_current), NA_integer_, as.integer(d$mj_past30 == 1 & d$smk_current == 1))
  d$couse_ever <- ifelse(is.na(d$mj_ever) | is.na(d$smk_ever), NA_integer_, as.integer(d$mj_ever == 1 & d$smk_ever == 1))
  d$mj_ever_f <- factor(ifelse(d$mj_ever == 1, "Ever used cannabis", "Never used cannabis"),
                        levels = c("Never used cannabis", "Ever used cannabis"))

  # Headline exposure contrasts: each definition vs NEVER users (others in between are set to NA).
  never <- d$mj_ever == 0
  d$x_ever <- d$mj_ever
  d$x_regular <- ifelse(never, 0L, ifelse(d$mj_regular == 1, 1L, NA_integer_))
  d$x_past30 <- ifelse(never, 0L, ifelse(d$mj_past30 == 1, 1L, NA_integer_))
  d$x_heavy <- ifelse(never & d$cycle %in% c("F", "G", "H", "I", "J"), 0L,
                      ifelse(d$mj_joint_years >= 20, 1L, NA_integer_))

  # Categorical exposure definitions (dose-response), reference = never users.
  d$mj_days_cat <- factor(ifelse(never, "Never used",
                   ifelse(is.na(d$mj_days30), NA,
                   ifelse(d$mj_days30 == 0, "Ever, not in past 30 days",
                   ifelse(d$mj_days30 < 20, "1–19 of past 30 days", "20–30 of past 30 days")))),
                   levels = c("Never used", "Ever, not in past 30 days", "1–19 of past 30 days", "20–30 of past 30 days"))
  d$mj_jy_cat <- factor(ifelse(!(d$cycle %in% c("F", "G", "H", "I", "J")), NA,
                 ifelse(never, "Never used",
                 ifelse(d$mj_regular == 0, "Ever, never regular",
                 ifelse(is.na(d$mj_joint_years), NA,
                 ifelse(d$mj_joint_years < 5, "Regular, <5 joint-years",
                 ifelse(d$mj_joint_years < 20, "Regular, 5–19.9 joint-years", "Regular, ≥20 joint-years")))))),
                 levels = c("Never used", "Ever, never regular", "Regular, <5 joint-years",
                            "Regular, 5–19.9 joint-years", "Regular, ≥20 joint-years"))

  # Literature-based joint-year cut-offs (>=1 joint-year: "ever use" definition in Ghasemiesfe et al. 2019,
  # doi:10.1001/jamanetworkopen.2019.16318; >=10 joint-years: Zhang et al. 2015, doi:10.1002/ijc.29036).
  # Ever-users who never used regularly have 0 joint-years (-> "<1").
  d$mj_jy_lit_cat <- factor(ifelse(!(d$cycle %in% c("F", "G", "H", "I", "J")), NA,
                     ifelse(never, "Never used",
                     ifelse(d$mj_regular == 0, "Ever, <1 joint-year",
                     ifelse(is.na(d$mj_joint_years), NA,
                     ifelse(d$mj_joint_years < 1, "Ever, <1 joint-year",
                     ifelse(d$mj_joint_years < 10, "1–9.9 joint-years", "≥10 joint-years")))))),
                     levels = c("Never used", "Ever, <1 joint-year", "1–9.9 joint-years", "≥10 joint-years"))

  # Reverse-causation timing (cases only). Ages are whole years, so "same" is ambiguous.
  timing <- function(age_use, age_dx) ifelse(is.na(age_use) | is.na(age_dx), NA_character_,
                                       ifelse(age_use < age_dx, "Before diagnosis",
                                       ifelse(age_use == age_dx, "Same year", "After diagnosis")))
  d$first_use_timing <- ifelse(d$cancer_any == 1 & d$mj_ever == 1, timing(d$mj_age_first, d$age_dx_first), NA)
  d$regular_timing <- ifelse(d$cancer_any == 1 & d$mj_regular == 1, timing(d$mj_age_regular, d$age_dx_first), NA)
  d$years_since_dx <- ifelse(d$cancer_any == 1, d$age - d$age_dx_first, NA)
  d$ysd_cat <- factor(cut(d$years_since_dx, c(-1, 4, 9, Inf), labels = c("0–4 years", "5–9 years", "10+ years")),
                      levels = c("0–4 years", "5–9 years", "10+ years"))
  d
}

# Covariate blocks for the confounding toggle / specification curve.
BLOCKS <- list(
  demo    = c("age", "age2", "sex", "race", "cycle_f"),
  tobacco = c("smk_status"),
  alcohol = c("alc_cat"),
  ses     = c("educ", "pir_cat", "insured")
)
BLOCK_LABELS <- c(demo = "Demographics (age, sex, race/ethnicity, survey cycle)",
                  tobacco = "Tobacco (never/former/current cigarette smoking)",
                  alcohol = "Alcohol (none / moderate / heavy in past year)",
                  ses = "Socioeconomic (education, income-to-poverty ratio, health insurance)")

OUTCOMES <- c(cancer_any = "Any cancer",
              cancer_excl_skin = "Cancer excluding non-melanoma skin",
              cancer_excl_cervical = "Cancer excluding cervical",
              cancer_excl_skin_cervical = "Cancer excluding non-melanoma skin and cervical")

EXPOSURES <- c(x_ever = "Ever used (vs never)",
               x_regular = "Regular use: monthly for ≥1 year (vs never)",
               x_past30 = "Used in past 30 days (vs never)",
               x_heavy = "≥20 joint-years, crude proxy (vs never)")
EXPOSURE_CYCLES <- list(x_ever = CYCLES$suffix, x_regular = c("F", "G", "H", "I", "J"),
                        x_past30 = CYCLES$suffix, x_heavy = c("F", "G", "H", "I", "J"))

load_analysis <- function() add_analysis_vars(load_pooled())
