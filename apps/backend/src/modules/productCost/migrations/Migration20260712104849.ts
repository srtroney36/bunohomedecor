import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260712104849 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "variant_cost" add column if not exists "packaging_cost" numeric not null default 0, add column if not exists "raw_packaging_cost" jsonb not null default '{"value":"0","precision":20}';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "variant_cost" drop column if exists "packaging_cost", drop column if exists "raw_packaging_cost";`);
  }

}
