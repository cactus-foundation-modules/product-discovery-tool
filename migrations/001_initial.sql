-- product-discovery-tool: initial schema.
--
-- A guided buying flow over the filters that already exist. Nothing here is a
-- second filtering engine: `filters-for-shop` owns the vocabulary and the
-- matching, and every table below is content, sequencing and teaching copy.
--
-- All DDL is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). Later schema
-- changes ship as a NEW numbered file (002_*.sql, ...) - never edits to this
-- one: the migration ledger records this file as applied, so an edit here would
-- only ever reach fresh installs.

-- One configured tool. Several are allowed - "Find your desk" and "Find your
-- chair" can be separate flows at separate addresses - and a site wanting one
-- flow covering everything simply has one.
CREATE TABLE IF NOT EXISTS "pdt_flows" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  -- The bare top-level address the flow answers at: /find-your-desk. Bare
  -- rather than prefixed because that is where this platform already puts
  -- products, posts and filter collections, and because it is the address worth
  -- linking to from a campaign.
  "slug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'PUBLISHED')),
  "heading" TEXT,
  "standfirst" TEXT,
  -- The designed intro document, built in the full-screen builder. Null until
  -- someone opens the builder and saves something.
  "intro_puck" JSONB,
  -- Which products the whole flow can ever reach, before any node narrows it.
  "scope_type" TEXT NOT NULL DEFAULT 'ALL' CHECK ("scope_type" IN ('ALL', 'CATEGORY', 'COLLECTION', 'TAG')),
  -- The shop category/collection/tag slug the scope names. NULL on ALL.
  --
  -- Deliberately the slug and not a foreign key, for the reason
  -- flt_collections gives: shop owns those tables and a dependent module has no
  -- business constraining a rename. A slug pointing at nothing shows as a
  -- warning in the admin rather than the database refusing a rename it should
  -- never have had a say in.
  "scope_slug" TEXT,
  -- What the shopper reads above each step. Empty means the wording the module
  -- ships ("What are you looking for?", "Which sort of desks?", "What matters
  -- to you?"); `later_step_heading` may carry {choice}, which is replaced with
  -- the answer they have just given. Added again in 002 for existing installs.
  "first_step_heading" TEXT,
  "later_step_heading" TEXT,
  "features_heading" TEXT,
  "meta_title" TEXT,
  "meta_description" TEXT,
  -- Social share image, held as a media url (lib/media-reference-rewriter.ts
  -- keeps it pointing at the right blob when one moves).
  "og_image" TEXT,
  "noindex" BOOLEAN NOT NULL DEFAULT false,
  "show_prices" BOOLEAN NOT NULL DEFAULT true,
  -- Whether a browse step offers "Not sure yet". Skipping keeps every option
  -- live over the scope reached so far rather than guessing on the shopper's
  -- behalf.
  "allow_skip" BOOLEAN NOT NULL DEFAULT true,
  "results_per_page" INTEGER NOT NULL DEFAULT 24,
  -- The finish CTA is opt-in and blank by default. Label and address both empty
  -- means the results ARE the end of the flow. A flow must never end on a
  -- button pointing at a module the site does not run, so the admin offers the
  -- field and never a default value, and never infers one from what is
  -- installed.
  "finish_cta_label" TEXT,
  "finish_cta_href" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pdt_flows_slug_key" UNIQUE ("slug")
);

-- The hand-built browse tree behind the early steps. Self-referencing, so depth
-- 1 is "Desks, Chairs, Storage" and depth 2 is "Rectangular, Height adjustable,
-- Corner". Depth is not fixed at two: a site with a simpler catalogue has one
-- level, and the wizard's step count follows the tree branch by branch.
--
-- Never a mirror of the category tree. A desk "type" is sometimes a category
-- (Corner desks) and sometimes a filter tick (Height adjustable), and one node
-- can be both - narrow to a category AND arrive with filters ticked.
CREATE TABLE IF NOT EXISTS "pdt_nodes" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "flow_id" TEXT NOT NULL REFERENCES "pdt_flows"("id") ON DELETE CASCADE,
  "parent_id" TEXT REFERENCES "pdt_nodes"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  -- The query-string value: ?pick=desks/height-adjustable.
  "slug" TEXT NOT NULL,
  -- One line on the card.
  "blurb" TEXT,
  -- "What this is", the long version, behind the card's info affordance.
  "explainer" TEXT,
  -- The comparison table's two useful columns.
  "best_for" TEXT,
  "not_for" TEXT,
  "image_url" TEXT,
  "icon" TEXT,
  -- What choosing this node selects. ALL means "the same products as my
  -- parent", not the whole shop - a node inherits its ancestors' scope, and
  -- FILTERS narrows by ticks rather than by shelf.
  "scope_type" TEXT NOT NULL DEFAULT 'ALL' CHECK ("scope_type" IN ('ALL', 'CATEGORY', 'COLLECTION', 'TAG', 'FILTERS')),
  "scope_slug" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "pdt_nodes_flow_id_idx" ON "pdt_nodes"("flow_id");
CREATE INDEX IF NOT EXISTS "pdt_nodes_parent_id_idx" ON "pdt_nodes"("parent_id");
-- Uniqueness as an expression index rather than a constraint. A plain
-- UNIQUE (flow_id, parent_id, slug) is no constraint at all on ROOT nodes,
-- because Postgres treats every NULL as distinct from every other - two root
-- "Desks" would both save. COALESCE folds the null parent to a real value.
CREATE UNIQUE INDEX IF NOT EXISTS "pdt_nodes_flow_parent_slug_key"
  ON "pdt_nodes" ("flow_id", COALESCE("parent_id", ''), "slug");

