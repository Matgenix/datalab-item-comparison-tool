"""Provider for the in-app datalab item comparison tool."""

from pydatalab.tools import (
    InAppToolUI,
    ItemTableSelectionAction,
    ToolMetadata,
    ToolProvider,
)

from .comparison import TOOL_BLUEPRINT, TOOL_ID


class ItemComparisonToolProvider(ToolProvider):
    """Expose item comparison through datalab's generic in-app tool host."""

    id = TOOL_ID
    metadata = ToolMetadata(
        name="Item comparison",
        description="Compare item metadata and data blocks across datalab items.",
        version="0.1.0",
        icon="vials",
        ui=InAppToolUI(),
        launch_actions=(
            ItemTableSelectionAction(
                id="compare-selected",
                label="Compare selected",
                tables=("samples", "inventory", "collection-items"),
                min_items=2,
                max_items=20,
            ),
        ),
    )
    blueprint = TOOL_BLUEPRINT
