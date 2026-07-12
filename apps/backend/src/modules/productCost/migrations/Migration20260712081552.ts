import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * `variant_cost.cost` was an `integer` (Medusa's DML maps `model.number()` to int4), so
 * Postgres silently rounded every write: a cost of 800.50 was stored as 800. That
 * understated COGS and overstated gross profit on every order containing the variant,
 * and it would have poisoned inventory-at-cost and net worth in the Accounting section.
 *
 * `model.bigNumber()` maps to `numeric` plus a companion `raw_<field>` jsonb column.
 *
 * The `update` below is hand-added and load-bearing. The generated migration only gave
 * `raw_cost` a *constant* default of `{"value":"0"}`, which every pre-existing row would
 * have adopted — leaving raw_cost claiming 0 while `cost` still held the real figure.
 * The BigNumber getter falls back to raw_cost whenever the hydrated value is falsy, so
 * that disagreement is a live footgun. Backfill raw_cost from the authoritative column.
 */
export class Migration20260712081552 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "variant_cost" add column if not exists "raw_cost" jsonb not null default '{"value":"0","precision":20}';`);
    this.addSql(`alter table if exists "variant_cost" alter column "cost" type numeric using ("cost"::numeric);`);
    this.addSql(`update "variant_cost" set "raw_cost" = jsonb_build_object('value', "cost"::text, 'precision', 20);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "variant_cost" drop column if exists "raw_cost";`);

    this.addSql(`alter table if exists "variant_cost" alter column "cost" type integer using (round("cost")::integer);`);
  }

}
