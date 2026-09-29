# ElfHosted handoff

Status: deployment files prepared locally. Podman built an OCI image and all 12 tests passed inside the build. A follow-up Docker-format build failed with a Podman overlay-storage error; standalone container runtime and the Docker health check remain unverified. Public source: https://github.com/Amarendraar23/indian-stremio-addon. No public container image, hosting request, or ElfHosted deployment has been created.

## Runtime

- Node.js 24, no npm runtime dependencies; Dockerfile runs the test suite during the build.
- Non-root UID 1000. No persistent storage or database required; cache is in memory.
- Listen on `0.0.0.0:7000` inside the container. Terminate HTTPS at the hosting ingress.
- Set `TMDB_READ_ACCESS_TOKEN` through the host's secret manager at runtime. Never add `.env` to a repository, image, public message, or install URL.
- `/health` is process liveness only. Test a real catalogue to validate TMDB connectivity.
- Setup: `/configure`; all-Indian-language manifest: `/all/manifest.json`.
- HTTPS install links are derived from the setup page's browser origin. The service expects hosting at the domain root.
- Four concurrent TMDB requests per process, 15-minute bounded cache. Request rate limiting must be applied at the ingress before public exposure. Cold searches can fetch details for up to 100 titles; long series fetch every season.

## Local container check

With Docker and Compose installed, from this directory:

```sh
docker compose build
docker compose up -d
curl --fail http://127.0.0.1:7001/health
curl --fail http://127.0.0.1:7001/all/manifest.json
curl --fail http://127.0.0.1:7001/all/catalog/movie/popular.json
docker compose down
```

Compose reads the existing `.env` at runtime. Port 7001 avoids the existing development server on port 7000. The build context uses an allowlist and excludes credentials. The runtime image contains only application source and package metadata.

## Hosting request draft — not sent

Hi ElfHosted team,

Would you consider hosting Indian Cinema, a Stremio catalogue and metadata add-on for Indian movies and series? It covers 16 Indian original-language codes using TMDB, with popular, recent, and highly rated shelves, search, and episode metadata. It provides no streams.

Repository: https://github.com/Amarendraar23/indian-stremio-addon

It uses Node.js 24 with no third-party runtime dependencies. A non-root Dockerfile, health check, and deployment notes are included. It requires a server-side TMDB API Read Access Token, HTTPS ingress, and ingress rate limiting. No database or persistent volume is needed.

The application tests and local live TMDB checks have passed. The image built under Podman and its 12 tests passed. A local Podman storage error blocked the final Docker-format build and standalone runtime validation; those checks are still pending. Could you confirm whether this is suitable for community hosting and your image, naming, branding, licensing, and TMDB credential requirements?

Thanks!

## Remaining steps

1. Verify the container build and runtime on a Docker host.
2. Publish a verified container image if requested by ElfHosted.
3. Contact ElfHosted through the channel linked by their official documentation. Acceptance and a hosting URL are not yet confirmed.
4. After acceptance, configure the host secret privately and verify the HTTPS manifest, both media types, language filters, metadata, and Stremio installation.

Official hosting route: https://docs.elfhosted.com/stremio-addons/
