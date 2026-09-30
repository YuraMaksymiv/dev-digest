ALTER TABLE "findings" ADD COLUMN "out_of_scope" boolean;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb;