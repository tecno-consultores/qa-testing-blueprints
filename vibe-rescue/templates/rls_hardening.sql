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
    ELSE
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

GRANT SELECT ON TABLE tenants TO app_runtime_user;

CREATE OR REPLACE FUNCTION resolve_tenant_by_slug(p_slug TEXT)
RETURNS TABLE(id UUID, slug VARCHAR, is_active BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT t.id, t.slug, t.is_active
    FROM public.tenants t
    WHERE t.slug = p_slug
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
AS $$
BEGIN
    RAISE EXCEPTION 'WORM violation: audit_log_worm is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_worm_audit_mutation ON audit_log_worm;
CREATE TRIGGER trg_prevent_worm_audit_mutation
    BEFORE UPDATE OR DELETE ON audit_log_worm
    FOR EACH ROW
    EXECUTE FUNCTION prevent_worm_audit_mutation();

CREATE OR REPLACE FUNCTION append_worm_audit_entry(
    p_id UUID,
    p_tenant_id UUID,
    p_actor_username VARCHAR,
    p_resource_display_name VARCHAR,
    p_action VARCHAR,
    p_before_state JSONB,
    p_after_state JSONB,
    p_record_sha256_hash CHAR
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_prev_hash CHAR(64);
    v_seq_num BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text));

    SELECT a.record_sha256_hash
    INTO v_prev_hash
    FROM public.audit_log_worm a
    WHERE a.tenant_id = p_tenant_id
    ORDER BY a.seq_num DESC
    LIMIT 1;

    IF v_prev_hash IS NULL THEN
        v_prev_hash := repeat('0', 64);
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
        p_record_sha256_hash
    )
    RETURNING seq_num INTO v_seq_num;

    RETURN v_seq_num;
END;
$$;

REVOKE ALL ON FUNCTION append_worm_audit_entry(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_worm_audit_entry(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, CHAR) TO app_runtime_user;
