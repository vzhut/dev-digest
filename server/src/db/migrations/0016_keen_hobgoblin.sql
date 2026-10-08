ALTER TABLE "eval_runs" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "system_prompt" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "strategy" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "skills" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "case_ids" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "cases_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "cases_errored" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "unlabeled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "traces_passed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "traces_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "results" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "cost_partial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error_reason" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_source_owner_uq" ON "eval_cases" USING btree ("source_finding_id","owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "eval_cases_owner_idx" ON "eval_cases" USING btree ("workspace_id","owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "eval_runs_agent_ran_idx" ON "eval_runs" USING btree ("workspace_id","agent_id","ran_at");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running_per_agent" ON "eval_runs" USING btree ("agent_id") WHERE "eval_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_owner_chk" CHECK ("eval_cases"."owner_kind" <> 'agent' OR "eval_cases"."agent_id" = "eval_cases"."owner_id");