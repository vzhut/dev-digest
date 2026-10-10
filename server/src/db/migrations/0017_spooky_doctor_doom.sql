CREATE INDEX "eval_cases_agent_idx" ON "eval_cases" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "eval_runs_agent_idx" ON "eval_runs" USING btree ("agent_id","ran_at");--> statement-breakpoint
CREATE INDEX "eval_runs_case_idx" ON "eval_runs" USING btree ("case_id");--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_status_chk" CHECK ("eval_runs"."status" IS NULL OR "eval_runs"."status" IN ('running', 'completed', 'errored'));--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_scope_chk" CHECK ("eval_runs"."status" IS NULL OR ("eval_runs"."workspace_id" IS NOT NULL AND "eval_runs"."agent_id" IS NOT NULL));