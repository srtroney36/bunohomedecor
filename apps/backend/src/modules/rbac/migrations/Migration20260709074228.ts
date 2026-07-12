import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260709074228 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "role" drop constraint if exists "role_slug_unique";`);
    this.addSql(`create table if not exists "role" ("id" text not null, "name" text not null, "slug" text not null, "description" text null, "is_system" boolean not null default false, "permissions" jsonb not null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "role_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_role_slug_unique" ON "role" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_role_deleted_at" ON "role" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "role" cascade;`);
  }

}
