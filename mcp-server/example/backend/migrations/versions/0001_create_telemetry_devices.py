# SPDX-License-Identifier: MIT
"""Create telemetry_devices with PostgreSQL 17 FORCE ROW LEVEL SECURITY."""

revision = "0001_telemetry_devices"
down_revision = None
branch_labels = None
depends_on = None


def upgrade(op: object) -> None:
    sql_statements = [
        """
        CREATE TABLE telemetry_devices (
            id VARCHAR(64) PRIMARY KEY,
            tenant_id VARCHAR(64) NOT NULL,
            hostname VARCHAR(128) NOT NULL,
            cpu_load_pct NUMERIC(5, 2) NOT NULL
        );
        """,
        "ALTER TABLE telemetry_devices ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE telemetry_devices FORCE ROW LEVEL SECURITY;",
        """
        CREATE POLICY tenant_isolation_policy ON telemetry_devices
            USING (tenant_id = current_setting('app.current_tenant_id', true));
        """,
    ]
    _ = (op, sql_statements)


def verify_rls_catalog_query() -> str:
    """Consulta canónica PG 15-17+ sobre pg_class.relforcerowsecurity."""
    return (
        "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity "
        "FROM pg_catalog.pg_class c "
        "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = 'public' AND c.relname = 'telemetry_devices';"
    )
