#!/usr/bin/env node
/**
 * index.js — local stdio MCP server exposing read-only tools for an AWS
 * Athena database. Run it, then point Claude Desktop (Settings → Developer
 * → Edit Config) at this file — see README.md.
 *
 * Tools:
 *   list_tables     — list all tables in the configured database
 *   describe_table  — show columns and types for a table
 *   query           — run an arbitrary SELECT query (LIMIT enforced)
 *   sample_table    — return a sample of rows from a table
 *   table_stats     — get a row count for a table
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from "@aws-sdk/client-athena";
import { z } from "zod";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const REQUIRED_ENV = ["AWS_REGION", "ATHENA_WORKGROUP", "ATHENA_OUTPUT_LOCATION", "ATHENA_DATABASE"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `Missing required environment variable(s): ${missing.join(", ")}\n` +
      `Copy .env.example to .env and fill these in (see README.md).`,
  );
  process.exit(1);
}

const athena = new AthenaClient({ region: process.env.AWS_REGION });

const WORKGROUP = process.env.ATHENA_WORKGROUP;
const OUTPUT = process.env.ATHENA_OUTPUT_LOCATION;
const DATABASE = process.env.ATHENA_DATABASE;

async function runQuery(sql, database = DATABASE) {
  const start = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: { Database: database },
      WorkGroup: WORKGROUP,
      ResultConfiguration: { OutputLocation: OUTPUT },
    }),
  );

  const id = start.QueryExecutionId;

  for (let i = 0; i < 60; i++) {
    const status = await athena.send(
      new GetQueryExecutionCommand({ QueryExecutionId: id }),
    );
    const state = status.QueryExecution.Status.State;
    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") {
      const reason = status.QueryExecution.Status.StateChangeReason;
      throw new Error(`Query ${state}: ${reason}`);
    }
    await new Promise((r) => setTimeout(r, 1000 + i * 200));
  }

  const results = await athena.send(
    new GetQueryResultsCommand({ QueryExecutionId: id }),
  );
  return formatResults(results);
}

function formatResults(results) {
  const rows = results.ResultSet.Rows;
  if (!rows || rows.length === 0) return { columns: [], rows: [], rowCount: 0 };

  const columns = rows[0].Data.map((d) => d.VarCharValue);
  const data = rows
    .slice(1)
    .map((row) =>
      Object.fromEntries(
        columns.map((col, i) => [col, row.Data[i]?.VarCharValue ?? null]),
      ),
    );
  return { columns, rows: data, rowCount: data.length };
}

function renderTable(cols, rows) {
  const colWidths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
  );
  const header =
    "| " + cols.map((c, i) => c.padEnd(colWidths[i])).join(" | ") + " |";
  const divider =
    "| " + colWidths.map((w) => "-".repeat(w)).join(" | ") + " |";
  const dataRows = rows.map(
    (r) =>
      "| " +
      cols.map((c, i) => String(r[c] ?? "").padEnd(colWidths[i])).join(" | ") +
      " |",
  );
  return [header, divider, ...dataRows].join("\n");
}

const server = new McpServer({ name: "mcp-server-local", version: "1.0.0" });

server.tool("list_tables", `List all tables in ${DATABASE}`, {}, async () => {
  const result = await runQuery("SHOW TABLES");
  const tables = result.rows.map((r) => Object.values(r)[0]).filter(Boolean);
  return {
    content: [
      {
        type: "text",
        text: `Tables in ${DATABASE} (${tables.length}):\n\n${tables.map((t) => `• ${t}`).join("\n")}`,
      },
    ],
  };
});

server.tool(
  "describe_table",
  `Show columns and types for a table in ${DATABASE}`,
  { table: z.string().describe(`Table name in ${DATABASE}`) },
  async ({ table }) => {
    const safe = table.replace(/[^a-zA-Z0-9_]/g, "");
    const result = await runQuery(`DESCRIBE ${safe}`);
    const lines = result.rows
      .map(
        (r) =>
          `  ${(r.col_name || r["# col_name"] || "").padEnd(45)} ${r.data_type || ""}`,
      )
      .filter((l) => l.trim() && !l.includes("# "));
    return {
      content: [
        {
          type: "text",
          text: `${DATABASE}.${safe}\n${"─".repeat(60)}\n${lines.join("\n")}`,
        },
      ],
    };
  },
);

server.tool(
  "query",
  `Run a SELECT query against ${DATABASE}. Always include LIMIT. Do not use INSERT/UPDATE/DELETE/DROP.`,
  {
    sql: z.string().describe(`SELECT SQL query. Will be run against ${DATABASE}.`),
    limit: z
      .number()
      .optional()
      .default(100)
      .describe("Max rows to return (default 100, max 1000)"),
  },
  async ({ sql, limit = 100 }) => {
    if (/^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)/i.test(sql)) {
      return {
        content: [{ type: "text", text: "Error: only SELECT queries are allowed." }],
        isError: true,
      };
    }

    const cap = Math.min(limit, 1000);
    const safeSql = /\bLIMIT\b/i.test(sql) ? sql : `${sql.trimEnd()} LIMIT ${cap}`;

    const result = await runQuery(safeSql);
    if (result.rowCount === 0) {
      return { content: [{ type: "text", text: "Query returned 0 rows." }] };
    }

    const table = renderTable(result.columns, result.rows);
    return {
      content: [
        {
          type: "text",
          text: `Returned ${result.rowCount} row${result.rowCount !== 1 ? "s" : ""}.\n\n${table}`,
        },
      ],
    };
  },
);

server.tool(
  "sample_table",
  `Return a sample of rows from a table in ${DATABASE}`,
  {
    table: z.string().describe(`Table name in ${DATABASE}`),
    limit: z.number().optional().default(10).describe("Number of rows (default 10)"),
  },
  async ({ table, limit = 10 }) => {
    const safe = table.replace(/[^a-zA-Z0-9_]/g, "");
    const cap = Math.min(limit, 500);
    const result = await runQuery(`SELECT * FROM ${safe} LIMIT ${cap}`);
    if (result.rowCount === 0) {
      return { content: [{ type: "text", text: `${safe} is empty.` }] };
    }
    const table_ = renderTable(result.columns, result.rows);
    return {
      content: [
        {
          type: "text",
          text: `${DATABASE}.${safe} — ${result.rowCount} row sample\n\n${table_}`,
        },
      ],
    };
  },
);

server.tool(
  "table_stats",
  `Get row count for a table in ${DATABASE}`,
  { table: z.string().describe(`Table name in ${DATABASE}`) },
  async ({ table }) => {
    const safe = table.replace(/[^a-zA-Z0-9_]/g, "");
    const result = await runQuery(`SELECT COUNT(*) AS row_count FROM ${safe}`);
    const count = result.rows[0]?.row_count ?? "unknown";
    return {
      content: [
        { type: "text", text: `${DATABASE}.${safe}: ${Number(count).toLocaleString()} rows` },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
