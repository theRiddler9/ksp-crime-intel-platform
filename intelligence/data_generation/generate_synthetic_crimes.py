#!/usr/bin/env python3
"""
Official Karnataka Police FIR Dataset Generator
Generates FIR entries following the official ERD Schema:
- CaseMaster (CrimeNo, CaseNo, IncidentFromDate, latitude, longitude, BriefFacts...)
- ComplainantDetails
- Accused
- Victim
- ActSectionAssociation
"""

import json
import random
from datetime import datetime, timedelta

DISTRICTS = {
    4430: { # Bengaluru City District ID
        "name": "BENGALURU_CITY",
        "units": [
            {"unit_id": 6, "name": "HAL Police Station", "lat": 12.9602, "lng": 77.6483},
            {"unit_id": 12, "name": "Electronic City Police Station", "lat": 12.8399, "lng": 77.6770},
            {"unit_id": 18, "name": "Indiranagar Police Station", "lat": 12.9784, "lng": 77.6408},
            {"unit_id": 24, "name": "Upparpet (Majestic) Police Station", "lat": 12.9767, "lng": 77.5713}
        ]
    },
    4431: { # Mysuru City District ID
        "name": "MYSURU_CITY",
        "units": [
            {"unit_id": 5, "name": "Devaraja Police Station", "lat": 12.3052, "lng": 76.6552},
            {"unit_id": 10, "name": "Lashkar Police Station", "lat": 12.3167, "lng": 76.6597}
        ]
    },
    4432: { # Hubballi-Dharwad District ID
        "name": "HUBBALLI_DHARWAD",
        "units": [
            {"unit_id": 8, "name": "Hubballi Town Police Station", "lat": 15.3647, "lng": 75.1240}
        ]
    },
    4433: { # Mangaluru City District ID
        "name": "MANGALURU_CITY",
        "units": [
            {"unit_id": 15, "name": "Mangaluru North Police Station", "lat": 12.8702, "lng": 74.8812}
        ]
    }
}

CRIME_HEADS = [
    {
        "major_id": 1, "major_name": "Property Offence", "minor_id": 101, "minor_name": "Theft",
        "act": "IPC", "section": "379", "mo": ["night time theft", "two wheeler theft"], "gravity": 2
    },
    {
        "major_id": 1, "major_name": "Property Offence", "minor_id": 102, "minor_name": "Chain Snatching",
        "act": "IPC", "section": "356", "mo": ["chain snatching", "two wheeler theft"], "gravity": 1
    },
    {
        "major_id": 1, "major_name": "Property Offence", "minor_id": 103, "minor_name": "Burglary",
        "act": "IPC", "section": "457", "mo": ["burglary - forced entry", "burglary - lock picking"], "gravity": 1
    },
    {
        "major_id": 2, "major_name": "Cybercrime", "minor_id": 201, "minor_name": "Financial Fraud",
        "act": "IT_ACT", "section": "66D", "mo": ["OTP fraud", "SIM swap", "bank impersonation"], "gravity": 1
    },
    {
        "major_id": 3, "major_name": "Special & Local Laws", "minor_id": 301, "minor_name": "NDPS Offence",
        "act": "NDPS", "section": "20(b)", "mo": ["drug trafficking"], "gravity": 1
    },
    {
        "major_id": 4, "major_name": "Crimes Against Women", "minor_id": 401, "minor_name": "Cruelty & Harassment",
        "act": "IPC", "section": "498A", "mo": ["domestic violence", "cyber stalking"], "gravity": 1
    }
]

ACCUSED_POOL = [
    {"name": "Ramesh Kumar", "age": 32, "gender": 1, "alias": "Kulla Ramesh", "prior": True, "cases": 4},
    {"name": "Syed Imran", "age": 28, "gender": 1, "alias": "Bullet Imran", "prior": True, "cases": 6},
    {"name": "Venkatesh Naik", "age": 24, "gender": 1, "alias": "Venky", "prior": False, "cases": 0},
    {"name": "Manjunath S", "age": 35, "gender": 1, "alias": "Manja", "prior": True, "cases": 3},
    {"name": "Anand Reddy", "age": 29, "gender": 1, "alias": "Reddy", "prior": False, "cases": 0}
]

COMPLAINANT_POOL = [
    {"name": "Karthik N", "age": 38, "gender": 1, "occ": 2, "rel": 1, "caste": 5},
    {"name": "Sunita Rao", "age": 45, "gender": 2, "occ": 1, "rel": 1, "caste": 3},
    {"name": "Mohammed Ali", "age": 41, "gender": 1, "occ": 3, "rel": 2, "caste": 12},
    {"name": "Priya Sharma", "age": 29, "gender": 2, "occ": 4, "rel": 1, "caste": 8}
]

