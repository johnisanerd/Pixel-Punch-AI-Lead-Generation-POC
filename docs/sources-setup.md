# LeadRadar — Source APIs (Phase 6)

Configure Product Hunt, Google Custom Search, and optional website enrichment per project.

## Environment variables

| Variable | Required for | Description |
|---|---|---|
| `PRODUCTHUNT_TOKEN` | Product Hunt source | Developer token or OAuth access token. Sent as `Authorization: Bearer …` to `https://api.producthunt.com/v2/api/graphql`. |
| `GOOGLE_CSE_KEY` | Google Custom Search | Google Cloud API key with Custom Search API enabled. |
| `GOOGLE_CSE_ID` | Google Custom Search | Programmable Search Engine ID (`cx`). |

Adapters throw a clear error if an enabled source is missing credentials. Unit/integration tests always inject a mock `fetch` and never hit the network.

## Product Hunt setup

1. Create an app at [Product Hunt API](https://api.producthunt.com/v2/docs) and copy a **developer token** (or obtain an OAuth access token).
2. Set `PRODUCTHUNT_TOKEN=…`.
3. Enable in the project's `source_config` (see below).

## Google Custom Search setup

1. In Google Cloud Console, enable **Custom Search API** and create an API key → `GOOGLE_CSE_KEY`.
2. Create a [Programmable Search Engine](https://programmablesearchengine.google.com/) (search the whole web or selected sites) → copy the Search Engine ID → `GOOGLE_CSE_ID`.
3. Enable in `source_config` with a `query` string.

Request shape used by the adapter:

`GET https://www.googleapis.com/customsearch/v1?key=…&cx=…&q=…`

## Project `source_config` JSON

Stored on `projects.source_config` (string column). Example:

```json
{
  "producthunt": { "enabled": true, "first": 20 },
  "google": { "enabled": true, "query": "B2B SaaS AI startups", "num": 10 },
  "enrich": true
}
```

| Field | Meaning |
|---|---|
| `producthunt.enabled` | Include Product Hunt posts (default true when the `producthunt` object is present). |
| `producthunt.first` | How many posts to request (default 20). |
| `google.enabled` | Include Google CSE results (default true when the `google` object is present). |
| `google.query` | **Required** search query when Google is enabled. |
| `google.num` | Results per request (1–10; default 10). |
| `enrich` | When `true`, after merge fetch each lead website and fill `mailto:` emails before validation. |

## Run ingest

```bash
npm run ingest -- <projectId>
```

This loads the project, builds sources from `source_config` + env, optionally enriches websites, then runs aggregate validate → persist gated leads (same pipeline as CSV import).

CSV upload remains available via `npm run import-csv` and the dashboard; it does not require `source_config`.
