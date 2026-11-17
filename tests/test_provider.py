from types import SimpleNamespace

import pandas as pd
import pytest
from flask import Flask
from pydantic import ValidationError
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge

from datalab_item_comparison_tool import __version__
from datalab_item_comparison_tool import comparison as comparison_module
from datalab_item_comparison_tool.comparison import (
    MAX_BLOCKS,
    TOOL_BLUEPRINT,
    BlockReference,
    ComparisonData,
    LoadedBlock,
    OverlayRequest,
    PreviewRequest,
    _coerce_comparison_data,
    _load_block,
    _RequestBudget,
)
from datalab_item_comparison_tool.provider import (
    ItemComparisonToolProvider,
)


@pytest.fixture
def tool_client():
    app = Flask(__name__)
    app.register_blueprint(TOOL_BLUEPRINT)
    return app.test_client()


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


def test_preview_route_rejects_invalid_requests(tool_client):
    response = tool_client.post("/previews", json={"blocks": []})

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


def _loaded_block(
    item_id="sample",
    block_id="block",
    *,
    block_class=object,
    block_type="test",
    file_ids=(),
):
    return LoadedBlock(
        reference=BlockReference(item_id=item_id, block_id=block_id),
        block_class=block_class,
        config={"blocktype": block_type},
        item_file_ids=tuple(file_ids),
    )


def test_file_preflight_rejects_too_many_attachments_before_metadata_queries(monkeypatch):
    monkeypatch.setattr(comparison_module, "MAX_INPUT_FILES", 1)
    monkeypatch.setattr(
        comparison_module,
        "get_file_info_by_id",
        lambda *_args, **_kwargs: pytest.fail("metadata must not be queried"),
    )

    with pytest.raises(RequestEntityTooLarge):
        _RequestBudget.preflight([_loaded_block(file_ids=("first", "second"))])


def test_file_preflight_deduplicates_files_and_aggregates_bytes(monkeypatch):
    calls = []

    def file_info(file_id, *, update_if_live):
        calls.append((file_id, update_if_live))
        return {"location": "/missing", "size": 8}

    monkeypatch.setattr(comparison_module, "get_file_info_by_id", file_info)
    budget = _RequestBudget.preflight(
        [
            _loaded_block(item_id="first", file_ids=("shared",)),
            _loaded_block(item_id="second", file_ids=("shared",)),
        ]
    )

    assert calls == [("shared", False)]
    assert budget.total_file_bytes == 8

    monkeypatch.setattr(comparison_module, "MAX_INPUT_FILE_BYTES", 10)
    monkeypatch.setattr(comparison_module, "MAX_TOTAL_INPUT_BYTES", 15)
    with pytest.raises(RequestEntityTooLarge, match="may total at most"):
        _RequestBudget.preflight([_loaded_block(file_ids=("first", "second"))])


def test_dataframe_budgets_count_cells_and_deep_memory(monkeypatch):
    wide_frame = pd.DataFrame({f"column-{index}": [index] for index in range(4)})
    monkeypatch.setattr(comparison_module, "MAX_DATA_CELLS", 3)

    with pytest.raises(RequestEntityTooLarge, match="cells"):
        _coerce_comparison_data(
            {
                "series": [(None, wide_frame)],
                "x_options": ["column-0"],
                "x_default": "column-0",
                "y_default": "column-1",
            }
        )

    monkeypatch.setattr(comparison_module, "MAX_DATA_CELLS", 100)
    frame = pd.DataFrame({"x": ["a" * 20], "y": ["b" * 20]})
    frame_bytes = int(frame.memory_usage(index=True, deep=True).sum())
    monkeypatch.setattr(comparison_module, "MAX_DATAFRAME_BYTES", frame_bytes * 2 - 1)
    with pytest.raises(RequestEntityTooLarge, match="memory"):
        _coerce_comparison_data(
            {
                "series": [("first", frame), ("second", frame)],
                "x_options": ["x"],
                "x_default": "x",
                "y_default": "y",
            }
        )


def test_oversized_file_returns_413_before_parser_runs(monkeypatch, tool_client):
    loaded = [
        _loaded_block("first", "one", block_type="xrd", file_ids=("large",)),
        _loaded_block("second", "two", block_type="xrd", file_ids=("large",)),
    ]
    monkeypatch.setattr(comparison_module, "_load_blocks", lambda _references: loaded)
    monkeypatch.setattr(
        comparison_module,
        "get_file_info_by_id",
        lambda *_args, **_kwargs: {
            "location": "/missing",
            "name": "data.xrd",
            "size": 11,
        },
    )
    monkeypatch.setattr(comparison_module, "MAX_INPUT_FILE_BYTES", 10)
    monkeypatch.setattr(
        comparison_module,
        "_block_instance",
        lambda _loaded: pytest.fail("the parser must not be reached"),
    )
    response = tool_client.post(
        "/overlay",
        json={
            "blocks": [
                {"item_id": "first", "block_id": "one"},
                {"item_id": "second", "block_id": "two"},
            ]
        },
    )

    assert response.status_code == 413


