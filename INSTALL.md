# Installation

Item comparison runs trusted Python in the datalab API and trusted JavaScript in
signed-in users' pages. Review the selected release, Python and frontend
dependencies, lockfile, and compiled bundle before installation or upgrade.

## Install in datalab

Add the plugin to the datalab checkout's root `plugins.toml`, preserving any
existing entries:

```toml
dependencies = ["datalab-item-comparison-tool"]

[tool.uv.sources]
datalab-item-comparison-tool = { git = "https://github.com/Matgenix/datalab-item-comparison-tool.git", rev = "<reviewed-tag-or-commit>" }
```

Install the configured plugins:

```shell
cd pydatalab
uv run invoke dev.install
```

Restart a native API, or rebuild and recreate the Docker images. Sign in as a
normal user and verify both entry points:

1. Open **Tools** and choose **Item comparison**.
2. Select 2–20 items in Samples, Inventory, or a collection and choose
   **Compare selected**. The action is intentionally absent from Equipment.

No plugin-specific settings or separately hosted service are required. Use
datalab's
[plugin operations guide](https://docs.datalab-org.io/en/latest/plugins/#installing-and-maintaining-plugins)
for upgrades, rollback, removal, and tool ordering or disabling. Review this
plugin's [operational limits](https://matgenix.github.io/datalab-item-comparison-tool/operations/)
before production use.

## Development setup

```shell
git clone https://github.com/Matgenix/datalab-item-comparison-tool.git
cd datalab-item-comparison-tool
uv sync --locked --all-extras --dev
uv run pytest
uv run pre-commit run --all-files
```

After changing the frontend, rebuild its committed bundle:

```shell
cd frontend
corepack yarn install --frozen-lockfile
corepack yarn build
cd ..
```

Commit `frontend/yarn.lock` and
`src/datalab_item_comparison_tool/static/frontend/tool.js`.

For integration testing, replace the Git source above with an editable path to
this checkout, rerun `uv run invoke dev.install`, and restart datalab. For a
Compose development stack, rebuild with:

```shell
docker compose --profile dev up --build
```
