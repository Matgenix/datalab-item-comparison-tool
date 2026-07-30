# Item comparison

Compare item metadata and data blocks across datalab items.

This package provides a trusted datalab
in-app tool
through the `pydatalab.tools` entry-point group.

It compares current-user-visible item metadata and data blocks. Users can open
it from the Tools menu or apply **Compare selected** to Samples, Inventory, or
items within a collection.

See the
[installation guide](https://github.com/Matgenix/datalab-item-comparison-tool/blob/main/INSTALL.md)
and the
[datalab tool-plugin documentation](https://docs.datalab-org.io/plugins/#writing-a-tool-plugin).

## Trust

Tool plugins execute trusted Python code in the datalab API process.

This plugin also loads trusted JavaScript in the signed-in datalab application.

Deployment administrators must review source code, dependencies, compiled
assets, maintainers, and release provenance before installation or upgrade.
