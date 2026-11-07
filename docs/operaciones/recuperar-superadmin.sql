-- Ejecución manual por un operador autorizado; ver recuperacion-superadmin.md.
-- Las variables son de psql y se citan como literales, nunca como identificadores SQL.
BEGIN ISOLATION LEVEL SERIALIZABLE;
LOCK TABLE "Role", "User" IN SHARE ROW EXCLUSIVE MODE;
SELECT set_config('ifts2.recovery_user_id', :'recovery_user_id', true);
SELECT set_config('ifts2.recovery_reason', :'recovery_reason', true);

DO $$
DECLARE
  target "User"%ROWTYPE;
  superadmin_id text;
  reason text := current_setting('ifts2.recovery_reason');
BEGIN
  IF btrim(reason) = '' THEN
    RAISE EXCEPTION 'Se requiere una referencia de autorización para la recuperación.';
  END IF;

  SELECT "id" INTO superadmin_id FROM "Role" WHERE "key" = 'SUPERADMIN';
  IF superadmin_id IS NULL THEN
    RAISE EXCEPTION 'Falta el rol SUPERADMIN: revisar el estado de las migraciones.';
  END IF;
  IF EXISTS (SELECT 1 FROM "User" WHERE "roleId" = superadmin_id AND "active") THEN
    RAISE EXCEPTION 'Ya existe un SUPERADMIN activo: usar el panel o recuperar sus credenciales.';
  END IF;

  SELECT * INTO target FROM "User"
    WHERE "id" = current_setting('ifts2.recovery_user_id') FOR UPDATE;
  IF NOT FOUND OR NOT target."active" THEN
    RAISE EXCEPTION 'La recuperación requiere el ID exacto de una cuenta activa verificada.';
  END IF;

  UPDATE "User" SET "roleId" = superadmin_id, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = target."id";
  DELETE FROM "Session" WHERE "userId" = target."id";
  INSERT INTO "AuditLog" ("id", "userId", "action", "entity", "entityId", "detail", "at")
    VALUES (gen_random_uuid()::text, NULL, 'user.recover-superadmin', 'User', target."id",
      jsonb_build_object('previousRoleId', target."roleId", 'reason', reason,
        'databaseOperator', session_user), CURRENT_TIMESTAMP);
END $$;
COMMIT;
