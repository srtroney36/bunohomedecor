import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260712104850 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ledger_entry" drop constraint if exists "ledger_entry_category_check";`);

    this.addSql(`alter table if exists "ledger_entry" add constraint "ledger_entry_category_check" check("category" in ('capital_contribution', 'partner_drawing', 'inventory_purchase', 'packaging_purchase', 'fixed_asset', 'marketing', 'courier_fee', 'other_expense', 'refund'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "ledger_entry" drop constraint if exists "ledger_entry_category_check";`);

    this.addSql(`alter table if exists "ledger_entry" add constraint "ledger_entry_category_check" check("category" in ('capital_contribution', 'partner_drawing', 'inventory_purchase', 'fixed_asset', 'marketing', 'courier_fee', 'other_expense', 'refund'));`);
  }

}
