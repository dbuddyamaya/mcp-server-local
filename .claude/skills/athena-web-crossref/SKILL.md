---
name: athena-web-crossref
description: "Use whenever a question draws on the trusted_prod Athena data (claims, benchmarks, market scoring, locations) — automatically pair the internal numbers with relevant web context, no need to ask separately."
---

# Athena + Web cross-referencing

When a question touches data from the local `trusted_prod` Athena MCP server (tables like `claims_service_volumes`, `claims_specialty`, `benchmarks_zcta_demand_rates`, `market_scoring_core`, `locations_*`, etc.), don't just answer from the database in isolation. By default, also pull in relevant external web context and present both together — the user should not have to ask for the web half explicitly.

## When to cross-reference

Do this automatically when the question is analytical or interpretive — anything where "is this good/bad/normal/growing" or "how does this compare" is implied. Examples:

- Volume, revenue, or growth questions about a service line, specialty, or market ("how is X trending", "is this a big market", "top service lines by volume")
- Questions about a specific geography/ZCTA (pair local claims/demand data with regional demographics, competitor presence, or news)
- Benchmark or market-scoring questions (compare internal `market_scoring_core` / `benchmarks_*` figures against published industry data)
- Anything where the user's phrasing suggests they want context, not just a number ("is that a lot", "how do we compare", "what's driving this")

## When NOT to cross-reference

Skip the web search and just answer from Athena when the question is purely mechanical/internal and a web search wouldn't add anything:

- Schema or metadata questions ("what tables do we have", "describe this table", "how many columns")
- Simple row counts or raw data pulls with no interpretive angle ("how many rows in claims_specialty", "show me 10 sample rows")
- The user explicitly says "just the internal number" or similar

When genuinely unsure whether external context would help, lean toward including a short one, rather than asking permission first — it's cheap to include and easy for the user to ignore if not useful.

## Process

1. Run the appropriate Athena tool(s) first (`list_tables`, `describe_table`, `query`, `sample_table`, `table_stats`) to get the real internal numbers.
2. Decide what external comparison point would sharpen the answer: a national/regional trend, an industry benchmark, market-size data, recent news, or demographic context for a geography.
3. Run a web search for that specific context — don't do a generic search, target the exact comparison the internal number raises.
4. Combine both in one answer: show the internal figures (as a table when there's more than a couple of rows), then the external context, then a brief synthesis of what the comparison implies. Keep internal and external data visually distinguishable so the user can tell what's from their own database versus the open web.
5. Always include a "Sources:" section with markdown links for any web material used, per standard citation practice. Never apply that citation treatment to the Athena data itself — it's internal, not a linkable web source.
6. Note when internal and external data aren't perfectly comparable (different time periods, different geographic granularity, methodology differences) rather than presenting them as equivalent.

## Tone

Keep the added web context concise — a sentence or two of synthesis, 2-4 sources — rather than turning every answer into a full research report. The goal is a sharper, better-contextualized answer, not a longer one.
