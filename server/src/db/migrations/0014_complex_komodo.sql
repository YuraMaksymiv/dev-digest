ALTER TABLE "pr_intent" ADD COLUMN "confidence" double precision NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "category" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_category_ck" CHECK ("pr_intent"."category" in ('feat', 'fix', 'refactor', 'perf', 'chore', 'docs', 'test', 'style', 'build', 'ci', 'security'));