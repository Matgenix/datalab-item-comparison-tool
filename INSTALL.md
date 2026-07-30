# Installation and development

Install [uv](https://docs.astral.sh/uv/) and clone the repository:

```shell
git clone https://github.com/Matgenix/datalab-item-comparison-tool.git
cd datalab-item-comparison-tool
uv sync --locked --all-extras --dev
uv run pre-commit install
```


Build the in-app frontend:

```shell
cd frontend
corepack yarn install --frozen-lockfile
corepack yarn build
cd ..
```

Commit `frontend/yarn.lock` and
`src/datalab_item_comparison_tool/static/frontend/tool.js`.


## Install in a datalab checkout

Add the plugin to the datalab checkout's root `plugins.toml`:

```toml
dependencies = ["datalab-item-comparison-tool"]

[tool.uv.sources]
datalab-item-comparison-tool = { path = "dev-repos/datalab-item-comparison-tool", editable = true }
```

Preserve existing dependencies and source entries when merging this
configuration. Then install the configured plugins:

```shell
cd pydatalab
uv run invoke dev.install
```

Restart the datalab API after installation so it discovers the
`pydatalab.tools` entry point.

## Docker Compose development installation

The API image installs local plugins from the ignored `pydatalab/plugins/`
staging directory. From the datalab repository root:

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

Use the staged path in the root `plugins.toml`:

```toml
dependencies = ["datalab-item-comparison-tool"]

[tool.uv.sources]
datalab-item-comparison-tool = { path = "pydatalab/plugins/item_comparison_tool" }
```

Then rebuild the development stack:

```shell
docker compose --profile dev up --build
```

JupyterHub is independent of the comparison plugin. To run both:

```shell
docker compose --profile dev --profile jupyterhub up --build
```
