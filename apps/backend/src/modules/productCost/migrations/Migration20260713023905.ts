import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713023905 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "stock_batch" add column if not exists "location_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "stock_batch" drop column if exists "location_id";`);
  }

}