-- Filters a node applies the moment it is chosen. A real foreign key this time,
-- exactly as flt_collection_filters does: these are this module's own rows, so a
-- filter deleted in the filters admin takes its preselection with it rather than
-- leaving a step selecting something that no longer exists.
CREATE TABLE IF NOT EXISTS "pdt_node_filters" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "node_id" TEXT NOT NULL REFERENCES "pdt_nodes"("id") ON DELETE CASCADE,
  "filter_id" TEXT NOT NULL REFERENCES "flt_filters"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "pdt_node_filters_unique" UNIQUE ("node_id", "filter_id")
);
CREATE INDEX IF NOT EXISTS "pdt_node_filters_node_id_idx" ON "pdt_node_filters"("node_id");
CREATE INDEX IF NOT EXISTS "pdt_node_filters_filter_id_idx" ON "pdt_node_filters"("filter_id");

-- The features step's curation: which filter groups are asked, in what order,
-- with what wording. Rows are OPTIONAL - a group with no row still appears, in
-- the filters module's own order, after the curated ones - so a shop gets a
-- working features step before anybody writes a word.
CREATE TABLE IF NOT EXISTS "pdt_questions" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "flow_id" TEXT NOT NULL REFERENCES "pdt_flows"("id") ON DELETE CASCADE,
  -- NULL means every node in the flow.
  "node_id" TEXT REFERENCES "pdt_nodes"("id") ON DELETE CASCADE,
  "group_id" TEXT NOT NULL REFERENCES "flt_groups"("id") ON DELETE CASCADE,
  -- Override the group's own name: "How much height do you need?"
  "heading" TEXT,
  -- What this feature is, before the options.
  "explainer" TEXT,
  -- Primary questions are asked up front; secondary ones sit under "More
  -- options".
  "importance" TEXT NOT NULL DEFAULT 'PRIMARY' CHECK ("importance" IN ('PRIMARY', 'SECONDARY')),
  "multi" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "pdt_questions_flow_id_idx" ON "pdt_questions"("flow_id");
CREATE INDEX IF NOT EXISTS "pdt_questions_group_id_idx" ON "pdt_questions"("group_id");
-- Same NULL trap as the node tree, same fix.
CREATE UNIQUE INDEX IF NOT EXISTS "pdt_questions_flow_node_group_key"
  ON "pdt_questions" ("flow_id", COALESCE("node_id", ''), "group_id");

-- The teaching copy, per filter. Written once and reused by every flow, with an
-- optional node-scoped override for the cases where the same word means
-- something different on a chair than on a desk.
--
-- The comparison table is DERIVED from these three columns across a group's
-- filters rather than stored separately: one place to write, and a comparison
-- that cannot drift from the option cards beside it.
CREATE TABLE IF NOT EXISTS "pdt_option_notes" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "filter_id" TEXT NOT NULL REFERENCES "flt_filters"("id") ON DELETE CASCADE,
  -- NULL means global: this note explains the filter wherever it is offered.
  "node_id" TEXT REFERENCES "pdt_nodes"("id") ON DELETE CASCADE,
  "explainer" TEXT,
  "best_for" TEXT,
  "watch_out" TEXT,
  "image_url" TEXT,
  "learn_more_href" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "pdt_option_notes_filter_id_idx" ON "pdt_option_notes"("filter_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pdt_option_notes_filter_node_key"
  ON "pdt_option_notes" ("filter_id", COALESCE("node_id", ''));

-- Aggregate counters only: one row per (flow, day, step, choice, kind). No
-- visitor row, no identifier, no cookie, so this needs no consent category and
-- says nothing about anybody.
--
-- `day` is the UTC date. The counters answer "which options does nobody pick"
-- and "where do people leave", and a day boundary an hour out changes neither
-- answer; a per-site zone would mean a second column and a conversion on every
-- beacon for nothing.
CREATE TABLE IF NOT EXISTS "pdt_stats" (
  "flow_id" TEXT NOT NULL REFERENCES "pdt_flows"("id") ON DELETE CASCADE,
  "day" DATE NOT NULL,
  "step_key" TEXT NOT NULL,
  "choice_key" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('SHOW', 'PICK', 'REACH', 'FINISH', 'DEAD_END', 'RELAXED')),
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "pdt_stats_pkey" PRIMARY KEY ("flow_id", "day", "step_key", "choice_key", "kind")
);
CREATE INDEX IF NOT EXISTS "pdt_stats_flow_day_idx" ON "pdt_stats"("flow_id", "day");

CREATE TABLE IF NOT EXISTS "pdt_settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'singleton' CHECK ("id" = 'singleton'),
  -- When a combination reaches zero, offer the nearest sets instead of a dead
  -- end. Configurable off for an owner who would rather show nothing.
  "zero_result_recovery" BOOLEAN NOT NULL DEFAULT true,
  "show_counts" BOOLEAN NOT NULL DEFAULT true,
  "compare_enabled" BOOLEAN NOT NULL DEFAULT true,
  "swap_card_images" BOOLEAN NOT NULL DEFAULT true,
  "preselect_on_click" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "pdt_settings" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;
