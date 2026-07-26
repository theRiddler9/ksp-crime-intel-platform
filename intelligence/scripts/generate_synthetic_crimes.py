"""
Synthetic Crime Intelligence Dataset Generator (Production Edition)
Karnataka Crime Analytics Platform - Synthetic Data Generation Script

Dependencies: pandas, numpy, faker
Run: pip install pandas numpy faker
"""

import os
import sys
import json
import time
import uuid
import random
import logging
import argparse
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from faker import Faker

# ----------------------------------------------------------------------------
# LOGGING SETUP
# ----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("CrimeDataGen")

# ----------------------------------------------------------------------------
# DEFAULT DISTRICT CONFIGURATION
# ----------------------------------------------------------------------------
DEFAULT_DISTRICTS = {
    "Bengaluru Urban": {
        "lat": 12.9716, "lon": 77.5946,
        "stations": ["Cubbon Park PS", "Whitefield PS", "Koramangala PS", "Indiranagar PS", "Yeshwanthpur PS", "Jayanagar PS"],
        "population_density": 4378, "urbanization_index": 0.95, "crime_multiplier": 2.8,
        "bounds": {"min_lat": 12.75, "max_lat": 13.15, "min_lon": 77.35, "max_lon": 77.80}
    },
    "Bengaluru Rural": {
        "lat": 13.2846, "lon": 77.5881,
        "stations": ["Devanahalli PS", "Doddaballapur PS", "Nelamangala PS", "Hoskote PS"],
        "population_density": 680, "urbanization_index": 0.45, "crime_multiplier": 0.9,
        "bounds": {"min_lat": 13.00, "max_lat": 13.55, "min_lon": 77.30, "max_lon": 77.95}
    },
    "Mysuru": {
        "lat": 12.2958, "lon": 76.6394,
        "stations": ["Devaraja PS", "Vijayanagar PS", "Krishnaraja PS", "Nazarbad PS"],
        "population_density": 1180, "urbanization_index": 0.72, "crime_multiplier": 1.4,
        "bounds": {"min_lat": 12.10, "max_lat": 12.50, "min_lon": 76.40, "max_lon": 76.85}
    },
    "Mangaluru": {
        "lat": 12.9141, "lon": 74.8560,
        "stations": ["Mangaluru North PS", "Mangaluru South PS", "Panambur PS", "Bunder PS"],
        "population_density": 1560, "urbanization_index": 0.75, "crime_multiplier": 1.3,
        "bounds": {"min_lat": 12.75, "max_lat": 13.10, "min_lon": 74.70, "max_lon": 75.05}
    },
    "Hubballi-Dharwad": {
        "lat": 15.3647, "lon": 75.1240,
        "stations": ["Hubballi Old PS", "Dharwad Central PS", "Vidyanagar PS"],
        "population_density": 950, "urbanization_index": 0.68, "crime_multiplier": 1.2,
        "bounds": {"min_lat": 15.15, "max_lat": 15.55, "min_lon": 74.95, "max_lon": 75.30}
    },
    "Belagavi": {
        "lat": 15.8497, "lon": 74.4977,
        "stations": ["Belagavi Camp PS", "Shahapur PS", "Tilakwadi PS"],
        "population_density": 780, "urbanization_index": 0.60, "crime_multiplier": 1.0,
        "bounds": {"min_lat": 15.65, "max_lat": 16.05, "min_lon": 74.30, "max_lon": 74.70}
    },
    "Shivamogga": {
        "lat": 13.9299, "lon": 75.5681,
        "stations": ["Shivamogga Town PS", "Gopala PS", "Vinoba Nagar PS"],
        "population_density": 620, "urbanization_index": 0.55, "crime_multiplier": 0.8,
        "bounds": {"min_lat": 13.75, "max_lat": 14.10, "min_lon": 75.35, "max_lon": 75.80}
    },
    "Tumakuru": {
        "lat": 13.3379, "lon": 77.1173,
        "stations": ["Tumakuru City PS", "Batawadi PS", "Kyathsandra PS"],
        "population_density": 540, "urbanization_index": 0.50, "crime_multiplier": 0.75,
        "bounds": {"min_lat": 13.15, "max_lat": 13.55, "min_lon": 76.90, "max_lon": 77.30}
    },
    "Ballari": {
        "lat": 15.1394, "lon": 76.9214,
        "stations": ["Ballari Town PS", "Cowl Bazar PS", "Bruce Pet PS"],
        "population_density": 610, "urbanization_index": 0.52, "crime_multiplier": 0.85,
        "bounds": {"min_lat": 14.95, "max_lat": 15.35, "min_lon": 76.70, "max_lon": 77.15}
    },
    "Kalaburagi": {
        "lat": 17.3297, "lon": 76.8343,
        "stations": ["Kalaburagi Town PS", "Brahmapur PS", "Station Bazar PS"],
        "population_density": 590, "urbanization_index": 0.48, "crime_multiplier": 0.8,
        "bounds": {"min_lat": 17.10, "max_lat": 17.55, "min_lon": 76.60, "max_lon": 77.10}
    },
}

