-- AgencyForte PostgreSQL Schema Definition
-- Designed for Local Sandbox & Future Supabase Production

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Enable PostGIS or Earthdistance for geographic distance calculations
CREATE EXTENSION IF NOT EXISTS "cube";
CREATE EXTENSION IF NOT EXISTS "earthdistance";

-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE agency_category AS ENUM ('COMMERCIAL', 'PERSONAL_AUTO', 'BOTH');
CREATE TYPE appointment_status AS ENUM ('ACTIVE', 'TERMINATED');
CREATE TYPE movement_type AS ENUM ('HIRED', 'EXITED', 'RETIRED');
CREATE TYPE event_type AS ENUM ('APPOINTMENT_GAINED', 'APPOINTMENT_LOST', 'MASS_TERMINATION');
CREATE TYPE producer_lob AS ENUM ('COMMERCIAL_P_C', 'PERSONAL_P_C', 'LIFE_HEALTH', 'BENEFITS');

-- ==========================================
-- CORE ENTITIES
-- ==========================================

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address_line_1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    msa VARCHAR(100),
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tdi_license_number VARCHAR(50) UNIQUE, -- State-issued license ID
    agency_name VARCHAR(255) NOT NULL,
    category agency_category,
    website VARCHAR(255),
    founded_year INTEGER,
    total_producers_count INTEGER DEFAULT 0,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    ams_system VARCHAR(100),
    estimated_premium_volume VARCHAR(100),
    bus_factor_pct NUMERIC(5,2), -- % of carriers held by top producer
    median_producer_tenure_months INTEGER, -- To expose "Amateur Hour" rosters
    
    -- Ecosystem Tagging
    is_micro BOOLEAN DEFAULT FALSE,
    is_icp BOOLEAN DEFAULT FALSE,
    is_enterprise BOOLEAN DEFAULT FALSE,
    is_captive BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- SAAS IDENTITY & MULTI-TENANT ENTITIES
-- ==========================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    subscription_status VARCHAR(50) DEFAULT 'ACTIVE',
    phone_number VARCHAR(20), -- For SMS Tripwires
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    alert_min_tenure_years INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, agency_id)
);

CREATE TABLE carriers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    carrier_name VARCHAR(255) NOT NULL UNIQUE,
    am_best_rating VARCHAR(10),
    hq_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE producers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    npn VARCHAR(50) UNIQUE, -- National Producer Number
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    current_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
    original_license_date DATE, -- For calculating overall industry clout
    current_agency_start_date DATE, -- For calculating flight risk
    active_appointments_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- EXTENDED ENTITIES
-- ==========================================

CREATE TABLE agency_niches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    niche_name VARCHAR(100) NOT NULL,
    UNIQUE (agency_id, niche_name)
);

CREATE TABLE producer_lines_of_business (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID REFERENCES producers(id) ON DELETE CASCADE,
    line_of_business producer_lob NOT NULL,
    UNIQUE (producer_id, line_of_business)
);

-- ==========================================
-- TRANSACTIONAL & RELATIONAL ENTITIES
-- ==========================================

CREATE TABLE agency_carrier_appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    carrier_id UUID REFERENCES carriers(id) ON DELETE CASCADE,
    appointment_date DATE,
    status appointment_status DEFAULT 'ACTIVE',
    termination_date DATE,
    is_top_carrier BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (agency_id, carrier_id)
);

CREATE TABLE producer_carrier_appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID REFERENCES producers(id) ON DELETE CASCADE,
    carrier_id UUID REFERENCES carriers(id) ON DELETE CASCADE,
    appointment_date DATE,
    status appointment_status DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (producer_id, carrier_id)
);

CREATE TABLE producer_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID REFERENCES producers(id) ON DELETE CASCADE,
    from_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
    to_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
    movement_date DATE NOT NULL,
    movement_type movement_type NOT NULL,
    lines_affected TEXT[], -- Array of strings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE carrier_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    carrier_id UUID REFERENCES carriers(id) ON DELETE CASCADE,
    event_type event_type NOT NULL,
    event_date DATE NOT NULL,
    producers_affected_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE producer_carrier_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producer_id UUID REFERENCES producers(id) ON DELETE CASCADE,
    carrier_id UUID REFERENCES carriers(id) ON DELETE CASCADE,
    event_type event_type NOT NULL,
    event_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE competitor_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    base_agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    competitor_agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
    distance_miles NUMERIC(10, 2),
    competition_score NUMERIC(10, 2),
    overlap_carriers_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (base_agency_id, competitor_agency_id),
    CHECK (base_agency_id != competitor_agency_id)
);

-- ==========================================
-- DYNAMIC COMPETITION DISCOVERY
-- ==========================================

-- 1. Helper function for Competition Score
-- Proximity matters less for Commercial.
CREATE OR REPLACE FUNCTION compute_competition_score(
    p_distance_miles NUMERIC,
    p_shared_carriers INTEGER,
    p_category agency_category
) RETURNS NUMERIC AS $$
DECLARE
    score NUMERIC := 0;
BEGIN
    -- Base score from shared carriers (high impact)
    score := p_shared_carriers * 10;
    
    IF p_category = 'COMMERCIAL' THEN
        -- Proximity matters less for Commercial
        IF p_distance_miles <= 50 THEN
            score := score + 5;
        END IF;
    ELSE
        -- Proximity matters heavily for Personal/Auto (and 'BOTH')
        IF p_distance_miles <= 10 THEN
            score := score + 20;
        ELSIF p_distance_miles <= 25 THEN
            score := score + 10;
        END IF;
    END IF;
    
    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- 2. Materialized View to discover dynamic competitors
CREATE MATERIALIZED VIEW dynamic_competitor_discovery AS
SELECT 
    a1.id AS base_agency_id,
    a2.id AS competitor_agency_id,
    a1.agency_name AS base_agency_name,
    a2.agency_name AS competitor_agency_name,
    a1.category AS base_category,
    a2.category AS competitor_category,
    l1.msa AS msa,
    -- Calculate distance using earthdistance (results in miles when converted from meters, or miles directly depending on point configuration)
    (point(l1.longitude, l1.latitude) <@> point(l2.longitude, l2.latitude)) AS distance_miles,
    -- Calculate overlapping active carriers
    (
        SELECT COUNT(*)
        FROM agency_carrier_appointments aca1
        JOIN agency_carrier_appointments aca2 ON aca1.carrier_id = aca2.carrier_id
        WHERE aca1.agency_id = a1.id AND aca2.agency_id = a2.id
          AND aca1.status = 'ACTIVE' AND aca2.status = 'ACTIVE'
    ) AS shared_carriers_count,
    -- Computed Score
    compute_competition_score(
        (point(l1.longitude, l1.latitude) <@> point(l2.longitude, l2.latitude))::NUMERIC,
        (
            SELECT COUNT(*)::INTEGER
            FROM agency_carrier_appointments aca1
            JOIN agency_carrier_appointments aca2 ON aca1.carrier_id = aca2.carrier_id
            WHERE aca1.agency_id = a1.id AND aca2.agency_id = a2.id
              AND aca1.status = 'ACTIVE' AND aca2.status = 'ACTIVE'
        ),
        a1.category
    ) AS competition_score
FROM agencies a1
JOIN locations l1 ON a1.location_id = l1.id
JOIN agencies a2 ON a1.id != a2.id
JOIN locations l2 ON a2.location_id = l2.id
WHERE l1.msa = l2.msa 
  AND a1.category = a2.category;
