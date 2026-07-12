import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260712081907 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ledger_entry" drop constraint if exists "ledger_entry_source_type_source_id_unique";`);
    this.addSql(`create table if not exists "fixed_asset" ("id" text not null, "name" text not null, "category" text check ("category" in ('equipment', 'furniture', 'electronics', 'tools', 'other')) not null default 'equipment', "purchase_date" timestamptz not null, "cost" numeric not null, "currency_code" text not null default 'bdt', "quantity" integer not null default 1, "supplier" text null, "notes" text null, "is_disposed" boolean not null default false, "disposed_at" timestamptz null, "raw_cost" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fixed_asset_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fixed_asset_deleted_at" ON "fixed_asset" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fixed_asset_purchase_date" ON "fixed_asset" ("purchase_date") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fixed_asset_is_disposed" ON "fixed_asset" ("is_disposed") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ledger_entry" ("id" text not null, "entry_date" timestamptz not null, "direction" text check ("direction" in ('in', 'out')) not null, "category" text check ("category" in ('capital_contribution', 'partner_drawing', 'inventory_purchase', 'fixed_asset', 'marketing', 'courier_fee', 'other_expense', 'refund')) not null, "amount" numeric not null, "currency_code" text not null default 'bdt', "description" text null, "reference" text null, "partner_id" text null, "source_type" text check ("source_type" in ('manual', 'fixed_asset', 'marketing_spend')) not null default 'manual', "source_id" text null, "metadata" jsonb null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ledger_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_deleted_at" ON "ledger_entry" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_entry_date" ON "ledger_entry" ("entry_date") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_category" ON "ledger_entry" ("category") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_partner_id" ON "ledger_entry" ("partner_id") WHERE partner_id IS NOT NULL AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ledger_entry_source_type_source_id_unique" ON "ledger_entry" ("source_type", "source_id") WHERE source_id IS NOT NULL AND deleted_at IS NULL;`);

    this.addSql(`create table if not exists "marketing_spend" ("id" text not null, "spend_date" timestamptz not null, "platform" text check ("platform" in ('facebook', 'instagram', 'google', 'tiktok', 'influencer', 'other')) not null default 'facebook', "campaign" text null, "amount" numeric not null, "currency_code" text not null default 'bdt', "notes" text null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketing_spend_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_spend_deleted_at" ON "marketing_spend" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_spend_spend_date" ON "marketing_spend" ("spend_date") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_spend_platform" ON "marketing_spend" ("platform") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "partner" ("id" text not null, "name" text not null, "email" text null, "phone" text null, "joined_at" timestamptz null, "notes" text null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "partner_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_partner_deleted_at" ON "partner" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fixed_asset" cascade;`);

    this.addSql(`drop table if exists "ledger_entry" cascade;`);

    this.addSql(`drop table if exists "marketing_spend" cascade;`);

    this.addSql(`drop table if exists "partner" cascade;`);
  }

}