CRIME_TYPES = {
    "Theft": {"weight": 0.26, "category": "Property Crime"},
    "Burglary": {"weight": 0.14, "category": "Property Crime"},
    "Vehicle Theft": {"weight": 0.13, "category": "Property Crime"},
    "Robbery": {"weight": 0.09, "category": "Violent Crime"},
    "Assault": {"weight": 0.12, "category": "Violent Crime"},
    "Fraud": {"weight": 0.10, "category": "White Collar Crime"},
    "Cyber Crime": {"weight": 0.09, "category": "White Collar Crime"},
    "Drug Offense": {"weight": 0.05, "category": "Narcotics"},
    "Kidnapping": {"weight": 0.015, "category": "Violent Crime"},
    "Homicide": {"weight": 0.005, "category": "Violent Crime"},
}

MODUS_OPERANDI_TEMPLATES = {
    "Theft": ["motorcycle phone snatching", "chain snatching", "pickpocketing in crowded market", "bag snatching near bus stop", "shop lifting during rush hour"],
    "Burglary": ["forced entry burglary", "night-time house break-in", "window latch forced open", "burglary via rear entrance", "lock picking break-in"],
    "Vehicle Theft": ["parked motorcycle theft", "car theft using duplicate key", "vehicle theft from parking lot", "auto-rickshaw theft"],
    "Robbery": ["knife robbery", "armed robbery at gunpoint", "street mugging", "robbery near ATM", "highway robbery"],
    "Assault": ["altercation-driven assault", "domestic dispute assault", "bar brawl assault", "road rage assault", "group assault"],
    "Fraud": ["ATM fraud", "cheque forgery", "investment scheme fraud", "identity theft fraud", "insurance claim fraud"],
    "Cyber Crime": ["phishing", "online banking fraud", "social media impersonation", "OTP scam", "ransomware attack", "fake e-commerce scam"],
    "Drug Offense": ["narcotics possession", "drug peddling near college", "drug trafficking bust", "illegal substance sale"],
    "Kidnapping": ["kidnapping for ransom", "child abduction", "kidnapping during robbery"],
    "Homicide": ["homicide following altercation", "premeditated homicide", "homicide during robbery"],
}

WEAPONS = ["None", "Knife", "Firearm", "Blunt Object", "Sharp Object", "Chemical", "Vehicle"]
KARNATAKA_FESTIVALS = ["None", "Ugadi", "Dasara", "Ganesh Chaturthi", "Deepavali", "Makar Sankranti", "Karaga", "Nag Panchami", "Eid", "Christmas"]
CASE_STATUSES = ["Open", "Under Investigation", "Closed", "Chargesheet Filed", "Cold Case"]
CASE_STATUS_PROBS = [0.15, 0.35, 0.20, 0.25, 0.05]


