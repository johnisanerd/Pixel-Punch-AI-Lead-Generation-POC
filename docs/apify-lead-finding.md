# Apify lead finding

Lead finding discovers **company name + website/domain** candidates before enrichment or Hermes scoring. Apify is the primary acquisition engine; Product Hunt, Jina, Google CSE, and CSV remain available as legacy adapters.

## Environment

```text
APIFY_TOKEN=apify_api_...
LEADFINDING_MODE=apify_first
LEADFINDING_MAX_CANDIDATES=500
LEADFINDING_MAX_APIFY_JOBS=10
```

`APIFY_TOKEN` is required whenever a project’s `source_config.leadFinding` lists Apify sources (or a pack). Missing token returns a clear `400` from **Find leads**.

## Project `source_config.leadFinding`

```json
{
  "leadFinding": {
    "mode": "apify_first",
    "maxCandidates": 500,
    "maxApifyJobs": 10,
    "maxRuntimeSecondsPerJob": 600,
    "concurrency": 2,
    "sources": [
      {
        "id": "google-maps-restaurants-nyc",
        "type": "apify",
        "enabled": true,
        "actorId": "compass/crawler-google-places",
        "input": {
          "searchStringsArray": ["restaurants in New York"],
          "maxCrawledPlacesPerSearch": 100
        },
        "mapping": {
          "companyField": "title",
          "websiteField": "website",
          "sourceUrlField": "url"
        }
      }
    ]
  }
}
```

### Required mapping fields

| Field | Required | Purpose |
|-------|----------|---------|
| `companyField` | yes | Actor dataset path for company name (dot paths allowed, e.g. `place.name`) |
| `websiteField` | yes | Path for company website |
| `sourceUrlField` | no | Path for listing/profile URL |
| `locationField` | no | Reserved for future enrichment |
| `categoryField` | no | Reserved for future enrichment |

Use `taskId` instead of `actorId` when running a saved Apify task:

```json
{
  "id": "my-task",
  "type": "apify",
  "taskId": "username/task-name",
  "mapping": {
    "companyField": "name",
    "websiteField": "website",
    "sourceUrlField": "url"
  }
}
```

Set `allowCompanyOnly: true` only when the actor legitimately returns companies without websites.

## Source packs

If `sources` is empty but `pack` is set (or inferred later from ICP), starter templates are used. Pack IDs:

- `local_business`
- `saas_startup`
- `ecommerce`
- `b2b_general`
- `hiring_intent`

Pack actor IDs are **examples**. Replace them with verified [Apify Store](https://apify.com/store) actors or your own tasks before production spend.

Query templates support `{{niche}}`, `{{category}}`, `{{city}}`, and `{{role}}`.

## Find leads behavior

Dashboard **Find leads** (`POST /api/projects/:id/ingest`):

1. If `leadFinding.sources` or `leadFinding.pack` is set → run Apify-first discovery.
2. Otherwise → legacy Product Hunt / Jina / Google adapters.

Discovery response includes:

- `runId`, `sourcesRun`, `fetched`, `kept`, `rejected`, `duplicates`, `skippedExisting`, `costEstimate`, `errors[]`

One failed Apify job does not fail the whole run; its error is recorded in `errors` and `discovery_source_jobs`.

## Guardrails

- Default max candidates: `500`
- Default max Apify jobs: `10`
- Default concurrency: `2`
- Default actor timeout: `10 minutes`
- Raw payloads are stored capped (~8KB) on `discovered_candidates`
- Noise filter drops social hosts, directories, job boards, and empty companies
- Dedupes by canonical domain (fallback: normalized company name)

## Adding a new Apify actor

1. Confirm the actor/task in Apify Console and note sample dataset fields.
2. Add a `leadFinding.sources[]` entry with `actorId` or `taskId`, `input`, and `mapping`.
3. Click **Find leads** and inspect `discovery_runs` / `discovered_candidates` if mapping looks wrong.
4. Tighten `input` limits (`maxItems`, places per search) before raising budgets.

## Official Apify references

- https://docs.apify.com/platform/actors
- https://docs.apify.com/platform/storage/dataset
- https://apify.com/store
