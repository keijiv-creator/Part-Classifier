import { pgTable, serial, text, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";

export const runsTable = pgTable("runs", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reportDate: text("report_date"),
  cutoffYear: integer("cutoff_year"),
  faiThreshold: real("fai_threshold"),
  summaryJson: jsonb("summary_json"),
  totalUniqueParts: integer("total_unique_parts"),
  newDealsCount: integer("new_deals_count"),
  pdInfoCount: integer("pd_info_count"),
  totalNewDealsRevenue: real("total_new_deals_revenue"),
  totalPdPipelineValue: real("total_pd_pipeline_value"),
  wonDealsCount: integer("won_deals_count"),
  wonDealsValue: real("won_deals_value"),
  openDealsCount: integer("open_deals_count"),
  openDealsValue: real("open_deals_value"),
});

export type Run = typeof runsTable.$inferSelect;

export const runPartsTable = pgTable("run_parts", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => runsTable.id, { onDelete: "cascade" }),
  sheetType: text("sheet_type").notNull(),
  customerPartId: text("customer_part_id").notNull(),
  orgId: text("org_id"),
  name: text("name"),
  mappedStatus: text("mapped_status"),
  mappedProbability: text("mapped_probability"),
  mappedMedRev: real("mapped_med_rev"),
  mappedPdP1Time: text("mapped_pd_p1_time"),
  mappedPdP2Time: text("mapped_pd_p2_time"),
  mappedPdP4Time: text("mapped_pd_p4_time"),
  mappedPdP5Time: text("mapped_pd_p5_time"),
  quoteNumber: text("quote_number"),
  firstOrderDate: text("first_order_date"),
  firstOrderNo: text("first_order_no"),
  landmarkQuoteNo: text("landmark_quote_no"),
  calcLabel: text("calc_label"),
  pdId: text("pd_id"),
  pdValue: real("pd_value"),
  pdStatus: text("pd_status"),
  pdStage: text("pd_stage"),
  pdLabel: text("pd_label"),
  pdIndustry: text("pd_industry"),
  pdDealType: text("pd_deal_type"),
  pdMfgType: text("pd_mfg_type"),
  pdPlatform: text("pd_platform"),
  pdTitle: text("pd_title"),
  pdOrgName: text("pd_org_name"),
});

export type RunPart = typeof runPartsTable.$inferSelect;
