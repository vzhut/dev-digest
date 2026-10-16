ALTER TABLE "findings" ADD COLUMN "learned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "learned_memory_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "multi_agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "multi_agent_runs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "multi_agent_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_learned_memory_id_memory_id_fk" FOREIGN KEY ("learned_memory_id") REFERENCES "public"."memory"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_multi_agent_run_id_multi_agent_runs_id_fk" FOREIGN KEY ("multi_agent_run_id") REFERENCES "public"."multi_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_multi_agent_run_id_idx" ON "agent_runs" USING btree ("multi_agent_run_id");