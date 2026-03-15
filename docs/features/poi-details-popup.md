# POI Details Popup

## Problem
The legacy POI popup only exposed the map icon, place title, and a short fallback description. Users could not see factual place metadata such as address, hours, phone, website, or any open-source photo context, and there was no clear path to richer third-party details like ratings and reviews.

## Solution
The popup now uses a progressive enrichment flow:

1. It opens immediately with the existing icon/title/category payload from the rendered POI feature.
2. It fetches additional free factual metadata from OSM-compatible sources on demand:
   - Nominatim for address details and factual tags,
   - Wikipedia/Wikidata/Wikimedia Commons for descriptive context and photos when available.
3. It now resolves photos through a ranked fallback chain instead of trusting a single raw image URL:
   - direct OSM `image` URL when it is already a renderable image,
   - Wikimedia Commons file thumbnails,
   - nearby geotagged Wikimedia Commons file pages near the POI,
   - Wikipedia summary thumbnails,
   - Wikipedia page images,
   - Wikidata-linked Commons images,
   - nearby Wikipedia GeoSearch matches when the place has no direct photo metadata but a clearly relevant article exists close to the POI.
4. It exposes two honest Google fallbacks instead of one ambiguous link:
   - `Search in Google Maps` for a best-effort place search,
   - `Open Exact Location` for a coordinate-only Google search that opens the precise pinned point more reliably than a bare map viewport.
5. It keeps the popup usable as content changes:
   - the map auto-pans just enough to keep the popup frame inside the visible map viewport,
   - the loading state uses lightweight theme-aware motion instead of static placeholder text,
   - popup photo framing adapts to both the POI category and the actual image resolution so low-res images are not stretched into oversized hero banners.

This keeps the UI fast while still surfacing richer place context when open-data coverage exists.

## Usage
1. Open the map and click any visible POI.
2. The popup appears immediately.
3. Within a moment, the popup may add:
   - address,
   - phone,
   - website,
   - opening hours,
   - cuisine / brand / operator hints,
   - a Wikimedia/Wikipedia/open-image photo when available,
   - source links to Google Maps search, exact Google location, Wikipedia, or OpenStreetMap.
4. If the first photo source fails, the popup automatically falls back to the next available candidate or hides the photo block cleanly.
5. If open-data coverage is missing, the popup still provides Google search plus exact-location fallbacks for richer place details.
6. If a direct OSM image exists but fails to load, the popup can still advance to a nearby Commons/Wikipedia fallback candidate instead of collapsing immediately to no photo.
7. If the popup opens near the map edge, the map nudges itself so the full popup, including the close button, stays visible.

## Screenshots
Before:
- Compact popup with icon, title, category, and minimal description only.

After:
- Popup with progressive factual enrichment, resilient free-photo fallback, nearby Wikipedia plus Commons image discovery, and separate Google search/exact-location actions.

Screenshot note:
- The UI is intentionally data-dependent. Capture fresh before/after screenshots during manual QA against a deterministic mocked-details scenario if the visuals need to be included in release-facing documentation.
