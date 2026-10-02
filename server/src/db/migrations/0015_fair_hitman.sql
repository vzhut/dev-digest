ALTER TABLE "repos" ADD COLUMN "context_roots" jsonb;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "context_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "context_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;