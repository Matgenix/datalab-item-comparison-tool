from datalab_item_comparison_tool import __version__
from datalab_item_comparison_tool.provider import (
    ItemComparisonToolProvider,
)


def test_provider_metadata():
    provider = ItemComparisonToolProvider()

    assert provider.id == "item-comparison"
    assert provider.metadata.version == __version__
    assert provider.metadata.ui.kind == "in_app"
    assert len(provider.metadata.launch_actions) == 1

    action = provider.metadata.launch_actions[0]
    assert action.id == "compare-selected"
    assert action.tables == ("samples", "inventory", "collection-items")
    assert action.min_items == 2
    assert action.max_items == 20