# ----------------------------------------------------------------------------
# HELPER FUNCTIONS
# ----------------------------------------------------------------------------
def get_seasonal_weather(dt):
    """Generate realistic Karnataka weather according to the month."""
    month = dt.month
    if month in [6, 7, 8, 9]:
        return np.random.choice(["Rainy", "Stormy", "Cloudy", "Clear"], p=[0.55, 0.20, 0.15, 0.10])
    elif month in [3, 4, 5]:
        return np.random.choice(["Clear", "Humid", "Cloudy"], p=[0.60, 0.30, 0.10])
    elif month in [11, 12, 1]:
        return np.random.choice(["Clear", "Foggy", "Cloudy"], p=[0.65, 0.25, 0.10])
    else:
        return np.random.choice(["Clear", "Cloudy", "Rainy"], p=[0.70, 0.20, 0.10])


def weighted_festival_choice(dt):
    """Return a festival name if date falls near a seasonal festival window."""
    month, day = dt.month, dt.day
    if month == 4 and 8 <= day <= 15:
        return "Ugadi"
    if month in (9, 10) and 15 <= day <= 25:
        return random.choice(["Dasara", "Ganesh Chaturthi"])
    if month == 11 and 1 <= day <= 10:
        return "Deepavali"
    if month == 1 and 12 <= day <= 16:
        return "Makar Sankranti"
    if month == 12 and day == 25:
        return "Christmas"
    if random.random() < 0.01:
        return random.choice(KARNATAKA_FESTIVALS[1:])
    return "None"


def get_time_of_day(hour):
    if 5 <= hour < 12:
        return "Morning"
    elif 12 <= hour < 17:
        return "Afternoon"
    elif 17 <= hour < 21:
        return "Evening"
    else:
        return "Night"


def get_weapon_probabilities(crime_type):
    """Detailed weapon probability distribution based on crime type."""
    if crime_type in ("Robbery", "Homicide", "Kidnapping"):
        p = [0.15, 0.35, 0.20, 0.15, 0.10, 0.02, 0.03]
    elif crime_type == "Assault":
        p = [0.30, 0.15, 0.05, 0.35, 0.10, 0.02, 0.03]
    elif crime_type in ("Theft", "Burglary", "Vehicle Theft"):
        p = [0.85, 0.03, 0.01, 0.05, 0.03, 0.01, 0.02]
    else:  # Cyber, Fraud, Drug Offense
        p = [0.95, 0.01, 0.01, 0.01, 0.01, 0.005, 0.005]
    p = np.array(p)
    return p / p.sum()


def get_crime_reporting_delay_hours(crime_type):
    """Generate crime-specific reporting delay (violent crimes reported much faster than financial/cyber)."""
    if crime_type in ("Homicide", "Kidnapping", "Robbery"):
        scale = 1.5  # Very prompt reporting (hours)
    elif crime_type in ("Assault", "Burglary", "Vehicle Theft", "Theft"):
        scale = 12.0  # Reported within half a day to a day
    elif crime_type in ("Fraud", "Cyber Crime"):
        scale = 72.0  # Fraud often discovered days/weeks later
    else:
        scale = 24.0
    return float(np.clip(np.random.exponential(scale=scale), 0.1, 720.0))


def generate_offender_pool(n_offenders):
    offenders = []
    for i in range(n_offenders):
        offenders.append({
            "offender_id": f"OFF-{100000 + i}",
            "offender_age": int(np.clip(np.random.normal(29, 9), 14, 75)),
            "offender_gender": np.random.choice(["Male", "Female"], p=[0.88, 0.12])
        })
    return offenders


def generate_gps_coordinates(district, districts_config, validate_bounds=True):
    d_info = districts_config[district]
    centre_lat, centre_lon = d_info["lat"], d_info["lon"]
    spread = 0.03 if d_info["urbanization_index"] > 0.7 else 0.06

    lat = np.random.normal(centre_lat, spread)
    lon = np.random.normal(centre_lon, spread)

    if validate_bounds and "bounds" in d_info:
        bounds = d_info["bounds"]
        lat = np.clip(lat, bounds["min_lat"], bounds["max_lat"])
        lon = np.clip(lon, bounds["min_lon"], bounds["max_lon"])

    return round(float(lat), 6), round(float(lon), 6)


