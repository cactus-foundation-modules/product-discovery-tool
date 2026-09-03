-- product-discovery-tool 002: the wording above each step.
--
-- The three headings a shopper reads on their way through - "What are you
-- looking for?", "Which sort of desks?", "What matters to you?" - were written
-- into the shell. They are the flow's own words, not the module's: a shop
-- selling one range asks a different first question from one selling five, and
-- neither should need a release to say so.
--
-- Nullable with no SQL default on purpose. An empty column means "use the
-- wording the module ships", so improving that wording later reaches every site
-- that has not overridden it, which a DEFAULT baked into the row would not.
--
-- Idempotent, and 001 carries the same columns for a fresh install: the overlap
-- is harmless and the ledger only ever runs this file once anyway.
ALTER TABLE "pdt_flows" ADD COLUMN IF NOT EXISTS "first_step_heading" TEXT;
ALTER TABLE "pdt_flows" ADD COLUMN IF NOT EXISTS "later_step_heading" TEXT;
ALTER TABLE "pdt_flows" ADD COLUMN IF NOT EXISTS "features_heading" TEXT;
