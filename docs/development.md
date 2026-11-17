# Development

Item comparison is an in-app tool discovered through the `pydatalab.tools`
entry-point group. Its frontend uses SDK version 1 for host components,
permission-aware API requests, navigation, dialogs, and selected-refcode query
parameters. The generic architecture and release workflow are documented in
datalab's
[tool plugin development guide](https://docs.datalab-org.io/en/latest/plugin-development/tool-plugin/).

## Permission boundary

The frontend sends block references to the provider's protected preview and
overlay routes. Each route reloads the item and block under the current user's
read filter before processing it. Keep that lookup in place for every new
server-side operation; an authenticated route alone does not authorize an
arbitrary item or database query.

XRD and Raman adapters live in this plugin. Other block types remain available
side by side without an adapter.

## Add overlay support to a block

A block plugin can opt into overlays by implementing its
`get_comparison_data()` contract. It may also implement a class method named
`supports_comparison()`; returning `false` hides overlay support without calling
the data hook.

`get_comparison_data()` returns a mapping or object with these fields:

| Field | Value |
|---|---|
| `series` | Non-empty list of `(label, pandas.DataFrame)` pairs; `label` is a string or `None` |
| `x_options` | Non-empty, unique column names offered for the x axis |
| `x_default` | One value from `x_options` |
| `y_default` | Default y-axis column name |
| `y_options` | Optional non-empty, unique list of y-axis column names containing `y_default` |

Every DataFrame must be non-empty and contain all declared x and y columns. For
example:

```python
def get_comparison_data(self):
    return {
        "series": [(None, dataframe)],
        "x_options": ["time", "cycle"],
        "x_default": "time",
        "y_options": ["value", "normalized_value"],
        "y_default": "value",
    }
```

All frames must remain within the [request limits](operations.md#request-limits),
including the aggregate series, cell, and deep-memory budgets. An overlay can
combine blocks only when their x options, default axes, and y options are
compatible.

Test capability detection, invalid or incompatible axes, permission failures,
and the resource limits. The provider's [API reference](reference.md) and tests
are supplementary references for advanced cases.

Use the repository [development setup](https://github.com/Matgenix/datalab-item-comparison-tool/blob/main/INSTALL.md#development-setup)
to run tests and rebuild the frontend.