def generate_property_loss(crime_type):
    base_scale = {
        "Theft": 8000, "Burglary": 45000, "Vehicle Theft": 90000,
        "Robbery": 30000, "Fraud": 120000, "Cyber Crime": 60000,
        "Assault": 500, "Drug Offense": 2000, "Kidnapping": 0, "Homicide": 0
    }
    scale = base_scale.get(crime_type, 5000)
    if scale == 0:
        return 0.0
    loss = np.random.lognormal(mean=np.log(scale), sigma=0.9)
    return round(float(loss), 2)


def generate_occurrence_datetime(crime_type, start_date, end_date):
    total_days = (end_date - start_date).days
    month_weights = {1: 0.9, 2: 0.9, 3: 1.05, 4: 1.1, 5: 1.15, 6: 1.0,
                     7: 0.95, 8: 0.95, 9: 1.05, 10: 1.2, 11: 1.15, 12: 1.1}

    while True:
        day_offset = random.randint(0, total_days)
        candidate_date = start_date + timedelta(days=day_offset)
        w = month_weights.get(candidate_date.month, 1.0)
        if random.random() < (w / 1.2):
            break

    if crime_type in ("Theft", "Burglary", "Vehicle Theft"):
        probs = np.ones(24)
        probs[[22, 23, 0, 1, 2, 3, 4]] = 3.0
        probs /= probs.sum()
        hour = int(np.random.choice(range(24), p=probs))
    elif crime_type == "Assault":
        hour = int(np.clip(np.random.normal(22 if candidate_date.weekday() >= 5 else 19, 3), 0, 23))
    elif crime_type == "Cyber Crime":
        hour = int(np.clip(np.random.normal(13 if candidate_date.weekday() < 5 else 15, 3), 0, 23))
    else:
        hour = random.randint(0, 23)

    return candidate_date.replace(hour=hour, minute=random.randint(0, 59), second=random.randint(0, 59))


def inject_anomalies(df, anomaly_fraction, districts_config):
    n_anomalies = int(len(df) * anomaly_fraction)
    if n_anomalies == 0:
        return df, 0

    anomaly_indices = np.random.choice(df.index, size=n_anomalies, replace=False)
    splits = np.array_split(anomaly_indices, 4)

    # 1. Unusually high property loss
    for idx in splits[0]:
        df.at[idx, "property_loss"] = round(float(np.random.uniform(2_000_000, 10_000_000)), 2)

    # 2. Coordinates outside normal district boundaries
    for idx in splits[1]:
        district = df.at[idx, "district"]
        centre_lat, centre_lon = districts_config[district]["lat"], districts_config[district]["lon"]
        df.at[idx, "latitude"] = round(centre_lat + np.random.uniform(0.5, 1.2) * random.choice([-1, 1]), 6)
        df.at[idx, "longitude"] = round(centre_lon + np.random.uniform(0.5, 1.2) * random.choice([-1, 1]), 6)

    # 3. Unusual crime timing / near-zero reporting delay at odd hours
    for idx in splits[2]:
        occ_dt = df.at[idx, "occurrence_datetime"]
        odd_hour_dt = occ_dt.replace(hour=random.choice([1, 2, 3, 4]))
        df.at[idx, "occurrence_datetime"] = odd_hour_dt
        df.at[idx, "reported_datetime"] = odd_hour_dt + timedelta(minutes=random.randint(1, 10))

    # 4. Rare crime types in low-crime districts
    low_crime_districts = sorted(districts_config, key=lambda d: districts_config[d]["crime_multiplier"])[:3]
    for idx in splits[3]:
        df.at[idx, "district"] = random.choice(low_crime_districts)
        df.at[idx, "crime_type"] = random.choice(["Kidnapping", "Homicide"])
        df.at[idx, "crime_category"] = CRIME_TYPES[df.at[idx, "crime_type"]]["category"]

    return df, n_anomalies


