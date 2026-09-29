# Indian Cinema for Stremio

A Stremio catalogue and metadata add-on for Indian movies and series, powered by TMDB. Uses Node.js 22+ and the Stremio HTTP protocol directly, with no third-party runtime dependencies.

## Start

1. Copy `.env.example` to `.env`.
2. Set `CONFIG_SECRET` to a permanent random secret (`openssl rand -hex 32`). Users can then supply their own TMDB API key or API Read Access Token on the setup page. Optionally set `TMDB_READ_ACCESS_TOKEN` for shared access without a personal key. Keep both settings private.
3. From this directory run `npm start` (or `node --env-file-if-exists=.env src/server.js`).
4. Open <http://127.0.0.1:7000/configure>. Keep all languages checked or select any combination. Enter a TMDB credential, optionally find actors/directors by name and add up to four movie collections, click **Generate install link**, then install in Stremio. Personal keys are checked with TMDB before a link is issued.

The server must remain running. The default address is accessible only on this computer. TV/mobile access needs a reachable HTTPS deployment. The Railway setup page is <https://indian-stremio-addon-production.up.railway.app/configure>. Each personal configuration uses its own TMDB credential and cache. Shared access, if enabled, uses the operator's TMDB quota.

## Optional Ko-fi support

Create your account at <https://ko-fi.com> and complete its payout setup. Set `KO_FI_URL=https://ko-fi.com/tech919` in your local `.env` or Railway service variables, then restart or redeploy the service. Docker Compose also passes this variable through.

The configuration page shows an optional support card below the installation section. Its button opens your Ko-fi profile in a new tab without sending the page URL, which may contain a private install configuration. Payments happen on Ko-fi; no payment credentials or third-party widget scripts are added to this app. Leave `KO_FI_URL` blank to hide the card. Only HTTPS Ko-fi profile URLs are accepted.

## Included

- Indian productions (`with_origin_country=IN`) with original language Assamese, Bengali, Gujarati, Hindi, Kannada, Kashmiri, Malayalam, Marathi, Nepali, Odia, Punjabi, Sanskrit, Sindhi, Tamil, Telugu, or Urdu. The default combines these 16 languages. English and other foreign-language originals are excluded from discovery, search, and metadata.
- Multiple original-language selection in a single installation, restricted to those 16 codes from TMDB's language list. Other Indian languages without their own supported TMDB code cannot be selected separately. Some options may have no Indian titles. Language selection does not indicate dubbed audio availability.
- Popular, recently released, and highly rated shelves for both movies and series. Highly rated requires at least 50 TMDB votes. Hidden gems use the transparent rules below. Recently released series are ordered by their first air date, not their latest episode.
- Twenty-item upstream pages, bounded to TMDB's 500-page discovery limit.
- Search scans the first 100 upstream matches per media type, verifies Indian origin from title details, and filters the selected languages. Search is deliberately bounded and can miss lower-ranked matches.
- TMDB posters, descriptions, cast, directors, and episode metadata. IMDb IDs are used where available for stream-add-on matching; otherwise a namespaced TMDB ID is used. Compatibility for fallback IDs depends on other add-ons.
- Full season fetching, including specials. Episodes without known air dates are omitted because Stremio requires a release date. Long-running shows can take longer on a cold cache.
- A bounded 15-minute in-memory cache, request deduplication, four concurrent upstream requests, timeouts, and safe error responses. Rate-limited requests are not automatically retried.

This add-on does not supply streams. Completeness depends on TMDB's country, language, date, and episode records. TMDB ratings are used for sorting and are not mislabeled as IMDb ratings.

## Check

Run `npm test` or `node --test`. Tests use controlled TMDB fixtures and a local HTTP server. Live acceptance still requires a valid TMDB token: install in Stremio, open both media types, search a known Indian title, open series episodes, and check another installed add-on can match an IMDb-backed title.

## Sources and credits

