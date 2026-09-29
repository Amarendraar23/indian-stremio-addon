# Indian Cinema for Stremio

A local-first Stremio catalogue and metadata add-on for Indian movies and series, powered by TMDB. Uses Node.js 22+ and the Stremio HTTP protocol directly, with no third-party runtime dependencies.

## Start

1. Copy `.env.example` to `.env`.
2. Set `TMDB_READ_ACCESS_TOKEN` to your **API Read Access Token** from [TMDB API settings](https://www.themoviedb.org/settings/api). Keep the token in this local file; do not paste it into chat or a manifest URL.
3. From this directory run `npm start` (or `node --env-file-if-exists=.env src/server.js`).
4. Open <http://127.0.0.1:7000/configure>. Leave **All Indian languages** selected and install in Stremio, or copy <http://127.0.0.1:7000/all/manifest.json> into Stremio's add-on installation field.

The server must remain running. The default address is accessible only on this computer. TV/mobile access needs a reachable HTTPS deployment; this project has not been deployed. A public instance serves everyone using the server's TMDB quota and should have proxy-level rate limits before public release.

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

See [ELFHOSTED.md](ELFHOSTED.md) for the container settings, validation status, and unsent hosting-request draft. `Dockerfile` and `compose.yaml` are included; `.dockerignore` restricts build input to source, tests, and package metadata. No hosted deployment has been created.
