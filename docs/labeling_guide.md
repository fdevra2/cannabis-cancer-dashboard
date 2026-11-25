# Labelling guide: literature-triage validation set

You will label `data/labels/validation_template.csv`, a stratified random sample of 200 PubMed abstracts. Save the completed file as **`data/labels/validation_labels.csv`** and run `make analysis`. The site will then show Cohen's kappa and confusion matrices comparing the rule-based classifier with your labels.

The template is **blind**: it contains no classifier predictions. Label from the title and abstract only; don't look up the full text. Use the labels exactly as written below, copying the text.

## Column `human_design` — study design

Use the design of the **primary analysis reported in the abstract**.

| Label | Use when |
|---|---|
| `Systematic review / meta-analysis` | Systematic literature search with synthesis; pooled analysis of several studies |
| `Randomized / clinical trial` | Participants assigned to an intervention (randomized or not) |
| `Preclinical (cell/animal)` | Cell lines, animal models, xenografts; no human participants |
| `Cohort` | People followed over time from exposure to outcome (prospective or retrospective), including registry and EHR cohorts |
| `Case-control` | People sampled by outcome status (cases vs controls) and compared on past exposure |
| `Cross-sectional / survey` | Exposure and outcome measured at one time point (e.g. NHANES, a patient survey) |
| `Case report / series` | One patient or a descriptive series without a comparison group |
| `Narrative review / commentary` | Non-systematic review, editorial, commentary, letter, guideline |
| `Other / unclear` | None of the above, or not determinable from the abstract |

Tie-breakers:
* A cancer-patient survey about *current* cannabis use is `Cross-sectional / survey`.
* A Mendelian randomization study is `Other / unclear`.

## Column `human_site` — cancer site

| Label | Use when the abstract's main cancer is |
|---|---|
| `Lung` | Lung or bronchus |
| `Head & neck / oral` | Oral cavity, oropharynx, pharynx, larynx, head and neck squamous cell carcinoma |
| `Testicular` | Testicular germ cell tumours |
| `Breast` | Breast |
| `Prostate` | Prostate |
| `Colorectal` | Colon, rectum |
| `Brain / glioma` | Glioma, glioblastoma, other brain tumours |
| `Bladder / urologic` | Bladder, urothelial, kidney |
| `Hematologic` | Leukemia, lymphoma, myeloma |
| `Other specific site` | Any other named site (skin/melanoma, pancreas, liver, esophagus, stomach, cervix, ovary, thyroid, pediatric tumours, sarcoma …) |
| `Multiple sites` | Two or more sites analysed separately as main outcomes |
| `Cancer in general / unspecified` | "Cancer" overall, cancer patients of mixed or unspecified type, or no specific site |

## Other columns

- `labeler`: your initials.
- `notes`: optional; e.g. "ambiguous: pooled cohort".

## Why this design

The validation set mirrors AI-versus-human-expert benchmarking. The classifier is evaluated against an independent human reference standard on a pre-specified random sample, using chance-corrected agreement (Cohen's kappa) rather than raw accuracy. Please don't change labels after seeing the classifier's predictions. If you want a second labeller for inter-rater reliability, copy the template and have them label it independently.
