import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260712131013 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "stock_batch" ("id" text not null, "variant_id" text not null, "inventory_item_id" text null, "received_date" timestamptz not null, "qty_received" numeric not null, "unit_cost" numeric not null default 0, "freight_total" numeric not null default 0, "landed_unit_cost" numeric not null default 0, "currency_code" text not null default 'bdt', "source" text check ("source" in ('restock', 'found', 'opening')) not null default 'restock', "supplier" text null, "note" text null, "ledger_entry_id" text null, "raw_qty_received" jsonb not null, "raw_unit_cost" jsonb not null default '{"value":"0","precision":20}', "raw_freight_total" jsonb not null default '{"value":"0","precision":20}', "raw_landed_unit_cost" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "stock_batch_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_batch_deleted_at" ON "stock_batch" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_batch_variant_id" ON "stock_batch" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_batch_received_date" ON "stock_batch" ("received_date") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "stock_movement" ("id" text not null, "variant_id" text not null, "date" timestamptz not null, "quantity" numeric not null, "reason" text check ("reason" in ('shrinkage', 'damage', 'correction')) not null default 'shrinkage', "note" text null, "raw_quantity" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "stock_movement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_movement_deleted_at" ON "stock_movement" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_movement_variant_id" ON "stock_movement" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_movement_date" ON "stock_movement" ("date") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "stock_batch" cascade;`);

    this.addSql(`drop table if exists "stock_movement" cascade;`);
  }

}