def inject_temporal_spikes(df, start_dt, end_dt, districts_config):
    """Inject temporal crime spikes (crime waves) to support spike detection algorithms."""
    spike_records = []
    n_spikes = 6
    total_days = (end_dt - start_dt).days

    for _ in range(n_spikes):
        spike_offset = random.randint(0, max(1, total_days - 3))
        spike_start = start_dt + timedelta(days=spike_offset)
        district = random.choice(list(districts_config.keys()))
        crime_type = random.choice(["Theft", "Robbery", "Assault", "Vehicle Theft"])

        n_extra = random.randint(150, 400)
        sample_rows = df.sample(n=min(n_extra, len(df)), replace=True).copy()

        for _, row in sample_rows.iterrows():
            new_row = row.copy()
            new_row["incident_id"] = f"INC-SPK-{uuid.uuid4().hex[:8].upper()}"
            new_row["district"] = district
            new_row["crime_type"] = crime_type
            new_row["crime_category"] = CRIME_TYPES[crime_type]["category"]

            new_dt = spike_start + timedelta(days=random.randint(0, 2), seconds=random.randint(0, 86399))
            new_row["occurrence_datetime"] = new_dt
            delay_hrs = get_crime_reporting_delay_hours(crime_type)
            new_row["reported_datetime"] = min(new_dt + timedelta(hours=delay_hrs), end_dt)

            lat, lon = generate_gps_coordinates(district, districts_config)
            new_row["latitude"] = lat
            new_row["longitude"] = lon
            spike_records.append(new_row)

    if spike_records:
        spike_df = pd.DataFrame(spike_records)
        df = pd.concat([df, spike_df], ignore_index=True)

    return df


def parse_args():
    parser = argparse.ArgumentParser(description="Synthetic Crime Dataset Generator")
    parser.add_argument("--records", type=int, default=100000, help="Total record count to generate")
    parser.add_argument("--anomalies", type=float, default=0.02, help="Anomaly fraction (0.0 to 1.0)")
    parser.add_argument("--output", type=str, default="synthetic_crimes.csv", help="Output file path")
    parser.add_argument("--start-date", type=str, default="2024-01-01", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, default="2025-12-31", help="End date (YYYY-MM-DD)")
    parser.add_argument("--district-config", type=str, default=None, help="Path to custom district JSON file")
    return parser.parse_args()


