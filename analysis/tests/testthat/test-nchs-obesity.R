# Validation against an official NCHS publication using NHANES.
# Source (verified verbatim 2026-11-25): Hales CM, Carroll MD, Fryar CD, Ogden CL.
#   Prevalence of Obesity and Severe Obesity Among Adults: United States, 2017-2018.
#   NCHS Data Brief No. 360, February 2020. https://www.cdc.gov/nchs/products/databriefs/db360.htm
# Published sample definition: adults aged 20+, NHANES 2017-2018; pregnant women excluded;
#   examination (MEC) sample weights; Taylor series linearization; obesity = BMI >= 30
#   (BMI rounded to one decimal). Crude estimates (Figure 1 notes): 42.5% total, 43.0% men,
#   42.1% women. Age-group estimates (text): 40.0% (20-39), 44.8% (40-59), 42.8% (60+).
# We compare crude/age-specific values (no age standardization needed); match = equal at 1 decimal.
test_that("2017-2018 adult obesity prevalence reproduces NCHS Data Brief 360", {
  des <- make_design(pooled[pooled$cycle == "J", ], "J")
  v <- des$variables
  des$variables$obese <- as.integer(v$bmi >= 30)
  dom <- v$age >= 20 & v$pregnant == 0 & !is.na(v$bmi) & v$WTMEC2YR > 0
  published <- list(all = list(dom, 42.5), men = list(dom & v$sex == "Male", 43.0),
                    women = list(dom & v$sex == "Female", 42.1),
                    a20_39 = list(dom & v$age <= 39, 40.0),
                    a40_59 = list(dom & v$age >= 40 & v$age <= 59, 44.8),
                    a60p = list(dom & v$age >= 60, 42.8))
  for (nm in names(published)) {
    r <- nchs_proportion(des, "obese", published[[nm]][[1]])
    expect_equal(round(100 * r$p, 1), published[[nm]][[2]], info = nm)
  }
})
