# Operations

This page contains production details for deployment administrators. Follow the
[installation guide](https://github.com/Matgenix/datalab-item-comparison-tool/blob/main/INSTALL.md)
first.

## Trust and permissions

Item comparison is trusted in-process Python and JavaScript, not a sandbox.
Review the source, dependencies, frontend lockfile, compiled bundle,
maintainers, and release provenance before every installation or upgrade.

The provider's three routes are automatically browser-authenticated:

- `GET /tools/plugins/item-comparison/capabilities`
- `POST /tools/plugins/item-comparison/previews`
- `POST /tools/plugins/item-comparison/overlay`

Route authentication does not replace object-level authorization. The server
reloads every requested item and block through the current user's normal read
filter. Preview generation uses copied block configuration and does not persist
regenerated state.

## Request limits

Comparison requests return HTTP 413 when they exceed a fixed server-side
budget:

- 20 selected blocks and 40 overlay series;
- 100 attached files, 25 MiB per file, and 100 MiB across the request;
- 2,000,000 DataFrame cells and 64 MiB of estimated deep DataFrame memory;
- 2 MiB per generated preview and 10 MiB for the serialized response.

The server conservatively preflights every file attached to a selected item,
even when a particular block may not read every attachment. An item with an
oversized attachment therefore cannot be previewed or overlaid. These limits
are code-level safeguards and are not configurable deployment settings.

Reverse-proxy rate limiting can provide additional operational protection, but
does not replace the per-request budgets. Monitor HTTP 413 responses and
comparison-route latency; repeated failures usually require a smaller selection
or smaller source attachments rather than a larger proxy body limit.

The plugin owns no separate service or persistent data. Removing it stops the
tool and routes from loading but does not change the compared datalab items or
their blocks.
