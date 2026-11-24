# SPDX-License-Identifier: MIT
"""Create telemetry_devices with PostgreSQL 17 FORCE ROW LEVEL SECURITY."""

from __future__ import annotations

from alembic import op

revision = "0001_telemetry_devices"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create telemetry_devices table with mandatory fail-closed FORCE RLS."""
    op.execute(
        """
        CREATE TABLE telemetry_devices (
            id VARCHAR(64) NOT NULL,
            tenant_id VARCHAR(64) NOT NULL,
            hostname VARCHAR(128) NOT NULL,
            cpu_load_pct NUMERIC(5, 2) NOT NULL,
            maintenance_starts_at TIMESTAMPTZ NULL,
            maintenance_ends_at TIMESTAMPTZ NULL,
            PRIMARY KEY (tenant_id, id)
        );
        """
    )
    op.execute("ALTER TABLE telemetry_devices ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE telemetry_devices FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation_policy ON telemetry_devices
            FOR ALL
            USING (
                tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')
            )
            WITH CHECK (
                tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')
            );
        """
    )


def downgrade() -> None:
    """Drop tenant isolation policy and telemetry_devices table."""
    op.execute(
        "DROP POLICY IF EXISTS tenant_isolation_policy ON telemetry_devices;"
    )
    op.execute("DROP TABLE IF EXISTS telemetry_devices;")


def verify_rls_catalog_query() -> str:
    """Consulta canónica PG 15-17+ sobre pg_class.relforcerowsecurity."""
    return (
        "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity "
        "FROM pg_catalog.pg_class c "
        "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = 'public' AND c.relname = 'telemetry_devices';"
    )
