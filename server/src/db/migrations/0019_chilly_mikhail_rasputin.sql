ALTER TABLE "ci_installations" ADD COLUMN "manifest_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_uq" ON "ci_installations" USING btree ("agent_id","repo");