import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713055944 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "order_workflow" add column if not exists "order_type" text check ("order_type" in ('ready_stock', 'pre_order', 'custom')) not null default 'ready_stock', add column if not exists "production_cost" numeric not null default 0, add column if not exists "delivery_charged" numeric null, add column if not exists "raw_production_cost" jsonb not null default '{"value":"0","precision":20}', add column if not exists "raw_delivery_charged" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "order_workflow" drop column if exists "order_type", drop column if exists "production_cost", drop column if exists "delivery_charged", drop column if exists "raw_production_cost", drop column if exists "raw_delivery_charged";`);
  }

}