# ----------------------------------------------------------------------------
# MAIN EXECUTION PIPELINE
# ----------------------------------------------------------------------------
def main():
    args = parse_args()
    start_time = time.time()

    if args.records <= 0:
        raise ValueError("Record count must be greater than zero.")
    if not (0.0 <= args.anomalies <= 1.0):
        raise ValueError("Anomaly fraction must be between 0.0 and 1.0.")

    start_dt = datetime.strptime(args.start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(args.end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    random.seed(42)
    np.random.seed(42)
    fake = Faker()
    Faker.seed(42)

    districts_config = DEFAULT_DISTRICTS
    if args.district_config and os.path.exists(args.district_config):
        logger.info(f"Loading custom district configuration from {args.district_config}")
        with open(args.district_config, "r") as f:
            districts_config = json.load(f)

    district_names = list(districts_config.keys())
    dist_weights = np.array([districts_config[d]["crime_multiplier"] for d in district_names])
    dist_weights /= dist_weights.sum()

    crime_names = list(CRIME_TYPES.keys())
    crime_weights = np.array([CRIME_TYPES[c]["weight"] for c in crime_names])
    crime_weights /= crime_weights.sum()

    logger.info("Initializing offender pool...")
    offender_pool = generate_offender_pool(1000)
    num_repeat = int(1000 * 0.15)
    repeat_offender_ids = random.sample(offender_pool, num_repeat)
    repeat_offender_set = {o["offender_id"] for o in repeat_offender_ids}

    logger.info(f"Generating {args.records} primary records...")
    records = []

    for i in range(args.records):
        district = np.random.choice(district_names, p=dist_weights)
        d_info = districts_config[district]
        station = random.choice(d_info["stations"])

        crime_type = np.random.choice(crime_names, p=crime_weights)
        crime_cat = CRIME_TYPES[crime_type]["category"]

        occ_dt = generate_occurrence_datetime(crime_type, start_dt, end_dt)
        delay_hours = get_crime_reporting_delay_hours(crime_type)
        rep_dt = min(occ_dt + timedelta(hours=delay_hours), end_dt)

        lat, lon = generate_gps_coordinates(district, districts_config)

        if random.random() < 0.15:
            offender = random.choice(repeat_offender_ids)
        else:
            offender = random.choice(offender_pool)

        weapon_p = get_weapon_probabilities(crime_type)

        records.append({
            "incident_id": f"INC-{100000 + i}",
            "crime_type": crime_type,
            "crime_category": crime_cat,
            "occurrence_datetime": occ_dt,
            "reported_datetime": rep_dt,
            "district": district,
            "police_station": station,
            "latitude": lat,
            "longitude": lon,
            "victim_age": int(np.clip(np.random.normal(34, 14), 5, 90)),
            "victim_gender": np.random.choice(["Male", "Female", "Other"], p=[0.55, 0.43, 0.02]),
            "offender_id": offender["offender_id"],
            "offender_age": offender["offender_age"],
            "offender_gender": offender["offender_gender"],
            "weapon_used": np.random.choice(WEAPONS, p=weapon_p),
            "modus_operandi": random.choice(MODUS_OPERANDI_TEMPLATES[crime_type]),
            "property_loss": generate_property_loss(crime_type),
            "weather": get_seasonal_weather(occ_dt),
            "festival": weighted_festival_choice(occ_dt),
            "weekend": occ_dt.weekday() >= 5,
            "time_of_day": get_time_of_day(occ_dt.hour),
            "arrest_made": random.random() < (0.45 if crime_cat != "White Collar Crime" else 0.2),
            "repeat_offender": offender["offender_id"] in repeat_offender_set,
            "cctv_available": random.random() < (0.65 if d_info["urbanization_index"] > 0.7 else 0.3),
            "case_status": np.random.choice(CASE_STATUSES, p=CASE_STATUS_PROBS),
            "population_density": d_info["population_density"],
            "urbanization_index": d_info["urbanization_index"],
            "socioeconomic_score": round(float(np.clip(np.random.normal(d_info["urbanization_index"] * 100, 12), 0, 100)), 2)
        })

        if (i + 1) % 25000 == 0 or (i + 1) == args.records:
            logger.info(f" Progress: {(i + 1) / args.records * 100:.1f}% ({i + 1}/{args.records})")

    df = pd.DataFrame(records)

    logger.info("Injecting temporal spikes for crime-wave analytics...")
    df = inject_temporal_spikes(df, start_dt, end_dt, districts_config)

    logger.info(f"Injecting anomalies (~{args.anomalies * 100:.1f}%)...")
    df, n_anomalies = inject_anomalies(df, args.anomalies, districts_config)

    df["occurrence_datetime"] = pd.to_datetime(df["occurrence_datetime"])
    df["reported_datetime"] = pd.to_datetime(df["reported_datetime"])
    df["weekend"] = df["occurrence_datetime"].dt.weekday >= 5
    df["time_of_day"] = df["occurrence_datetime"].dt.hour.apply(get_time_of_day)

    df = df.sort_values("occurrence_datetime").reset_index(drop=True)
    df.to_csv(args.output, index=False)

    exec_time = round(time.time() - start_time, 2)

    metadata = {
        "generated_records": len(df),
        "requested_records": args.records,
        "anomalies_injected": n_anomalies,
        "anomaly_rate": args.anomalies,
        "execution_time_seconds": exec_time,
        "start_date": args.start_date,
        "end_date": args.end_date,
        "output_file": args.output
    }
    meta_path = f"{os.path.splitext(args.output)[0]}_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=4)

    logger.info("=" * 60)
    logger.info("SYNTHETIC CRIME DATASET GENERATION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Output File           : {args.output}")
    logger.info(f"Metadata File         : {meta_path}")
    logger.info(f"Total Records Saved   : {len(df)}")
    logger.info(f"Anomalies Injected    : {n_anomalies}")
    logger.info(f"Execution Time        : {exec_time}s")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()