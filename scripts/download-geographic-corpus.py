"""Read a county-balanced MLS corpus plus a separate difficult-format cohort.

All database statements are SELECTs. Excludes properties from the earlier corpus;
the extract, sampling manifest, and address-level results remain under .local.
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
    parser.add_argument("--rows", type=int, default=400000)
    parser.add_argument("--sample-percent", type=float, default=5)
    parser.add_argument("--exclude", type=Path, default=Path(".local/corpus/mls.jsonl"))
    parser.add_argument("--output", type=Path, default=Path(".local/corpus/mls-geographic.jsonl"))
    args = parser.parse_args()
    if not 300000 <= args.rows <= 500000 or not 0 < args.sample_percent <= 5:
        parser.error("rows must be 300000..500000 and sample-percent in (0, 5]")
    if ".local" not in args.output.parts:
        parser.error("source extracts must stay under .local")
    if args.output.exists():
        parser.error("output already exists; select a new path to preserve the frozen corpus")
    excluded = sorted({json.loads(line)["property_group"] for line in args.exclude.read_text().splitlines() if line})
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
        "SITUSCOUNTY": "county", "MLSLISTINGCOUNTYFIPS": "county_fips",
    }
    selection = ", ".join(f'trim(cast("{source}" as varchar)) as {alias}' for source, alias in columns.items())
    geographic_rows = args.rows * 3 // 4
    challenge_rows = args.rows - geographic_rows
    sql = f"""
    WITH sampled AS (
      SELECT {selection}
      FROM homeanalytics.raw.attom_listing_analytics_complete
      USING SAMPLE {args.sample_percent} PERCENT (system, 20260927)
    ), identified AS (
      SELECT * EXCLUDE(property_id), sha256(CASE
        WHEN coalesce(property_id, '') NOT IN ('', '999999999') THEN property_id
        ELSE concat_ws('|', coalesce(address_full,''), coalesce(unit,''), coalesce(city,''), coalesce(state,''), coalesce(zip,''))
      END) AS property_group,
      coalesce(nullif(state,''), 'UNKNOWN') || '/' || CASE
        WHEN regexp_full_match(coalesce(county_fips,''), '[0-9]{{5}}') THEN county_fips
        ELSE coalesce(nullif(upper(county),''), 'UNKNOWN') END AS county_group
      FROM sampled WHERE coalesce(address_full,'') <> ''
    ), unique_properties AS (
      SELECT * FROM identified WHERE NOT list_contains(?, property_group)
      QUALIFY row_number() OVER (PARTITION BY property_group ORDER BY hash(address_full, unit, listing_address, city, state, zip)) = 1
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
      FROM unique_properties
    ), geographic AS (
      SELECT * FROM categorized
      ORDER BY row_number() OVER (PARTITION BY county_group ORDER BY hash(property_group, 'geographic')), hash(property_group, 'geographic')
      LIMIT {geographic_rows}
    ), challenge AS (
      SELECT c.* FROM categorized c ANTI JOIN geographic g USING (property_group)
      WHERE c.category <> 'ordinary'
      ORDER BY row_number() OVER (PARTITION BY c.category ORDER BY hash(c.property_group, 'challenge')), hash(c.property_group, 'challenge')
      LIMIT {challenge_rows}
    )
    SELECT *, 'geographic' AS cohort FROM geographic
    UNION ALL
    SELECT *, 'challenge' AS cohort FROM challenge
    """
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".partial.jsonl")
    counts = {key: Counter() for key in ("states", "counties", "categories", "cohorts", "splits")}
    digest = hashlib.sha256()
    rows = 0
    with duckdb.connect("md:homeanalytics") as connection:
        print("Connected; reading county and challenge samples", flush=True)
        cursor = connection.execute(sql, [excluded])
        names = [column[0] for column in cursor.description]
        with temporary.open("w") as output:
            while batch := cursor.fetchmany(2000):
                for values in batch:
                    row = dict(zip(names, values))
                    row["split"] = "holdout" if int(row["property_group"][:8], 16) % 5 == 0 else "development"
                    line = json.dumps(row, ensure_ascii=False) + "\n"
                    output.write(line)
                    digest.update(line.encode())
                    for group, field in (("states", "state"), ("counties", "county_group"), ("categories", "category"), ("cohorts", "cohort"), ("splits", "split")):
                        counts[group][row.get(field) or "UNKNOWN"] += 1
                    rows += 1
                if rows % 50000 == 0:
                    print(f"Downloaded {rows:,} address records", flush=True)
    if rows != args.rows:
        raise RuntimeError(f"Sample yielded {rows:,} rows, expected {args.rows:,}; partial extract retained at {temporary}")
    temporary.rename(args.output)
    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "source": "homeanalytics.raw.attom_listing_analytics_complete",
        "sampling": {"method": "system then county/category-balanced ranks", "percent": args.sample_percent, "seed": 20260927, "requested_rows": args.rows, "geographic_rows": geographic_rows, "challenge_rows": challenge_rows},
        "excluded_property_groups": len(excluded), "excluded_corpus_sha256": hashlib.sha256(args.exclude.read_bytes()).hexdigest(),
        "rows": rows, "sha256": digest.hexdigest(), "query_sha256": hashlib.sha256(sql.encode()).hexdigest(),
        **{key: dict(sorted(value.items())) for key, value in counts.items()},
        "notes": "Address fields only; one record per property. County balancing is not population weighting. Challenge cohort is separate. No earlier corpus properties included. No remote writes.",
    }
    args.output.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({key: value for key, value in manifest.items() if key != "counties"}, indent=2), flush=True)


if __name__ == "__main__":
    main()
