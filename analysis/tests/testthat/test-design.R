test_that("design is built on the FULL pooled sample, not a filtered frame", {
  des <- make_design(pooled)
  expect_equal(nrow(des$variables), sum(demo_counts()$n))
  sub <- analytic_subset(des)
  # subset() retains the FULL design's number of PSUs per stratum for every kept row
  full_psu <- tapply(paste(pooled$SDMVSTRA, pooled$SDMVPSU), pooled$SDMVSTRA, function(x) length(unique(x)))
  expect_equal(as.numeric(sub$fpc$sampsize[, 1]), as.numeric(full_psu[as.character(sub$variables$SDMVSTRA)]))
  expect_equal(nrow(sub$variables),
               sum(pooled$duq_answered == 1 & pooled$age >= 20 & pooled$age <= 59 & pooled$WTMEC2YR > 0, na.rm = TRUE))
})

test_that("make_design refuses a pre-filtered data frame", {
  expect_error(make_design(pooled[pooled$age >= 20, ]), "FULL pooled sample")
  expect_error(make_design(pooled[pooled$duq_answered == 1, ], "J"), "FULL pooled sample")
})

test_that("pooled weights are WTMEC2YR / number of cycles and strata are unique across cycles", {
  des <- make_design(pooled)
  v <- des$variables
  expect_equal(v$wt_pooled, ifelse(is.na(v$WTMEC2YR), 0, v$WTMEC2YR) / 7)
  st <- unique(pooled[, c("cycle", "SDMVSTRA")])
  expect_false(any(duplicated(st$SDMVSTRA)))
  # 2 PSUs per stratum (3 in some strata in some cycles): df = PSUs - strata
  psu <- unique(paste(pooled$SDMVSTRA, pooled$SDMVPSU))
  expect_equal(degf(des), length(psu) - length(unique(pooled$SDMVSTRA)))
})

test_that("filter-first creates lonely PSUs where subset() of the full design does not", {
  # Small domain: 2017-2018, Other/Multiracial women aged 20-24. Filtering the data frame first
  # leaves strata with a single PSU; the subset of the full design keeps the full PSU counts.
  des <- make_design(pooled)
  sub <- analytic_subset(des)
  dom <- quote(cycle == "J" & race == "Other/Multiracial" & age <= 24 & sex == "Female")
  expect_silent(svymean(~mj_ever, subset(sub, eval(dom)), na.rm = TRUE))
  ff <- pooled[pooled$duq_answered == 1 & pooled$age >= 20 & pooled$age <= 59 & pooled$WTMEC2YR > 0 &
                 with(pooled, eval(dom)) %in% TRUE, ]
  fd <- svydesign(ids = ~SDMVPSU, strata = ~SDMVSTRA, weights = ~WTMEC2YR, nest = TRUE, data = ff)
  expect_error(svymean(~mj_ever, fd, na.rm = TRUE), "only one PSU")
})

test_that("domain SE from subset() equals svyby domain estimation on the full design", {
  # Domain estimate for a small subgroup: variance from the subset design is the correct
  # (Taylor-linearized domain) variance; recompute it with svyby on the full design to confirm.
  des <- make_design(pooled)
  sub <- analytic_subset(des)
  a <- svymean(~mj_ever, subset(sub, cycle == "J" & race == "Other/Multiracial"), na.rm = TRUE)
  b <- svyby(~mj_ever, ~I(cycle == "J" & race == "Other/Multiracial"), sub, svymean, na.rm = TRUE)
  expect_equal(as.numeric(SE(a)), as.numeric(SE(b))[2], tolerance = 1e-8)
})

test_that("Korn-Graubard implementation agrees with survey::svyciprop(method = 'beta') on a full design", {
  des <- make_design(pooled[pooled$cycle == "J", ], "J")
  des$variables$ever <- des$variables$mj_ever
  dom <- des$variables$duq_answered == 1 & des$variables$age >= 20
  r <- nchs_proportion(des, "ever", dom)
  ci <- svyciprop(~ever, des[dom & !is.na(des$variables$ever), ], method = "beta", df = r$df)
  expect_equal(r$p, as.numeric(coef(ci)), tolerance = 1e-8)
  # both use Clopper-Pearson on an effective n; allow small differences from df-adjustment details
  expect_equal(r$lcl, as.numeric(attr(ci, "ci")[1]), tolerance = 0.01)
  expect_equal(r$ucl, as.numeric(attr(ci, "ci")[2]), tolerance = 0.01)
})

test_that("NCHS suppression rules fire as specified", {
  set.seed(1)
  des <- make_design(pooled)
  v <- des$variables
  # tiny domain (n < 30) must be suppressed
  tiny <- v$duq_answered == 1 & v$age == 20 & v$cycle == "D" & v$race == "Other/Multiracial"
  expect_equal(nchs_proportion(des, "mj_ever", tiny)$status, "suppress")
  # large domain should present
  big <- v$duq_answered == 1 & v$age >= 20 & v$age <= 59
  expect_equal(nchs_proportion(des, "mj_ever", big)$status, "ok")
})
