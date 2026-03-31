DO $$
BEGIN
  UPDATE "Setting"
  SET
    "settingValue" = jsonb_set(
      "settingValue",
      '{enabledModules}',
      ("settingValue"->'enabledModules') || '"audit"'::jsonb,
      true
    ),
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "settingKey" = 'settings.org_profile.v1'
    AND jsonb_typeof("settingValue"->'enabledModules') = 'array'
    AND NOT (("settingValue"->'enabledModules') @> '["audit"]'::jsonb);
END $$;
