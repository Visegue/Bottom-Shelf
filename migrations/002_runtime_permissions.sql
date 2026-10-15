-- Provision this login via Neon before migrating a new environment.
GRANT USAGE ON SCHEMA public TO bottom_shelf_app_runtime;
GRANT SELECT, INSERT, DELETE ON foundation_checks TO bottom_shelf_app_runtime;
REVOKE ALL ON schema_migrations FROM bottom_shelf_app_runtime;
