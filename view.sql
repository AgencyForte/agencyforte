DROP MATERIALIZED VIEW IF EXISTS dynamic_competitor_discovery CASCADE;

CREATE MATERIALIZED VIEW dynamic_competitor_discovery AS
WITH target_agency AS (
    SELECT id, agency_name, category, location_id FROM agencies WHERE tdi_license_number = '19386116'
),
shared_carriers AS (
    SELECT 
        aca1.agency_id AS base_agency_id,
        aca2.agency_id AS competitor_agency_id,
        COUNT(*) AS shared_carriers_count,
        ARRAY_AGG(c.carrier_name) AS shared_carrier_names
    FROM target_agency ta
    JOIN agency_carrier_appointments aca1 ON aca1.agency_id = ta.id
    JOIN agency_carrier_appointments aca2 ON aca1.carrier_id = aca2.carrier_id AND aca1.agency_id != aca2.agency_id
    JOIN carriers c ON c.id = aca1.carrier_id
    WHERE aca1.status = 'ACTIVE' AND aca2.status = 'ACTIVE'
    GROUP BY aca1.agency_id, aca2.agency_id
)
SELECT 
    a1.id AS base_agency_id,
    a2.id AS competitor_agency_id,
    a1.agency_name AS base_agency_name,
    a2.agency_name AS competitor_agency_name,
    a1.category AS base_category,
    a2.category AS competitor_category,
    l1.msa AS msa,
    (point(l1.longitude, l1.latitude) <@> point(l2.longitude, l2.latitude)) AS distance_miles,
    sc.shared_carriers_count,
    sc.shared_carrier_names,
    compute_competition_score(
        (point(l1.longitude, l1.latitude) <@> point(l2.longitude, l2.latitude))::NUMERIC,
        sc.shared_carriers_count::INTEGER,
        a1.category
    ) AS competition_score
FROM shared_carriers sc
JOIN agencies a1 ON sc.base_agency_id = a1.id
JOIN locations l1 ON a1.location_id = l1.id
JOIN agencies a2 ON sc.competitor_agency_id = a2.id
JOIN locations l2 ON a2.location_id = l2.id
WHERE l1.msa = l2.msa AND a1.category = a2.category;

GRANT ALL ON dynamic_competitor_discovery TO anon, authenticated, service_role;
