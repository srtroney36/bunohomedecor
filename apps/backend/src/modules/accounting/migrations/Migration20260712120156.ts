import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260712120156 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ledger_entry" drop constraint if exists "ledger_entry_source_type_check";`);

    this.addSql(`alter table if exists "ledger_entry" add constraint "ledger_entry_source_type_check" check("source_type" in ('manual', 'fixed_asset', 'marketing_spend', 'restock'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "ledger_entry" drop constraint if exists "ledger_entry_source_type_check";`);

    this.addSql(`alter table if exists "ledger_entry" add constraint "ledger_entry_source_type_check" check("source_type" in ('manual', 'fixed_asset', 'marketing_spend'));`);
  }

}