def test_preview_response_budget_stops_later_rendering(monkeypatch, tool_client):
    calls = []

    class PreviewBlock:
        @classmethod
        def from_web(cls, config):
            return cls(config["block_id"])

        def __init__(self, block_id):
            self.block_id = block_id

        def to_web(self):
            calls.append(self.block_id)
            return {"payload": "x" * 60}

    monkeypatch.setattr(
        comparison_module,
        "_load_block",
        lambda reference: _loaded_block(
            reference.item_id,
            reference.block_id,
            block_class=PreviewBlock,
        ),
    )
    monkeypatch.setattr(comparison_module, "MAX_PREVIEW_BYTES", 1_000)
    monkeypatch.setattr(comparison_module, "MAX_RESPONSE_BYTES", 300)
    response = tool_client.post(
        "/previews",
        json={
            "blocks": [
                {"item_id": "item", "block_id": block_id}
                for block_id in ("first", "second", "third")
            ]
        },
    )

    assert response.status_code == 413
    assert calls == ["first", "second"]


def test_overlay_aggregate_dataframe_budget_returns_413(monkeypatch, tool_client):
    class ComparisonBlock:
        @classmethod
        def from_web(cls, _config):
            return cls()

        @classmethod
        def supports_comparison(cls):
            return True

        def get_comparison_data(self):
            return {
                "series": [(None, pd.DataFrame({"x": [1], "y": [2]}))],
                "x_options": ["x"],
                "x_default": "x",
                "y_default": "y",
            }

    loaded = [
        _loaded_block("first", "one", block_class=ComparisonBlock),
        _loaded_block("second", "two", block_class=ComparisonBlock),
    ]
    monkeypatch.setattr(comparison_module, "_load_blocks", lambda _references: loaded)
    monkeypatch.setattr(comparison_module, "MAX_DATA_CELLS", 3)
    monkeypatch.setattr(
        comparison_module,
        "selectable_axes_plot",
        lambda *_args, **_kwargs: pytest.fail("plotting must not be reached"),
    )
    response = tool_client.post(
        "/overlay",
        json={
            "blocks": [
                {"item_id": "first", "block_id": "one"},
                {"item_id": "second", "block_id": "two"},
            ]
        },
    )

    assert response.status_code == 413


def test_oversized_bokeh_json_returns_413(monkeypatch, tool_client):
    loaded = [
        _loaded_block("first", "one"),
        _loaded_block("second", "two"),
    ]
    comparison = ComparisonData(
        series=[(None, pd.DataFrame({"x": [1], "y": [2]}))],
        x_options=["x"],
        x_default="x",
        y_default="y",
    )
    monkeypatch.setattr(comparison_module, "_load_blocks", lambda _references: loaded)
    monkeypatch.setattr(comparison_module, "_supports_overlay", lambda *_args: True)
    monkeypatch.setattr(comparison_module, "_block_instance", lambda _loaded: object())
    monkeypatch.setattr(
        comparison_module,
        "_comparison_data",
        lambda _loaded, _block, _budget: comparison,
    )
    monkeypatch.setattr(
        comparison_module, "selectable_axes_plot", lambda *_args, **_kwargs: object()
    )
    monkeypatch.setattr(
        comparison_module.bokeh.embed,
        "json_item",
        lambda *_args, **_kwargs: {"payload": "x" * 100},
    )
    monkeypatch.setattr(comparison_module, "MAX_RESPONSE_BYTES", 10)
    response = tool_client.post(
        "/overlay",
        json={
            "blocks": [
                {"item_id": "first", "block_id": "one"},
                {"item_id": "second", "block_id": "two"},
            ]
        },
    )

    assert response.status_code == 413


def test_small_preview_still_succeeds(monkeypatch, tool_client):
    class PreviewBlock:
        @classmethod
        def from_web(cls, _config):
            return cls()

        def to_web(self):
            return {"title": "Small preview"}

    monkeypatch.setattr(
        comparison_module,
        "_load_block",
        lambda reference: _loaded_block(
            reference.item_id,
            reference.block_id,
            block_class=PreviewBlock,
        ),
    )
    response = tool_client.post(
        "/previews", json={"blocks": [{"item_id": "item", "block_id": "block"}]}
    )

    assert response.status_code == 200
    assert response.json["previews"][0]["block_data"] == {"title": "Small preview"}


def test_small_custom_overlay_still_succeeds(monkeypatch, tool_client):
    class ComparisonBlock:
        @classmethod
        def from_web(cls, _config):
            return cls()

        @classmethod
        def supports_comparison(cls):
            return True

        def get_comparison_data(self):
            return {
                "series": [(None, pd.DataFrame({"x": [1, 2], "y": [2, 3]}))],
                "x_options": ["x"],
                "x_default": "x",
                "y_default": "y",
            }

    loaded = [
        _loaded_block("first", "one", block_class=ComparisonBlock),
        _loaded_block("second", "two", block_class=ComparisonBlock),
    ]
    monkeypatch.setattr(comparison_module, "_load_blocks", lambda _references: loaded)
    response = tool_client.post(
        "/overlay",
        json={
            "blocks": [
                {"item_id": "first", "block_id": "one"},
                {"item_id": "second", "block_id": "two"},
            ]
        },
    )

    assert response.status_code == 200
    assert response.json["status"] == "success"
    assert response.json["bokeh_plot_data"]
