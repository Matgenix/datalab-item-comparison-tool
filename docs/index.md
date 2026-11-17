# Item comparison

Compare item metadata and data blocks across datalab items.

This package provides a trusted datalab
in-app tool
through the `pydatalab.tools` entry-point group.

It compares current-user-visible item metadata and data blocks. Users can open
it from the Tools menu or apply **Compare selected** to Samples, Inventory, or
items within a collection.

## Resource limits

The comparison API returns HTTP 413 when a request exceeds one of these fixed
budgets:

- 20 selected blocks and 40 overlay series;
- 100 attached files, 25 MiB per file, and 100 MiB total attached-file input;
- 2,000,000 DataFrame cells and 64 MiB estimated deep DataFrame memory;
- 2 MiB for one generated preview and 10 MiB for the serialized response.

All files attached to selected items are conservatively preflighted before
block parsing or preview generation. An item with an attachment over these
limits therefore cannot be compared, even if its selected block does not
normally read that attachment. Authors of comparison-enabled blocks must keep
the DataFrames returned by `get_comparison_data()` within the cell and memory
budgets.

Operators may add reverse-proxy rate limiting as defense in depth. It is not a
replacement for the plugin's per-request resource limits.

See the
[installation guide](https://github.com/Matgenix/datalab-item-comparison-tool/blob/main/INSTALL.md)
and the
[datalab tool-plugin documentation](https://docs.datalab-org.io/plugins/#writing-a-tool-plugin).

## Trust

Tool plugins execute trusted Python code in the datalab API process.

This plugin also loads trusted JavaScript in the signed-in datalab application.

Deployment administrators must review source code, dependencies, compiled
assets, maintainers, and release provenance before installation or upgrade.
