# Shared helpers for the AI demos (tested in analysis/tests/testthat/test-ai.R).

# Cohen's kappa with large-sample CI and confusion matrix.
kappa <- function(a, b) {
  lv <- union(a, b); tab <- table(factor(a, lv), factor(b, lv)); n <- sum(tab)
  po <- sum(diag(tab)) / n; pe <- sum(rowSums(tab) * colSums(tab)) / n^2
  k <- (po - pe) / (1 - pe)
  # large-sample SE (Cohen 1960 approximation)
  se <- sqrt(po * (1 - po) / (n * (1 - pe)^2))
  list(kappa = k, lcl = k - 1.96 * se, ucl = k + 1.96 * se, agreement = po, n = n,
       confusion = as.data.frame(tab, responseName = "n", stringsAsFactors = FALSE))
}

# Weighted AUROC (Mann-Whitney with tie handling).
wauc <- function(p, y, w) {  # weighted Mann-Whitney AUROC
  o <- order(p); p <- p[o]; y <- y[o]; w <- w[o]
  wp <- w * (y == 1); wn <- w * (y == 0)
  # ties: average ranks via grouping
  g <- match(p, unique(p))
  cn <- cumsum(tapply(wn, g, sum)); tn <- tapply(wn, g, sum); tp <- tapply(wp, g, sum)
  below <- c(0, head(cn, -1))
  sum(tp * (below + tn / 2)) / (sum(wp) * sum(wn))
}
