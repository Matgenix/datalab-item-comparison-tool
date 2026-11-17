# Item comparison

Item comparison shows metadata and data blocks from several datalab items in
one permission-aware view.

## Start a comparison

Choose either entry point:

- Open **Tools** and choose **Item comparison**, then use **Add an item to
  compare** to search for samples, starting materials, or cells.
- Select 2–20 rows in Samples, Inventory, or the items in a collection, then
  choose **Compare selected**. The action is not available in Equipment.

You can add or remove items at any time, up to a total of 20. The ordered
refcodes remain in the page URL, so you can bookmark the comparison or share it
with another user. The recipient sees only items their own datalab account can
access.

## Compare metadata

The **Metadata** card shows five items at a time. Use its arrows to move between
pages when the comparison contains more items.

- **Differences** shows fields whose displayed values are not all equal.
- **All fields** also shows identical values.
- Click an item name to open its datalab page, or use **×** to remove it from
  the comparison.

An item that was removed, renamed, or is not accessible appears as a load
failure and can be removed from the comparison.

## Compare data blocks

The **Block comparison** card lists the union of block types attached to the
selected items. Choose a type, then enable or disable individual blocks.

- **Side by side** renders available Bokeh plots, supported images, comments,
  and errors in separate columns. It remains available when only some items have
  that block type.
- **Overlay** combines compatible series in one plot. It is currently supported
  for XRD, Raman, and block plugins that implement the comparison-data contract.
  At least two compatible blocks must be enabled.

If a preview fails, use **Retry**. An HTTP 413 or a size-limit message means the
selection exceeds a fixed server budget; reduce the number of blocks or choose
items with smaller attachments. The exact budgets and preflight behavior are in
the [operations guide](operations.md#request-limits).

## Getting help

If the tool is absent from the complete Tools catalog, ask the deployment
administrator whether the plugin is installed and enabled. Administrators
should follow the repository's
[installation guide](https://github.com/Matgenix/datalab-item-comparison-tool/blob/main/INSTALL.md).
