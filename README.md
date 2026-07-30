# datalab item comparison tool

This is an independently installable, trusted *datalab tool* plugin for comparing
*item* metadata and *data blocks*. It was generated from the
[datalab tool plugin template](https://github.com/Matgenix/datalab-tool-plugin-template)
with the `in-app` UI kind and then customized from the implementation in
`jbouquiaux/cross_samples_comparison`.

The tool renders below datalab's normal navigation at:

```text
/tools/item-comparison?action=compare-selected&items=test%3AABC&items=test%3ADEF
```

The optional *table-selection tool action* **Compare selected** appears for
Samples, Inventory, and items within a collection. It does not appear for
Equipment. The URL carries only ordered immutable refcodes; the plugin reloads
each item through datalab's permission-aware API.

## What is preserved from the comparison branch

- Add and remove *items* from a URL-backed comparison.
- Compare up to twenty *items*, with five metadata columns per page.
- Show only differing metadata or all displayed fields.
- Show the union of *block types*, including partial-coverage indicators.
- Enable or disable individual blocks.
- Render Bokeh plots, supported images, comments, and errors side by side.
- Overlay XRD and Raman series with the original sample-color palette.
- Keep the original card, pill, table, sticky-header, and two-column visual
  design as closely as possible.

The original table action **Compare selected** is provided through the generic
tool-action contract rather than hard-coded comparison logic in the webapp.

## Architecture and permissions

The Python package is discovered through:

```toml
[project.entry-points."pydatalab.tools"]
"item-comparison" = "datalab_item_comparison_tool.provider:ItemComparisonToolProvider"
```

Its Vue bundle is loaded by datalab's generic *in-app tool* host. It uses only
frontend SDK version 1: the host Vue runtime, datalab's `ItemSelect`,
`FormattedItemName`, `ChemicalFormula`, and `BokehPlot` components,
current-session API helpers, navigation, and dialogs.
It reads and updates the standard repeated-refcode query parameters through
`datalabToolSdk.selection`.

The provider owns three routes, authenticated automatically by datalab's
browser-session policy:

- `GET /tools/plugins/item-comparison/capabilities`
- `POST /tools/plugins/item-comparison/previews`
- `POST /tools/plugins/item-comparison/overlay`

*Authentication* alone does not filter database queries. Preview and overlay
inputs contain *item*/block identifiers only; the server
reloads every block under the *current user*'s normal read-permission filter,
including for administrators using these POST-based read operations. The
preview route renders a copy of stored block configuration and does not persist
the regenerated block state to the *item*, so it requires no *item* write
permission.
A block renderer may still read or synchronize its normal file cache, just as
it does on an *item* page.

XRD and Raman overlay adapters live in this plugin. A future block plugin can
also opt in without changing this package by exposing the same
`get_comparison_data()` data contract used by the comparison branch. Other
*block types* remain available in side-by-side mode.

This is trusted, in-process code rather than a sandbox. A deployment
administrator must review the Python source, frontend source, dependency
lockfile, compiled `tool.js`, maintainers, and release provenance before every
installation or upgrade.

This plugin targets frontend tool SDK version 1 and the
`pydatalab.tools` interfaces in the matching datalab checkout. Keep the plugin
and server versions aligned when deploying it independently.

## Build the frontend

The API image does not run Node or Vite for plugins. Build and retain the
reviewable browser artifact before installing. This package requires Node
22.12.x (or another release matching `>=22.12 <23`). From this repository, run:

```shell
cd frontend
yarn install --frozen-lockfile
yarn build
cd ..
```

This creates:

```text
frontend/yarn.lock
src/datalab_item_comparison_tool/static/frontend/tool.js
```

The source distribution includes the frontend source and lockfile. The wheel
contains the compiled browser bundle.

## Native development installation

Add this dependency and source to the ignored root `plugins.toml`, preserving
any plugins already declared there:

```toml
dependencies = ["datalab-item-comparison-tool"]

[tool.uv.sources]
datalab-item-comparison-tool = { path = "dev-repos/datalab-item-comparison-tool", editable = true }
```

If `dependencies` already contains other plugins, append
`"datalab-item-comparison-tool"` to that same array rather than adding a second
`dependencies` key.

Then install and restart the API:

```shell
cd pydatalab
uv run invoke dev.install
```

## Docker Compose development installation

The server image intentionally copies plugin deployment sources from the
ignored `pydatalab/plugins/` staging directory. Stage this example there so no
core datalab or Compose file needs to change. From the repository root, run:

```shell
mkdir -p pydatalab/plugins/item_comparison_tool
rsync -a \
  --exclude frontend/node_modules/ \
  --exclude .venv/ \
  --exclude build/ \
  --exclude dist/ \
  --exclude __pycache__/ \
  --exclude '*.egg-info/' \
  --exclude '*.py[cod]' \
  dev-repos/datalab-item-comparison-tool/ \
  pydatalab/plugins/item_comparison_tool/
```

Add the staged dependency and source to the ignored root `plugins.toml`,
preserving any plugins already declared there:

```toml
dependencies = ["datalab-item-comparison-tool"]

[tool.uv.sources]
datalab-item-comparison-tool = { path = "pydatalab/plugins/item_comparison_tool" }
```

As above, append the package to an existing `dependencies` array and retain all
existing source entries.

Build and start the development stack:

```shell
docker compose --profile dev up --build
```

The comparison plugin does not depend on *JupyterHub*. To exercise both tools in
the same development stack, use:

```shell
docker compose --profile dev --profile jupyterhub up --build
```

During the API image build, `invoke dev.install --no-dev` installs the staged
package and its `pydatalab.tools` entry point. The webapp image does not need a
plugin-specific change because the compiled bundle is served by the plugin's
authenticated blueprint.

After signing in, open **Tools → Item comparison**. For a direct smoke check,
open:

```text
http://localhost:8081/tools/item-comparison
```

Search for two seeded *items*, add them, switch between metadata fields and block
types, and check *side-by-side previews*. For two XRD or two Raman blocks, the
overlay control should also be available.

To check the table action, select two or more rows in Samples or Inventory, or
in the item table of a collection, then choose **Compare selected** from the
selected-items dropdown. Confirm that the same action is absent from Equipment.
