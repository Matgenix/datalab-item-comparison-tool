"""Permission-checked routes and block adapters for item comparison."""

from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bokeh.embed
import pandas as pd
from flask import Blueprint, jsonify, request, send_from_directory
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator
from pydatalab.apps import BLOCK_TYPES
from pydatalab.blocks.base import DataBlock
from pydatalab.bokeh_plots import DATALAB_BOKEH_THEME, selectable_axes_plot
from pydatalab.file_utils import get_file_info_by_id
from pydatalab.logger import LOGGER
from pydatalab.mongo import flask_mongo
from pydatalab.permissions import get_default_permissions, read_only_permissions
from werkzeug.exceptions import BadRequest

TOOL_ID = "item-comparison"
MAX_BLOCKS = 20
MAX_SERIES = 40
MAX_DATA_POINTS = 2_000_000

TOOL_BLUEPRINT = Blueprint("datalab_item_comparison_tool", __name__)
FRONTEND_DIRECTORY = Path(__file__).parent / "static" / "frontend"


class BlockReference(BaseModel):
    """A current-user reference to one block on one item."""

    model_config = ConfigDict(extra="forbid")

    item_id: str
    block_id: str
    label: str | None = None

    @field_validator("item_id", "block_id")
    @classmethod
    def validate_identifier(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 256:
            raise ValueError("item and block identifiers must contain 1–256 characters")
        return value

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or len(value) > 200:
            raise ValueError("labels must contain 1–200 characters")
        return value


class PreviewRequest(BaseModel):
    """A bounded request for permission-checked block previews."""

    model_config = ConfigDict(extra="forbid")

    blocks: list[BlockReference]

    @field_validator("blocks")
    @classmethod
    def validate_blocks(cls, value: list[BlockReference]) -> list[BlockReference]:
        if not 1 <= len(value) <= MAX_BLOCKS:
            raise ValueError(f"preview requests must contain 1–{MAX_BLOCKS} blocks")
        _reject_duplicate_references(value)
        return value


class OverlayRequest(BaseModel):
    """A bounded request for a same-type block overlay."""

    model_config = ConfigDict(extra="forbid")

    blocks: list[BlockReference]

    @field_validator("blocks")
    @classmethod
    def validate_blocks(cls, value: list[BlockReference]) -> list[BlockReference]:
        if not 2 <= len(value) <= MAX_BLOCKS:
            raise ValueError(f"overlay requests must contain 2–{MAX_BLOCKS} blocks")
        _reject_duplicate_references(value)
        return value


@dataclass(frozen=True)
class LoadedBlock:
    """A stored block loaded after applying current-user item permissions."""

    reference: BlockReference
    block_class: type[DataBlock]
    config: dict[str, Any]
    item_file_ids: tuple[Any, ...]


@dataclass(frozen=True)
class ComparisonData:
    """The small data contract accepted from block hooks and local adapters."""

    series: list[tuple[str | None, pd.DataFrame]]
    x_options: list[str]
    x_default: str
    y_default: str
    y_options: list[str] | None = None


ComparisonAdapter = Callable[[LoadedBlock, DataBlock], ComparisonData | None]


def _reject_duplicate_references(references: list[BlockReference]) -> None:
    keys = {(reference.item_id, reference.block_id) for reference in references}
    if len(keys) != len(references):
        raise ValueError("each item/block pair may occur only once")


def _validation_message(error: ValidationError) -> str:
    details = []
    for entry in error.errors()[:3]:
        location = ".".join(str(part) for part in entry["loc"])
        details.append(f"{location}: {entry['msg']}")
    return "; ".join(details)


def _parse_request(model: type[PreviewRequest] | type[OverlayRequest]):
    try:
        return model.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        raise BadRequest(f"Invalid comparison request: {_validation_message(exc)}") from None


def _load_block(reference: BlockReference) -> LoadedBlock:
    item = flask_mongo.db.items.find_one(
        {
            "item_id": reference.item_id,
            **get_default_permissions(user_only=False),
        },
        {
            "blocks_obj": 1,
            "file_ObjectIds": 1,
        },
    )
    blocks = item.get("blocks_obj", {}) if item else {}
    config = blocks.get(reference.block_id)
    if not isinstance(config, dict):
        raise BadRequest(
            f"Block {reference.block_id!r} on item {reference.item_id!r} was not found "
            "or is not readable."
        )

    block_type = config.get("blocktype")
    block_class = BLOCK_TYPES.get(block_type)
    if block_class is None:
        raise BadRequest(f"Block type {block_type!r} is not installed.")

    return LoadedBlock(
        reference=reference,
        block_class=block_class,
        config=deepcopy(config),
        item_file_ids=tuple(item.get("file_ObjectIds", ())),
    )


def _load_blocks(references: list[BlockReference]) -> list[LoadedBlock]:
    return [_load_block(reference) for reference in references]


def _block_instance(loaded: LoadedBlock) -> DataBlock:
    config = deepcopy(loaded.config)
    config["item_id"] = loaded.reference.item_id
    config["block_id"] = loaded.reference.block_id
    return loaded.block_class.from_web(config)


def _has_comparison_hook(block_class: type[DataBlock]) -> bool:
    hook = getattr(block_class, "get_comparison_data", None)
    base_hook = getattr(DataBlock, "get_comparison_data", None)
    if not callable(hook) or hook is base_hook:
        return False

    supports = getattr(block_class, "supports_comparison", None)
    if callable(supports):
        try:
            return bool(supports())
        except Exception:
            LOGGER.exception("Block %s failed its comparison capability check", block_class)
            return False
    return True


def _supports_overlay(block_type: str, block_class: type[DataBlock]) -> bool:
    return block_type in COMPARISON_ADAPTERS or _has_comparison_hook(block_class)


def _comparison_field(data: Any, name: str) -> Any:
    if isinstance(data, dict):
        return data.get(name)
    return getattr(data, name, None)


def _coerce_axis_options(data: Any, name: str, *, optional: bool = False) -> list[str]:
    value = _comparison_field(data, name)
    if value is None and optional:
        return []
    if not isinstance(value, (list, tuple)) or not value:
        raise ValueError(f"comparison data must declare at least one {name}")
    if any(not isinstance(option, str) or not option.strip() for option in value):
        raise ValueError(f"comparison {name} must contain non-empty strings")

    options = [option.strip() for option in value]
    if len(options) != len(set(options)):
        raise ValueError(f"comparison {name} must not contain duplicates")
    return options


def _coerce_comparison_data(data: Any) -> ComparisonData:
    raw_series = _comparison_field(data, "series")
    x_options = _coerce_axis_options(data, "x_options")
    x_default = _comparison_field(data, "x_default")
    y_default = _comparison_field(data, "y_default")
    y_options = _coerce_axis_options(data, "y_options", optional=True) or None

    if not isinstance(raw_series, (list, tuple)) or not raw_series:
        raise ValueError("comparison data must contain at least one series")
    if len(raw_series) > MAX_SERIES:
        raise ValueError(f"comparison data may contain at most {MAX_SERIES} series")
    if (
        not isinstance(x_default, str)
        or not x_default.strip()
        or not isinstance(y_default, str)
        or not y_default.strip()
    ):
        raise ValueError("comparison data must declare default x and y axes")
    x_default = x_default.strip()
    y_default = y_default.strip()

    normalized_series: list[tuple[str | None, pd.DataFrame]] = []
    total_points = 0
    for entry in raw_series:
        if not isinstance(entry, (list, tuple)) or len(entry) != 2:
            raise ValueError("each comparison series must be a (label, dataframe) pair")
        sublabel, dataframe = entry
        if sublabel is not None and not isinstance(sublabel, str):
            raise ValueError("comparison series labels must be strings or null")
        if not isinstance(dataframe, pd.DataFrame) or dataframe.empty:
            raise ValueError("comparison series must contain non-empty pandas dataframes")
        normalized_series.append((sublabel, dataframe.copy()))
        total_points += len(dataframe)

    if total_points > MAX_DATA_POINTS:
        raise ValueError(f"comparison data may contain at most {MAX_DATA_POINTS:,} data points")
    if x_default not in x_options:
        raise ValueError("the default x-axis must be included in x_options")
    if y_options is not None and y_default not in y_options:
        raise ValueError("the default y-axis must be included in y_options")

    required_columns = {*x_options, y_default, *(y_options or ())}
    for _, dataframe in normalized_series:
        missing_columns = required_columns.difference(dataframe.columns)
        if missing_columns:
            raise ValueError(
                "comparison dataframe does not contain its declared axes: "
                + ", ".join(sorted(missing_columns))
            )

    return ComparisonData(
        series=normalized_series,
        x_options=x_options,
        x_default=x_default,
        y_default=y_default,
        y_options=y_options,
    )


def _comparison_signature(data: ComparisonData) -> tuple[Any, ...]:
    return (
        tuple(data.x_options),
        data.x_default,
        data.y_default,
        tuple(data.y_options or ()),
    )


def _xrd_comparison_data(loaded: LoadedBlock, block: DataBlock) -> ComparisonData | None:
    file_id = block.data.get("file_id")
    locations: list[tuple[str | None, str]] = []
    if file_id:
        _require_attached_file(loaded, file_id)
        file_info = get_file_info_by_id(file_id, update_if_live=False)
        locations.append((None, file_info["location"]))
    else:
        accepted_extensions = tuple(
            extension.lower() for extension in block.accepted_file_extensions
        )
        for attached_file_id in loaded.item_file_ids:
            try:
                file_info = get_file_info_by_id(attached_file_id, update_if_live=False)
            except OSError:
                continue
            if file_info["name"].lower().endswith(accepted_extensions):
                locations.append((file_info["name"], file_info["location"]))
                if len(locations) > MAX_SERIES:
                    raise BadRequest(f"An overlay may contain at most {MAX_SERIES} data series.")
        if len(locations) == 1:
            locations[0] = (None, locations[0][1])

    if not locations:
        return None

    wavelength = float(block.data.get("wavelength") or block.defaults["wavelength"])
    series: list[tuple[str | None, pd.DataFrame]] = []
    y_options: list[str] = []
    for sublabel, location in locations:
        dataframe, y_options, _ = block.load_pattern(location, wavelength=wavelength)
        series.append((sublabel, dataframe))

    return ComparisonData(
        series=series,
        x_options=["2θ (°)", "Q (Å⁻¹)", "d (Å)"],
        x_default="2θ (°)",
        y_default="normalized intensity",
        y_options=y_options,
    )


def _raman_comparison_data(loaded: LoadedBlock, block: DataBlock) -> ComparisonData | None:
    file_id = block.data.get("file_id")
    if not file_id:
        return None

    _require_attached_file(loaded, file_id)
    file_info = get_file_info_by_id(file_id, update_if_live=False)
    dataframe, metadata, y_options = block.load(file_info["location"])
    wavenumber_unit = metadata.get("wavenumber_unit", "Unknown unit")
    if wavenumber_unit.startswith("1/"):
        wavenumber_unit = f"{wavenumber_unit[2:]}⁻¹"
    x_label = f"wavenumber ({wavenumber_unit})"
    dataframe[x_label] = dataframe["wavenumber"]

    return ComparisonData(
        series=[(None, dataframe)],
        x_options=[x_label],
        x_default=x_label,
        y_default="normalized intensity",
        y_options=y_options,
    )


COMPARISON_ADAPTERS: dict[str, ComparisonAdapter] = {
    "raman": _raman_comparison_data,
    "xrd": _xrd_comparison_data,
}


def _require_attached_file(loaded: LoadedBlock, file_id: Any) -> None:
    if str(file_id) not in {str(attached_file_id) for attached_file_id in loaded.item_file_ids}:
        raise BadRequest(f"File {file_id!r} is not attached to item {loaded.reference.item_id!r}.")


def _comparison_data(loaded: LoadedBlock, block: DataBlock) -> ComparisonData | None:
    if _has_comparison_hook(loaded.block_class):
        data = block.get_comparison_data()
        if data is not None:
            return _coerce_comparison_data(data)

    block_type = loaded.config.get("blocktype")
    if not isinstance(block_type, str):
        return None
    adapter = COMPARISON_ADAPTERS.get(block_type)
    if adapter is None:
        return None
    data = adapter(loaded, block)
    return None if data is None else _coerce_comparison_data(data)


@TOOL_BLUEPRINT.get("/frontend/tool.js")
def frontend_entrypoint():
    """Serve the single compiled in-app tool bundle."""
    response = send_from_directory(FRONTEND_DIRECTORY, "tool.js")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@TOOL_BLUEPRINT.get("/capabilities")
def capabilities():
    """Return display metadata and overlay support for installed block types."""
    response = jsonify(
        {
            "block_types": [
                {
                    "id": block_type,
                    "name": getattr(block_class, "name", "") or block_type,
                    "supports_overlay": _supports_overlay(block_type, block_class),
                }
                for block_type, block_class in sorted(BLOCK_TYPES.items())
            ]
        }
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@TOOL_BLUEPRINT.post("/previews")
@read_only_permissions
def previews():
    """Generate previews without persisting regenerated block state to the item."""
    payload = _parse_request(PreviewRequest)
    results = []
    for reference in payload.blocks:
        try:
            loaded = _load_block(reference)
            block_data = _block_instance(loaded).to_web()
            results.append(
                {
                    "status": "success",
                    "item_id": reference.item_id,
                    "block_id": reference.block_id,
                    "block_data": block_data,
                }
            )
        except BadRequest as exc:
            results.append(
                {
                    "status": "error",
                    "item_id": reference.item_id,
                    "block_id": reference.block_id,
                    "message": exc.description,
                }
            )
        except Exception:
            LOGGER.exception(
                "Unable to render comparison preview for item %r block %r",
                reference.item_id,
                reference.block_id,
            )
            results.append(
                {
                    "status": "error",
                    "item_id": reference.item_id,
                    "block_id": reference.block_id,
                    "message": "The block preview could not be generated.",
                }
            )

    response = jsonify({"previews": results})
    response.headers["Cache-Control"] = "no-store"
    return response


@TOOL_BLUEPRINT.post("/overlay")
@read_only_permissions
def overlay():
    """Overlay comparable data from two or more permission-checked blocks."""
    payload = _parse_request(OverlayRequest)
    loaded_blocks = _load_blocks(payload.blocks)
    block_types = {loaded.config.get("blocktype") for loaded in loaded_blocks}
    if len(block_types) != 1:
        raise BadRequest("All blocks in an overlay must have the same block type.")

    block_type = block_types.pop()
    if not isinstance(block_type, str) or not _supports_overlay(
        block_type, loaded_blocks[0].block_class
    ):
        raise BadRequest(f"Overlay comparison is not supported for {block_type!r} blocks.")

    labelled_dataframes: dict[str, pd.DataFrame] = {}
    axis_signature = None
    comparison = None
    total_points = 0
    try:
        for loaded in loaded_blocks:
            data = _comparison_data(loaded, _block_instance(loaded))
            if data is None:
                raise BadRequest(
                    f"No comparable data was found for block {loaded.reference.block_id!r}."
                )

            signature = _comparison_signature(data)
            if axis_signature is None:
                axis_signature = signature
            elif signature != axis_signature:
                raise BadRequest("The selected blocks expose incompatible comparison axes.")
            comparison = data

            base_label = loaded.reference.label or loaded.reference.item_id
            for sublabel, dataframe in data.series:
                label = base_label if not sublabel else f"{base_label} – {sublabel}"
                unique_label = label
                suffix = 1
                while unique_label in labelled_dataframes:
                    suffix += 1
                    unique_label = f"{label} ({suffix})"
                labelled_dataframes[unique_label] = dataframe
                total_points += len(dataframe)
                if len(labelled_dataframes) > MAX_SERIES:
                    raise BadRequest(f"An overlay may contain at most {MAX_SERIES} data series.")
                if total_points > MAX_DATA_POINTS:
                    raise BadRequest(
                        f"An overlay may contain at most {MAX_DATA_POINTS:,} data points."
                    )
    except BadRequest:
        raise
    except Exception:
        LOGGER.exception("Unable to load %r block data for comparison", block_type)
        raise BadRequest("The selected block data could not be prepared for overlay.") from None

    if comparison is None:
        raise BadRequest("No comparable data was found.")

    try:
        plot = selectable_axes_plot(
            labelled_dataframes,
            x_options=comparison.x_options,
            x_default=comparison.x_default,
            y_options=comparison.y_options or None,
            y_default=comparison.y_default,
            plot_line=True,
            plot_points=False,
            use_unique_labels=False,
        )
        plot_data = bokeh.embed.json_item(plot, theme=DATALAB_BOKEH_THEME)
    except Exception:
        LOGGER.exception("Unable to plot %r block comparison data", block_type)
        raise BadRequest("The selected block data could not be plotted.") from None

    response = jsonify(
        {
            "status": "success",
            "bokeh_plot_data": plot_data,
        }
    )
    response.headers["Cache-Control"] = "no-store"
    return response
