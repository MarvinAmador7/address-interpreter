"""Download an address-only, stratified MLS sample using the HomeAnalytics profile.

Requires duckdb and the user's existing MotherDuck token. All SQL is read-only.
Source extracts and address-level reports belong in the gitignored .local folder.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path

import duckdb


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample-percent", type=float, default=1)
    parser.add_argument("--per-category", type=int, default=2000)
    parser.add_argument("--output", type=Path, default=Path(".local/corpus/mls.jsonl"))
    args = parser.parse_args()
    if not 0 < args.sample_percent <= 5 or not 1 <= args.per_category <= 10000:
        parser.error("sample-percent must be in (0, 5] and per-category in [1, 10000]")
    if ".local" not in args.output.parts:
        parser.error("write source extracts inside a gitignored .local directory")
    if not os.environ.get("motherduck_token"):
        os.environ["motherduck_token"] = (Path.home() / ".motherduck/homeanalytics.token").read_text().strip()
    columns = {
        "ATTOMID": "property_id", "MLSLISTINGADDRESS": "listing_address",
        "PROPERTYADDRESSFULL": "address_full", "PROPERTYADDRESSHOUSENUMBER": "house_number",
        "PROPERTYADDRESSSTREETDIRECTION": "pre_directional", "PROPERTYADDRESSSTREETNAME": "street_name",
        "PROPERTYADDRESSSTREETSUFFIX": "street_suffix", "PROPERTYADDRESSSTREETPOSTDIRECTION": "post_directional",
        "PROPERTYADDRESSUNITPREFIX": "unit_prefix", "PROPERTYADDRESSUNITVALUE": "unit",
        "PROPERTYADDRESSCITY": "city", "PROPERTYADDRESSSTATE": "state",
        "PROPERTYADDRESSZIP": "zip", "PROPERTYADDRESSZIP4": "zip4",
    }
    selection = ", ".join(f'trim(cast("{source}" as varchar)) as {alias}' for source, alias in columns.items())
    # Sample physical source blocks first; stratify and deduplicate on the server.
    # Persisted output is the reproducible corpus, since the live feed changes.
    sql = f"""
    WITH sampled AS (
      SELECT DISTINCT {selection}
      FROM homeanalytics.raw.attom_listing_analytics_complete
      USING SAMPLE {args.sample_percent} PERCENT (system, 20260926)
    ), categorized AS (
      SELECT *, CASE
        WHEN regexp_matches(upper(coalesce(listing_address,'') || ' ' || coalesce(unit,'')), '(^| )(BLDG|BUILDING|TOWER|FLOOR|STE|SUITE|PENTHOUSE)([ .#]|$)') THEN 'building-suite'
        WHEN regexp_matches(coalesce(house_number,''), '[ /½¼¾]') THEN 'fraction-or-space-house'
        WHEN regexp_matches(coalesce(house_number,''), '^[NSEWnsew]') THEN 'grid-house'
        WHEN contains(coalesce(house_number,''), '-') THEN 'hyphenated-house'
        WHEN regexp_full_match(coalesce(unit,''), '[A-Za-z]+') THEN 'alphabetic-unit'
        WHEN regexp_matches(coalesce(unit,''), '[- /]') THEN 'compound-unit'
        WHEN regexp_matches(coalesce(unit,''), '[A-Za-z]') THEN 'alphanumeric-unit'
        WHEN length(coalesce(unit,'')) > 0 THEN 'numeric-unit'
        WHEN coalesce(street_suffix,'') = '' THEN 'suffixless'
        WHEN coalesce(pre_directional,'') <> '' OR coalesce(post_directional,'') <> '' THEN 'directional'
        ELSE 'ordinary' END AS category
      FROM sampled WHERE coalesce(address_full,'') <> ''
    )
    SELECT * FROM categorized
    QUALIFY row_number() OVER (PARTITION BY category ORDER BY hash(property_id, address_full, unit, listing_address)) <= {args.per_category}
    ORDER BY category, hash(property_id, address_full, unit, listing_address)
    """
    args.output.parent.mkdir(parents=True, exist_ok=True)
    counts = Counter()
    states = Counter()
    splits = Counter()
    digest = hashlib.sha256()
    with duckdb.connect("md:homeanalytics") as connection:
        print("Connected to", connection.execute("SELECT current_database()").fetchone()[0], flush=True)
        cursor = connection.execute(sql)
        names = [column[0] for column in cursor.description]
        with args.output.open("w") as output:
            while batch := cursor.fetchmany(1000):
                for values in batch:
                    row = dict(zip(names, values))
                    property_id = row.pop("property_id")
                    identity = property_id if property_id and property_id != "999999999" else "|".join(row.get(key) or "" for key in ("address_full", "unit", "city", "state", "zip"))
                    row["property_group"] = hashlib.sha256(identity.encode()).hexdigest()
                    row["split"] = "holdout" if int(row["property_group"][:8], 16) % 5 == 0 else "development"
                    line = json.dumps(row, ensure_ascii=False) + "\n"
                    output.write(line)
                    digest.update(line.encode())
                    counts[row["category"]] += 1
                    states[row["state"] or "missing"] += 1
                    splits[row["split"]] += 1
    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "source": "homeanalytics.raw.attom_listing_analytics_complete",
        "sampling": {"method": "system", "percent": args.sample_percent, "seed": 20260926, "per_category_limit": args.per_category},
        "rows": sum(counts.values()), "categories": dict(counts), "states": dict(sorted(states.items())),
        "splits": dict(splits), "sha256": digest.hexdigest(),
        "notes": "Address fields only. Source labels are evidence, not deliverability truth. Property groups never cross development/holdout.",
    }
    args.output.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == "__main__":
    main()
