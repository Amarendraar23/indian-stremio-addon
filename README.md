# Indian Cinema for Stremio

A Stremio catalogue and metadata add-on for Indian movies and series, powered by TMDB. Uses Node.js 22+ and the Stremio HTTP protocol directly, with no third-party runtime dependencies.

## Start

1. Copy `.env.example` to `.env`.
2. Set `CONFIG_SECRET` to a permanent random secret (`openssl rand -hex 32`). Users can then supply their own TMDB API key or API Read Access Token on the setup page. Optionally set `TMDB_READ_ACCESS_TOKEN` for shared access without a personal key. Keep both settings private.
3. From this directory run `npm start` (or `node --env-file-if-exists=.env src/server.js`).
4. Open <http://127.0.0.1:7000/configure>. Leave **All Indian languages** selected, enter a TMDB credential, click **Generate install link**, then install in Stremio. Personal keys are checked with TMDB before a link is issued.

The server must remain running. The default address is accessible only on this computer. TV/mobile access needs a reachable HTTPS deployment. The Railway setup page is <https://indian-stremio-addon-production.up.railway.app/configure>. Each personal configuration uses its own TMDB credential and cache. Shared access, if enabled, uses the operator's TMDB quota.

## Included

- Indian productions (`with_origin_country=IN`) with original language Assamese, Bengali, Gujarati, Hindi, Kannada, Kashmiri, Malayalam, Marathi, Nepali, Odia, Punjabi, Sanskrit, Sindhi, Tamil, Telugu, or Urdu. The default combines these 16 languages. English and other foreign-language originals are excluded from discovery, search, and metadata.
- Optional original-language selection restricted to those 16 codes from TMDB's language list. Other Indian languages without their own supported TMDB code cannot be selected separately. Some options may have no Indian titles. Language selection does not indicate dubbed audio availability.
- Popular, recently released, and highly rated shelves for both movies and series. Highly rated requires at least 50 TMDB votes. Recently released series are ordered by their first air date, not their latest episode.
- Twenty-item upstream pages, bounded to TMDB's 500-page discovery limit.
- Search scans the first 100 upstream matches per media type, verifies Indian origin from title details, and filters the selected language. Search is deliberately bounded and can miss lower-ranked matches.
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
- Personal client caches are bounded to 50 credentials and 100 responses per client. All personal clients share a four-request upstream concurrency limit and a bounded queue. Setup is limited to 30 attempts per minute per process and four concurrent attempts. These are availability safeguards, not a distributed abuse-control service; public traffic and hosting spend need monitoring.
- To configure an installed personal link again, enter the credential again; the page never reveals a stored credential. There is no account or database.

## Community listing

Submit only the unconfigured public manifest:

`https://indian-stremio-addon-production.up.railway.app/manifest.json`

Name: **Indian Cinema**. Description: **Discover Indian movies and series in 16 supported Indian languages. Popular, recent, highly rated and search catalogues, with TMDB metadata and personal TMDB API key support. Catalogue and metadata only; no streams.**

Repository: <https://github.com/Amarendraar23/indian-stremio-addon>. License: MIT.

The in-app Community catalogue uses <https://addons.stremio.com/publish>. The separate curated directory is <https://stremio-addons.net>. Follow its [submission rules](https://docs.stremio-addons.net/addons/submission-rules); never submit a configured or personal-key URL. A submission is not an approval or a confirmed listing. Complete live configuration and catalogue checks before submitting.
