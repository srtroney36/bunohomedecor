import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713032720 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "order_workflow" drop constraint if exists "order_workflow_order_id_unique";`);
    this.addSql(`create table if not exists "courier_rate" ("id" text not null, "name" text not null, "fee" numeric not null default 0, "cod_fee_pct" numeric not null default 0, "is_default" boolean not null default false, "is_active" boolean not null default true, "raw_fee" jsonb not null default '{"value":"0","precision":20}', "raw_cod_fee_pct" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "courier_rate_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_courier_rate_deleted_at" ON "courier_rate" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_courier_rate_is_default" ON "courier_rate" ("is_default") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "order_status_event" ("id" text not null, "order_id" text not null, "field" text not null, "from_value" text null, "to_value" text not null, "actor_id" text null, "source" text not null default 'admin', "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "order_status_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_status_event_deleted_at" ON "order_status_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_status_event_order_id" ON "order_status_event" ("order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "order_workflow" ("id" text not null, "order_id" text not null, "stage" text check ("stage" in ('new_order', 'confirmed', 'in_production', 'ready_to_dispatch', 'courier_booked', 'on_hold')) not null default 'new_order', "issue_status" text check ("issue_status" in ('none', 'returned', 'damaged', 'wrong_product', 'exchange_requested', 'refunded')) not null default 'none', "is_cod" boolean not null default true, "advance_amount" numeric not null default 0, "courier_fee" numeric not null default 0, "courier_rate_id" text null, "note" text null, "raw_advance_amount" jsonb not null default '{"value":"0","precision":20}', "raw_courier_fee" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "order_workflow_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_workflow_order_id_unique" ON "order_workflow" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_workflow_deleted_at" ON "order_workflow" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_workflow_stage" ON "order_workflow" ("stage") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_workflow_issue_status" ON "order_workflow" ("issue_status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "courier_rate" cascade;`);

    this.addSql(`drop table if exists "order_status_event" cascade;`);

    this.addSql(`drop table if exists "order_workflow" cascade;`);
  }

}
