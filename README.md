<div align="center"><i>datalab-item-comparison-tool</i></div>

<div align="center">
<a href="https://github.com/Matgenix/datalab-item-comparison-tool/actions/workflows/ci.yml"><img src="https://github.com/Matgenix/datalab-item-comparison-tool/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="https://github.com/Matgenix/datalab-item-comparison-tool/releases"><img src="https://badgen.net/github/release/Matgenix/datalab-item-comparison-tool?icon=github&color=blue" alt="Release"></a>
<a href="https://github.com/Matgenix/datalab-item-comparison-tool"><img src="https://badgen.net/github/license/Matgenix/datalab-item-comparison-tool?icon=license&color=purple" alt="License"></a>
<a href="https://Matgenix.github.io/datalab-item-comparison-tool/"><img src="https://github.com/Matgenix/datalab-item-comparison-tool/actions/workflows/docs.yml/badge.svg" alt="Documentation"></a>
</div>

datalab-item-comparison-tool is a trusted
[datalab](https://datalab-org.io) in-app tool plugin generated with the
[datalab tool plugin template](https://github.com/Matgenix/datalab-tool-plugin-template).

It compares item metadata and data blocks while retaining datalab's normal
navigation and current-user permissions.

## Features

- Add and remove up to twenty items from a URL-backed comparison.
- Compare five metadata columns per page and show differences or all fields.
- Compare the union of data-block types, including partial coverage.
- Render Bokeh plots, supported images, comments, and errors side by side.
- Overlay compatible XRD and Raman series.
- Open **Compare selected** from Samples, Inventory, or items in a collection.
  The action is intentionally absent from Equipment.

The standard selection URL contains only ordered immutable refcodes:

```text
/tools/item-comparison?action=compare-selected&items=test%3AABC&items=test%3ADEF
```

The plugin reloads those items through datalab's permission-aware API.

## Architecture and permissions

The Python package is discovered through the `pydatalab.tools` entry-point
group. Its frontend bundle is mounted by the generic in-app tool host and uses
frontend SDK version 1 for host components, API requests, navigation, dialogs,
and selected-refcode query parameters.

The provider owns three automatically browser-authenticated routes:

- `GET /tools/plugins/item-comparison/capabilities`
- `POST /tools/plugins/item-comparison/previews`
- `POST /tools/plugins/item-comparison/overlay`

Route authentication does not replace object-level authorization. The server
reloads every requested item and block under the current user's normal read
filter. Preview generation works on copied block configuration and does not
persist regenerated state.

XRD and Raman adapters live in this plugin. Other block types remain available
side by side. A block plugin may opt into overlays by implementing the
`get_comparison_data()` contract.

This is trusted in-process Python and JavaScript, not a sandbox. Deployment
administrators must review the source, dependencies, frontend lockfile,
compiled bundle, maintainers, and release provenance before every installation
or upgrade.

## Resource limits

Comparison requests return HTTP 413 when they exceed any fixed server-side
budget:

- 20 selected blocks and 40 overlay series;
- 100 attached files, 25 MiB per file, and 100 MiB across the request;
- 2,000,000 DataFrame cells and 64 MiB of estimated deep DataFrame memory;
- 2 MiB per generated preview and 10 MiB for the serialized response.

The server conservatively preflights every file attached to a selected item,
even when a particular block may not read every attachment. Consequently, an
item with an oversized attachment cannot be previewed or overlaid through this
tool. Block authors implementing `get_comparison_data()` must return bounded
DataFrames within the cell and memory limits.

Reverse-proxy rate limiting is useful optional operational hardening, but does
not replace these per-request limits.

See [INSTALL.md](INSTALL.md) for native and Docker Compose development
installation and frontend build instructions.

Releases are created from semantic version tags on
[GitHub](https://github.com/Matgenix/datalab-item-comparison-tool/releases).
