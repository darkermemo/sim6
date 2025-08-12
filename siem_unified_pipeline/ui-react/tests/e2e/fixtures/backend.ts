import { test as base } from '@playwright/test';
import cp from 'node:child_process';

type Fixtures = {
  seed: () => Promise<void>;
};

export const test = base.extend<Fixtures>({
  seed: async ({}, use) => {
    await new Promise<void>((resolve) => {
      // Seed one matching event
      cp.exec(
        "clickhouse client -q \"INSERT INTO dev.events (event_id,event_timestamp,tenant_id,event_category,event_action,event_outcome,source_ip,destination_ip,user_id,user_name,severity,message,raw_event,metadata,source_type,created_at) VALUES ('ui-e2e',toUInt32(now()),'default','auth','login','failure','10.9.0.1','10.0.0.10',NULL,'ui','HIGH','login fail','{}','{}','app',toUInt32(now()))\"",
        () => resolve()
      );
    });
    await use(async () => {});
  },
});

export const expect = base.expect;


