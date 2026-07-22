#!/usr/bin/env python3
"""
Modus Operandi (MO) Similarity Matcher for KSP Crime Intel Platform
Computes Jaccard / Cosine similarity scores between incident MO signatures.
"""

import sys
import json

def jaccard_similarity(set1, set2):
    if not set1 or not set2:
        return 0.0
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.0

def get_suspect_name(inc):
    if inc.get("Accused"):
        return inc["Accused"].get("AccusedName", "").lower()
    return inc.get("suspect_name", "").lower()

def get_fir_number(inc):
    return inc.get("CrimeNo") or inc.get("fir_number") or inc.get("CaseNo") or ""

def match_mo_similarity(target_inc, pool):
    target_tags = set(target_inc.get("mo_tags", []))
    target_fir = get_fir_number(target_inc)
    target_suspect = get_suspect_name(target_inc)

    matches = []
    for inc in pool:
        other_fir = get_fir_number(inc)
        if not other_fir or other_fir == target_fir:
            continue

        other_tags = set(inc.get("mo_tags", []))
        other_suspect = get_suspect_name(inc)

        sim_score = jaccard_similarity(target_tags, other_tags)

        # Suspect alias/name match bonus
        if target_suspect and other_suspect and target_suspect == other_suspect:
            sim_score = min(1.0, sim_score + 0.3)

        if sim_score >= 0.4:
            matches.append({
                "source_fir": target_fir,
                "target_fir": other_fir,
                "shared_mo_tags": list(target_tags.intersection(other_tags)),
                "similarity_score": round(sim_score, 4),
                "case_type": inc.get("CrimeMinorHeadName") or inc.get("case_type") or "",
                "district_id": inc.get("DistrictName") or inc.get("district_id") or ""
            })

    matches.sort(key=lambda x: x["similarity_score"], reverse=True)
    return matches

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps([]))
            return
        payload = json.loads(raw_input)

        target = payload.get("target_incident", {})
        pool = payload.get("incidents_pool", [])

        matches = match_mo_similarity(target, pool)
        print(json.dumps(matches))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
