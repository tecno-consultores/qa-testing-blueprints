-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
-- Plantilla Idempotente PostgreSQL 15-17+ para Rescate Vibe-to-Enterprise (QA-PG17-RLS & SEC-14)
-- Parametrizacion: reemplazar 'tenant_records' por {{TARGET_TABLE}} segun la tabla de negocio multi-tenant.

-- ============================================================================
-- 1. Rol de Aplicacion Minimo Privilegio (QA-PG17-RLS / NOBYPASSRLS)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_user') THEN
        -- La credencial se inyecta externamente desde Vault/Secret Manager en tiempo de despliegue.
        CREATE ROLE app_runtime_user WITH LOGIN
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    ELSIF EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'app_runtime_user'
          AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)
    ) THEN
        ALTER ROLE app_runtime_user WITH
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;

-- ============================================================================
-- 2. Esquema Base y Purga de Politicas Permisivas Tipicas de Prototipos Vibe
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_records (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE tenant_records FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE tenant_records FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE tenant_records FROM authenticated;
    END IF;
END
$$;

DROP POLICY IF EXISTS "Enable read access for all users" ON tenant_records;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON tenant_records;
DROP POLICY IF EXISTS "Allow all" ON tenant_records;
DROP POLICY IF EXISTS permissive_vibe_policy ON tenant_records;

-- ============================================================================
-- 3. Aislamiento Estricto por Inquilino (ENABLE + FORCE ROW LEVEL SECURITY)
-- ============================================================================
ALTER TABLE tenant_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_records;

CREATE POLICY tenant_isolation_policy ON tenant_records
    FOR ALL
    TO app_runtime_user
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenant_records TO app_runtime_user;

-- Verificacion obligatoria en catalogo PostgreSQL 15-17+ (nunca pg_tables.forcerowsecurity):
-- SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
-- FROM pg_catalog.pg_class c
-- JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'tenant_records';

-- ============================================================================
-- 4. Funcion Pre-Auth Segura (SECURITY DEFINER) y Cadena WORM Inmutable (SEC-14)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY,
    slug VARCHAR(80) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

REVOKE ALL ON TABLE tenants FROM PUBLIC;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_isolation_policy ON tenants;
CREATE POLICY tenants_isolation_policy ON tenants
    FOR SELECT
    TO app_runtime_user
    USING (
        id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

DROP POLICY IF EXISTS tenants_definer_lookup_policy ON tenants;
CREATE POLICY tenants_definer_lookup_policy ON tenants
    FOR SELECT
    TO CURRENT_USER
    USING (current_user <> 'app_runtime_user');

GRANT SELECT ON TABLE tenants TO app_runtime_user;

CREATE OR REPLACE FUNCTION resolve_tenant_by_slug(p_slug TEXT)
RETURNS TABLE(id UUID, slug VARCHAR, is_active BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT t.id, t.slug, t.is_active
    FROM public.tenants t
    WHERE t.slug = NULLIF(pg_catalog.btrim(p_slug), '')
      AND t.is_active IS TRUE
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_tenant_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_by_slug(TEXT) TO app_runtime_user;

CREATE TABLE IF NOT EXISTS audit_log_worm (
    seq_num BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    actor_username VARCHAR(128) NOT NULL,
    resource_display_name VARCHAR(255) NOT NULL,
    action VARCHAR(64) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    prev_record_hash CHAR(64) NOT NULL,
    record_sha256_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

REVOKE ALL ON TABLE audit_log_worm FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log_worm FROM app_runtime_user;
GRANT SELECT, INSERT ON TABLE audit_log_worm TO app_runtime_user;
GRANT USAGE ON SEQUENCE public.audit_log_worm_seq_num_seq TO app_runtime_user;

ALTER TABLE audit_log_worm ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_worm FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_worm_select_policy ON audit_log_worm;
CREATE POLICY audit_log_worm_select_policy ON audit_log_worm
    FOR SELECT
    TO app_runtime_user
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

DROP POLICY IF EXISTS audit_log_worm_insert_policy ON audit_log_worm;
CREATE POLICY audit_log_worm_insert_policy ON audit_log_worm
    FOR INSERT
    TO app_runtime_user
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

CREATE OR REPLACE FUNCTION prevent_worm_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    RAISE EXCEPTION 'WORM violation: audit_log_worm is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_worm_audit_mutation ON public.audit_log_worm;
CREATE TRIGGER trg_prevent_worm_audit_mutation
    BEFORE UPDATE OR DELETE ON public.audit_log_worm
    FOR EACH ROW
    EXECUTE FUNCTION prevent_worm_audit_mutation();

DROP TRIGGER IF EXISTS trg_prevent_worm_audit_truncate ON public.audit_log_worm;
CREATE TRIGGER trg_prevent_worm_audit_truncate
    BEFORE TRUNCATE ON public.audit_log_worm
    FOR EACH STATEMENT
    EXECUTE FUNCTION prevent_worm_audit_mutation();

DROP FUNCTION IF EXISTS append_worm_audit_entry(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, CHAR);
DROP FUNCTION IF EXISTS append_worm_audit_entry(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, CHAR(64));

CREATE OR REPLACE FUNCTION append_worm_audit_entry(
    p_id UUID,
    p_tenant_id UUID,
    p_actor_username VARCHAR,
    p_resource_display_name VARCHAR,
    p_action VARCHAR,
    p_before_state JSONB,
    p_after_state JSONB,
    p_record_sha256_hash CHAR(64) DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_prev_hash CHAR(64);
    v_canonical_payload TEXT;
    v_expected_hash CHAR(64);
    v_supplied_hash TEXT;
    v_final_hash CHAR(64);
    v_seq_num BIGINT;
BEGIN
    IF p_id IS NULL OR p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'WORM validation error: p_id and p_tenant_id are required';
    END IF;
    IF p_actor_username IS NULL
       OR pg_catalog.btrim(p_actor_username) = ''
       OR pg_catalog.btrim(p_actor_username) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'WORM semantic audit error: p_actor_username must be human-readable (non-empty and non-UUIDv4)';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('audit:' || p_tenant_id::text));

    SELECT a.record_sha256_hash
    INTO v_prev_hash
    FROM public.audit_log_worm a
    WHERE a.tenant_id = p_tenant_id
    ORDER BY a.seq_num DESC
    LIMIT 1;

    IF v_prev_hash IS NULL THEN
        v_prev_hash := pg_catalog.repeat('0', 64);
    END IF;

    v_canonical_payload := pg_catalog.concat_ws(
        '|',
        v_prev_hash,
        p_id::text,
        p_tenant_id::text,
        COALESCE(p_actor_username, ''),
        COALESCE(p_resource_display_name, ''),
        COALESCE(p_action, ''),
        COALESCE(p_before_state::text, 'null'),
        COALESCE(p_after_state::text, 'null')
    );
    v_expected_hash := pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(v_canonical_payload, 'UTF8')),
        'hex'
    );

    IF p_record_sha256_hash IS NOT NULL THEN
        v_supplied_hash := pg_catalog.lower(pg_catalog.btrim(p_record_sha256_hash));
        IF v_supplied_hash !~ '^[0-9a-f]{64}$' THEN
            RAISE EXCEPTION 'WORM hash validation error: p_record_sha256_hash must be 64 hex chars';
        END IF;
        IF v_supplied_hash <> v_expected_hash THEN
            RAISE EXCEPTION 'WORM hash validation error: supplied hash % does not match expected %', v_supplied_hash, v_expected_hash;
        END IF;
        v_final_hash := v_expected_hash;
    ELSE
        v_final_hash := v_expected_hash;
    END IF;

    INSERT INTO public.audit_log_worm (
        id,
        tenant_id,
        actor_username,
        resource_display_name,
        action,
        before_state,
        after_state,
        prev_record_hash,
        record_sha256_hash
    )
    VALUES (
        p_id,
        p_tenant_id,
        p_actor_username,
        p_resource_display_name,
        p_action,
        p_before_state,
        p_after_state,
        v_prev_hash,
        v_final_hash
    )
    RETURNING seq_num INTO v_seq_num;

    RETURN v_seq_num;
END;
$$;

REVOKE ALL ON FUNCTION append_worm_audit_entry(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, CHAR(64)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_worm_audit_entry(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, CHAR(64)) TO app_runtime_user;