- [Stremio protocol](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md)
- [TMDB movie discovery](https://developer.themoviedb.org/reference/discover-movie)
- [TMDB series discovery](https://developer.themoviedb.org/reference/discover-tv)
- [TMDB language configuration](https://developer.themoviedb.org/reference/configuration-languages)
- [TMDB attribution and usage](https://developer.themoviedb.org/docs/faq)

This product uses the TMDB API but is not endorsed or certified by TMDB.

## ElfHosted preparation

See [ELFHOSTED.md](ELFHOSTED.md) for the earlier container preparation and hosting-request draft; an ElfHosted ticket has since been sent. `Dockerfile` and `compose.yaml` are included; `.dockerignore` restricts build input to source, tests, and package metadata. Railway has built and started the container; personal-key release acceptance must include live configuration and catalogue checks.

## Community hosting and privacy

- Set Railway `CONFIG_SECRET` to a cryptographically random value of at least 32 characters, generated once. Keep the same value across deployments and replicas. Changing it invalidates every personal install link. Back it up privately; never commit it.
- `TMDB_READ_ACCESS_TOKEN` is optional. Without it, the public manifest advertises `configurationRequired: true`, and each user must supply their own credential. With it, users may leave their key blank for shared access.
- API v3 keys use TMDB's `api_key` query parameter; API Read Access Tokens use its Bearer header. Credentials are only forwarded to TMDB. User input is submitted to this host in an HTTPS POST body, never as a plaintext install URL.
- Install paths carry AES-256-GCM encrypted credentials. These are still bearer capabilities: anyone possessing an install URL can use that TMDB credential through the add-on. Do not share personal URLs. Stremio may sync them and hosting infrastructure may retain request paths. Revoke compromised credentials at TMDB. There is no individual-link revocation database.
- The app does not log request paths, credentials, or upstream response bodies. Configuration responses use `no-store` and `no-referrer`. Disable request-body logging in any proxy. The host can decrypt credentials; encryption does not hide them from the operator.
- Personal client caches are bounded to 50 credentials and 100 responses per client. All personal clients share a four-request upstream concurrency limit and a bounded queue. Setup and person search together are limited to 30 attempts per minute per process and four concurrent attempts. These are availability safeguards, not a distributed abuse-control service; public traffic and hosting spend need monitoring.
- To configure an installed personal link again, enter the credential again; the page never reveals a stored credential. There is no account or database.

## Community listing

Submit only the unconfigured public manifest:

`https://indian-stremio-addon-production.up.railway.app/manifest.json`

Name: **Indian Cinema**. Description: **Discover Indian movies and series in 16 supported Indian languages. Popular, recent, highly rated and search catalogues, with TMDB metadata and personal TMDB API key support. Catalogue and metadata only; no streams.**

Repository: <https://github.com/Amarendraar23/indian-stremio-addon>. License: MIT.

The in-app Community catalogue uses <https://stremio.github.io/stremio-publish-addon/index.html>. The separate curated directory is <https://stremio-addons.net>. Follow its [submission rules](https://docs.stremio-addons.net/addons/submission-rules); never submit a configured or personal-key URL. A submission is not an approval or a confirmed listing. Complete live configuration and catalogue checks before submitting.

Release validation (2026-09-29): Railway version 0.2.0 is live with personal keys enabled and no shared credential. A real personal-token test returned 20 titles on each of six shelves, three RRR search matches, and series episode metadata. Stremio community publishing returned HTTP 429 (code 9908); listing is not confirmed. No personal link was submitted.

## Filter by language in Stremio

In Discover, select an India catalogue (except By decade), open Filters, then use **Genre** to choose an Indian original language. Stremio supplies the Genre label; this add-on uses its options for languages. All includes the languages permitted by your installation. Movie and series list cards and search results append the original language to the title, for example `RRR · Telugu`. IDs and detailed metadata titles stay unchanged. Existing installations need their manifest refreshed to see new filter options.


## Discovery features (0.4.0)

- **Multiple languages:** check one or more original languages on `/configure`. All shelves and search use that selection; language filters can narrow it further. Metadata retains the existing full supported-language scope to resolve IDs from other add-ons. Empty selections are rejected. Audio/dubs are not selected.
- **Hidden gems:** movies and series released by today (UTC), with TMDB rating **at least 7/10** and **20–500 votes inclusive**, ordered by descending rating. This is an automatic rule, not human curation or proof that a title is obscure. Lower vote counts approximate visibility and can bias results toward recent titles or smaller audiences; TMDB data changes over time.
- **Decades:** in Discover choose **India · By decade**, then select a decade using **Genre**. Movie primary release dates and series first-air dates determine the decade. Options run from the 1910s through the current decade; future release dates are excluded. This catalogue requires a decade and does not populate a default home shelf. It uses the installation's selected languages. Other catalogues retain Genre as a language selector; there is no simultaneous second language control on the decade catalogue.
- **Actors/directors:** enter your credential, search for a person by name, select Starring or Directed by, and click the matching result. Known titles and TMDB ID help distinguish namesakes. Up to four collections become named movie shelves after generating a new link. Advanced users can edit the role:ID list directly; delete a pair to remove it. Names are resolved from TMDB during setup. Person search is global, but every collection still requires Indian origin and an allowed selected language. A collection may be empty. Actors require a cast credit; directors require the exact `Director` job, not merely any crew credit.

Stremio's documented catalogue selectors support this approach, but labels, home placement and manifest refresh differ by client. Person collections are movie-only because TMDB TV discovery has no person filter. Director pages can be short or empty because TMDB's broad crew filter is narrowed after fetching details. All new shelves request one upstream discovery page (up to 20 titles) and detail-check those rows, with no automatic backfill. Search remains capped at five pages; person search reads one page and offers at most ten non-adult results. Setup adds at most four person-detail calls. Existing cache sizes, timeouts, queues and upstream concurrency limits remain in force.

New preferences use `/d/<encoded-preferences>/manifest.json`, optionally after the existing `/c/<encrypted-credential>` prefix. Preferences are readable, validated data; they do not contain credentials. The AES-GCM credential format and `CONFIG_SECRET` are unchanged. Existing `/manifest.json`, `/all/...`, `/hi/...` and encrypted personal paths remain supported. Reopen a configured link's `/configure` page to restore languages and collections; re-enter your credential before generating a replacement personal link. Refresh/reinstall in Stremio to see the new manifest; remove the superseded installation if your client retains both.

Official references checked for this implementation: [Stremio manifest selectors](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md), [TMDB movie discovery](https://developer.themoviedb.org/reference/discover-movie), [TV discovery](https://developer.themoviedb.org/reference/discover-tv), [person search](https://developer.themoviedb.org/reference/search-person), and [person details](https://developer.themoviedb.org/reference/person-details). The existing pipe-separated original-language query is retained; the current TMDB reference does not explicitly document OR syntax for that particular field. A read-only live check on 2026-09-29 returned 20 movie results containing both Hindi and Tamil and no other original languages for `hi|ta`. Detail filtering also enforces the selected set; this one page does not establish completeness across all language combinations.

Before release, use a private test installation to verify a two-language selection, both hidden-gem shelves, an older/current decade, and actor/director collections in the target Stremio clients. Confirm live TMDB results, page advancement and new manifest visibility. Automated tests use fixtures and do not prove live result completeness. The earlier Railway validation above describes version 0.2.0; see the 0.4.0 production acceptance below.

Local verification: 23 Node behavior/HTTP tests passed, plus a headless Chrome fixture check of desktop/mobile setup, person search, generated manifest, restored preferences, empty-selection errors and browser script errors. These implementation checks preceded the production acceptance below.


### Production acceptance — 2026-09-29

Version 0.4.0 was deployed to the existing Railway production service through [PR #1](https://github.com/Amarendraar23/indian-stremio-addon/pull/1), merge commit `a4a4c32ff15c0d17784293cd42c2ec07720a6643`, deployment `66c82197-c816-4391-b262-02bbd1cbcf3d`. All six uploaded files matched the tested local files before merge, and 23 behavior/HTTP tests passed.

Live production checks with a private Hindi/Tamil configuration returned 20 hidden-gem movies, 20 hidden-gem series, 20 movies from the 1990s, 20 series from the 2020s, 20 Shah Rukh Khan movies, and 15 Mani Ratnam movies. A second popular page returned 20 titles. Every returned catalogue item passed the selected-language check; decade results passed year checks. Counts are a point-in-time observation, not a completeness promise.

Stremio Web visibly rendered both hidden-gem shelves, the 1990s movie and 2020s series catalogues, actor and director collections, and the two-language selector. Selecting Tamil narrowed the rendered movie cards to Tamil. The existing encrypted all-language link loaded version 0.4.0; its installation was refreshed, and the temporary Hindi/Tamil installation was removed. One all-language Indian Cinema installation remains. Person collections remain optional configuration choices. No private install links or credentials are included here.

Native desktop, mobile and TV clients and playback were not tested in this release acceptance. This add-on continues to provide catalogues and metadata only.
