ALTER TABLE "onboarding" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "llm_calls" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "generated_sha" text;