# mcp-server-local

A local [MCP](https://modelcontextprotocol.io) server that exposes five
read-only tools for querying an AWS Athena database, for use with Claude
Desktop (or any other MCP-compatible client) running on your own machine.

## Tools

- `list_tables` — list all tables in the configured database
- `describe_table` — show columns and types for a table
- `query` — run an arbitrary `SELECT` query (a `LIMIT` is enforced; writes are blocked)
- `sample_table` — return a sample of rows from a table
- `table_stats` — get a row count for a table

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your Athena workgroup, output
   location, and database name:

   ```
   cp .env.example .env
   ```

3. Make sure AWS credentials are available to the process through the
   standard AWS SDK credential chain — e.g. run `aws configure`, set
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in your shell, or use an
   IAM role/profile. Credentials are deliberately **not** read from `.env`
   so they don't end up in a file that could be committed or shared.

4. Add it to Claude Desktop: Settings → Developer → Edit Config, and add
   an entry like this (adjust the path to where you cloned this repo):

   ```json
   {
     "mcpServers": {
       "mcp-server-local": {
         "command": "node",
         "args": ["/absolute/path/to/mcp-server-local/index.js"]
       }
     }
   }
   ```

5. Restart Claude Desktop. The five tools above should now be available.

## Notes

- Only `SELECT` queries are allowed — `INSERT`/`UPDATE`/`DELETE`/`DROP`/
  `CREATE`/`ALTER`/`TRUNCATE` are rejected.
- `query` and `sample_table` cap results at 1000 and 500 rows respectively.
