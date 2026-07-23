# Zia AutoML Risk Model Configuration & Feature Engineering

## Overview
The **Zia AutoML Risk Model** generates tabular predictive risk scores (range: `0.00` to `1.00`) per incident, location grid, and police station jurisdiction across Karnataka.

---

## 1. Model Specifications
- **Model Type:** Gradient Boosted Decision Trees (GBDT) / Random Forest Ensembles (Tabular AutoML).
- **Target Variable:** `risk_score_tier` (Binary / Multi-class: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **Optimization Metric:** ROC-AUC / F1-Score for rare pattern surfacing.
- **Evaluation Benchmark:** 5-Fold Cross Validation.

---

## 2. Feature Matrix & Transformations

| Feature Name | Source | Type | Transformation / Normalization | Feature Importance |
|---|---|---|---|---|
| `station_historical_30d_count` | `incidents` | Numerical | Log-transformed ratio to station 1-year baseline | High (0.24) |
| `mo_tag_risk_weight` | `incidents.mo_tags` | Categorical | Target-encoded risk weight per MO | High (0.21) |
| `spatial_density_1km` | `locations` | Spatial | Nearest neighbor count within 1.0 km radius | High (0.19) |
| `prior_offender_linked_flag` | `offenders` | Binary | One-hot encoded (`0` or `1`) | Medium (0.14) |
| `time_of_day_bucket` | `incidents.occurrence_time` | Temporal | One-hot (Night: 00-06, Morning: 06-12, Afternoon: 12-18, Evening: 18-24) | Medium (0.12) |
| `property_loss_val` | `incidents` | Numerical | Min-Max Scaled [0, 1] | Low (0.10) |

---

## 3. Training Data Preparation Pipeline
1. Run `python intelligence/data_generation/generate_synthetic_crimes.py` to produce input dataset.
2. Aggregate spatial density features over 1km bounding boxes.
3. Upload tabular CSV to Zoho Catalyst Zia AutoML console.
4. Auto-train model using 80/20 train/test split.
5. Deploy inference endpoint API to be called inside `event-functions/flag-detector`.

---

## 4. Explainability & Auditability (Stage 8 Compliance)
- Every prediction score output by Zia AutoML is logged alongside feature attribution weights.
- When an officer reviews a flag (Stage 6), the top 3 contributing feature weights (e.g. *58% spike in Cybercrime + Repeat offender presence*) are displayed in the evidence payload.