def generate_official_ksp_dataset(count=150):
    dataset = []
    base_time = datetime.now() - timedelta(days=30)

    serial_counter = {}

    for i in range(1, count + 1):
        dist_code = random.choice(list(DISTRICTS.keys()))
        dist_meta = DISTRICTS[dist_code]
        unit = random.choice(dist_meta["units"])
        unit_id = unit["unit_id"]

        category_code = 1 # 1 = FIR
        year = 2026

        key = (dist_code, unit_id, category_code, year)
        serial_counter[key] = serial_counter.get(key, 0) + 1
        serial_no = serial_counter[key]

        # Official CrimeNo: 1 digit Cat (1) + 4 digit Dist + 4 digit Unit + 4 digit Year + 5 digit Serial
        crime_no = f"{category_code}{dist_code:04d}{unit_id:04d}{year}{serial_no:05d}"
        # Official CaseNo: YYYY + 5-digit Serial (Last 9 digits of CrimeNo)
        case_no = f"{year}{serial_no:05d}"

        crime_head = random.choice(CRIME_HEADS)
        inc_from = base_time + timedelta(hours=random.randint(1, 720))
        inc_to = inc_from + timedelta(hours=random.randint(1, 3))
        info_received = inc_to + timedelta(hours=random.randint(1, 6))

        lat_jitter = random.uniform(-0.005, 0.005)
        lng_jitter = random.uniform(-0.005, 0.005)
        lat = round(unit["lat"] + lat_jitter, 6)
        lng = round(unit["lng"] + lng_jitter, 6)

        accused_person = random.choice(ACCUSED_POOL)
        complainant = random.choice(COMPLAINANT_POOL)
        mo_selected = random.sample(crime_head["mo"], k=min(len(crime_head["mo"]), random.randint(1, 2)))

        fir_entry = {
            "CaseMasterID": i,
            "CrimeNo": crime_no,
            "CaseNo": case_no,
            "CrimeRegisteredDate": info_received.strftime("%Y-%m-%d"),
            "PolicePersonID": random.choice([101, 102, 103]),
            "PoliceStationID": unit_id,
            "PoliceStationName": unit["name"],
            "DistrictID": dist_code,
            "DistrictName": dist_meta["name"],
            "CaseCategoryID": category_code,
            "GravityOffenceID": crime_head["gravity"],
            "CrimeMajorHeadID": crime_head["major_id"],
            "CrimeMajorHeadName": crime_head["major_name"],
            "CrimeMinorHeadID": crime_head["minor_id"],
            "CrimeMinorHeadName": crime_head["minor_name"],
            "CaseStatusID": random.choice([1, 1, 2, 3]), # 1: Under Investigation, 2: Charge Sheeted, 3: Closed
            "CourtID": 1,
            "IncidentFromDate": inc_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "IncidentToDate": inc_to.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "InfoReceivedPSDate": info_received.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "latitude": lat,
            "longitude": lng,
            "BriefFacts": f"Incident of {crime_head['minor_name']} reported at {unit['name']} jurisdiction. MO tags: {', '.join(mo_selected)}.",
            "mo_tags": mo_selected,
            "ComplainantDetails": {
                "ComplainantID": 1000 + i,
                "ComplainantName": complainant["name"],
                "AgeYear": complainant["age"],
                "OccupationID": complainant["occ"],
                "ReligionID": complainant["rel"],
                "CasteID": complainant["caste"],
                "GenderID": complainant["gender"]
            },
            "Victim": {
                "VictimMasterID": 2000 + i,
                "VictimName": f"Victim_{i}",
                "AgeYear": random.randint(20, 60),
                "GenderID": random.choice([1, 2]),
                "VictimPolice": "0"
            },
            "Accused": {
                "AccusedMasterID": 3000 + i,
                "AccusedName": accused_person["name"],
                "AgeYear": accused_person["age"],
                "GenderID": accused_person["gender"],
                "PersonID": "A1",
                "prior_record_flag": accused_person["prior"],
                "prior_cases_count": accused_person["cases"]
            },
            "ActSectionAssociation": [
                {
                    "ActID": crime_head["act"],
                    "SectionID": crime_head["section"],
                    "ActOrderID": 1,
                    "SectionOrderID": 1
                }
            ]
        }

        dataset.append(fir_entry)

    return dataset

if __name__ == "__main__":
    data = generate_official_ksp_dataset(150)
    out_file = "synthetic_ksp_crimes.json"
    with open(out_file, "w") as f:
        json.dump(data, f, indent=2)

    print(json.dumps({
        "status": "success",
        "generated_incidents_count": len(data),
        "output_file": out_file
    }))
