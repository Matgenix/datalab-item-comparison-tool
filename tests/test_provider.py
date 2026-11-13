from types import SimpleNamespace

import pandas as pd
import pytest
from flask import Flask
from pydantic import ValidationError
from werkzeug.exceptions import BadRequest

from datalab_item_comparison_tool import __version__
from datalab_item_comparison_tool import comparison as comparison_module
from datalab_item_comparison_tool.comparison import (
    MAX_BLOCKS,
    TOOL_BLUEPRINT,
    BlockReference,
    OverlayRequest,
    PreviewRequest,
    _coerce_comparison_data,
    _load_block,
)
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


def test_comparison_requests_are_bounded_unique_and_strict():
    references = [
        {"item_id": f"item-{index}", "block_id": f"block-{index}"} for index in range(MAX_BLOCKS)
    ]

    assert len(PreviewRequest.model_validate({"blocks": references}).blocks) == MAX_BLOCKS

    with pytest.raises(ValidationError, match="each item/block pair may occur only once"):
        OverlayRequest.model_validate({"blocks": [references[0], references[0]]})
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BlockReference.model_validate({**references[0], "unexpected": True})
    with pytest.raises(ValidationError, match="must contain 2"):
        OverlayRequest.model_validate({"blocks": references[:1]})


def test_comparison_data_requires_declared_axes_and_columns():
    comparison = _coerce_comparison_data(
        {
            "series": [("first", pd.DataFrame({"x": [1, 2], "y": [3, 4]}))],
            "x_options": ["x"],
            "x_default": "x",
            "y_default": "y",
        }
    )
    assert comparison.x_default == "x"

    with pytest.raises(ValueError, match="does not contain its declared axes"):
        _coerce_comparison_data(
            {
                "series": [(None, pd.DataFrame({"x": [1]}))],
                "x_options": ["x"],
                "x_default": "x",
                "y_default": "missing",
            }
        )


def test_preview_route_rejects_invalid_requests_before_loading_blocks():
    app = Flask(__name__)
    app.register_blueprint(TOOL_BLUEPRINT)

    response = app.test_client().post("/previews", json={"blocks": []})

    assert response.status_code == 400
    assert b"Invalid comparison request" in response.data


def test_block_lookup_always_includes_current_user_permissions(monkeypatch):
    captured_query = None

    class Items:
        @staticmethod
        def find_one(query, _projection):
            nonlocal captured_query
            captured_query = query
            return None

    monkeypatch.setattr(
        comparison_module,
        "flask_mongo",
        SimpleNamespace(db=SimpleNamespace(items=Items())),
    )
    monkeypatch.setattr(
        comparison_module,
        "get_default_permissions",
        lambda **_kwargs: {"creator_ids": {"$in": ["current-user"]}},
    )

    with pytest.raises(BadRequest, match="not found or is not readable"):
        _load_block(BlockReference(item_id="sample", block_id="block"))

    assert captured_query == {
        "item_id": "sample",
        "creator_ids": {"$in": ["current-user"]},
    }
