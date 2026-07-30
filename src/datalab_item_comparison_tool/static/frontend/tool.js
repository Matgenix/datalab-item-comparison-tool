(function(vue) {
	//#region \0plugin-vue:export-helper
	var _plugin_vue_export_helper_default = (sfc, props) => {
		const target = sfc.__vccOpts || sfc;
		for (const [key, val] of props) target[key] = val;
		return target;
	};
	//#endregion
	//#region src/ToolView.vue
	var sdk = window.datalabToolSdk;
	var { BokehPlot, ChemicalFormula, FormattedItemName, ItemSelect } = sdk.components;
	var PLUGIN_API = `tools/plugins/item-comparison`;
	var MAX_ITEMS = 20;
	var MAX_BLOCKS_PER_REQUEST = 20;
	var PAGE_SIZE = 5;
	var ITEM_TYPES = [
		"samples",
		"starting_materials",
		"cells"
	];
	var SAMPLE_COLORS = [
		"#1b9e77",
		"#d95f02",
		"#7570b3",
		"#e7298a",
		"#66a61e",
		"#e6ab02",
		"#a6761d",
		"#666666"
	];
	function errorMessage(error) {
		if (error instanceof Error) return error.message;
		if (typeof error === "string") return error;
		return "Unexpected response from datalab.";
	}
	var _sfc_main = {
		name: "DatalabComparisonTool",
		components: {
			BokehPlot,
			ChemicalFormula,
			FormattedItemName,
			ItemSelect
		},
		data() {
			return {
				maxItems: MAX_ITEMS,
				itemTypes: ITEM_TYPES,
				itemToAdd: null,
				itemsByRefcode: {},
				itemErrors: {},
				blockTypes: {},
				capabilitiesLoaded: false,
				capabilitiesError: null,
				loading: true,
				loadSequence: 0,
				mode: "side-by-side",
				selectedBlockType: null,
				blockEnabled: {},
				previews: {},
				previewErrors: {},
				previewLoading: {},
				previewGeneration: 0,
				resizeNudgeTimer: null,
				overlayPlotData: null,
				overlayError: null,
				overlayLoading: false,
				overlaySequence: 0,
				showDiffOnly: true,
				metadataCollapsed: false,
				blocksCollapsed: false,
				metadataPage: 0
			};
		},
		computed: {
			requestedItemRefcodes() {
				return sdk.selection.current().itemRefcodes;
			},
			itemRefcodes() {
				return this.requestedItemRefcodes.slice(0, MAX_ITEMS);
			},
			routeSelectionKey() {
				return this.itemRefcodes.join(",");
			},
			items() {
				return this.itemRefcodes.map((refcode) => this.itemsByRefcode[refcode]).filter(Boolean);
			},
			loadFailures() {
				return this.itemRefcodes.filter((refcode) => this.itemErrors[refcode]).map((refcode) => ({
					id: refcode,
					message: this.itemErrors[refcode]
				}));
			},
			metadataRows() {
				return [
					{
						label: "Name",
						key: "name",
						render: (item) => item.name || "—"
					},
					{
						label: "ID",
						key: "item_id",
						render: (item) => item.item_id || "—"
					},
					{
						label: "Date",
						key: "date",
						render: (item) => this.formatDate(item.date)
					},
					{
						label: "Chemical formula",
						key: "chemform",
						render: (item) => item.chemform || "—"
					},
					{
						label: "Description",
						key: "description",
						render: (item) => item.description || "—"
					},
					{
						label: "Blocks",
						key: "blocks",
						render: (item) => Object.keys(item.blocks_obj || {}).length
					},
					{
						label: "Refcode",
						key: "refcode",
						render: (item) => item.refcode || "—"
					},
					{
						label: "Type",
						key: "type",
						render: (item) => item.type || "—"
					},
					{
						label: "Status",
						key: "status",
						render: (item) => item.status || "—"
					},
					{
						label: "Creators",
						key: "creators",
						render: (item) => this.formatReferences(item.creators)
					},
					{
						label: "Collections",
						key: "collections",
						render: (item) => this.formatReferences(item.collections)
					}
				];
			},
			displayedMetadataRows() {
				if (!this.showDiffOnly) return this.metadataRows;
				return this.metadataRows.filter((field) => this.fieldDiffers(field));
			},
			hiddenIdenticalCount() {
				if (!this.showDiffOnly) return 0;
				return this.metadataRows.length - this.displayedMetadataRows.length;
			},
			totalPages() {
				return Math.max(1, Math.ceil(this.items.length / PAGE_SIZE));
			},
			pagedItems() {
				const start = this.metadataPage * PAGE_SIZE;
				return this.items.slice(start, start + PAGE_SIZE).map((item, index) => ({
					item,
					index: start + index
				}));
			},
			pageStart() {
				return this.items.length ? this.metadataPage * PAGE_SIZE + 1 : 0;
			},
			pageEnd() {
				return Math.min((this.metadataPage + 1) * PAGE_SIZE, this.items.length);
			},
			blockTypeStats() {
				const stats = {};
				for (const item of this.items) {
					const typesInItem = /* @__PURE__ */ new Set();
					for (const block of Object.values(item.blocks_obj || {})) {
						if (!block.blocktype) continue;
						stats[block.blocktype] ||= {
							id: block.blocktype,
							blockCount: 0,
							sampleCount: 0
						};
						stats[block.blocktype].blockCount += 1;
						typesInItem.add(block.blocktype);
					}
					for (const blockType of typesInItem) stats[blockType].sampleCount += 1;
				}
				return Object.values(stats).map((entry) => ({
					...entry,
					name: this.blockTypeName(entry.id),
					partial: entry.sampleCount < this.items.length
				})).sort((left, right) => left.name.localeCompare(right.name));
			},
			allBlockTypesKey() {
				return this.blockTypeStats.map((entry) => entry.id).join(",");
			},
			overlaySupported() {
				return Boolean(this.blockTypes[this.selectedBlockType]?.supportsOverlay);
			},
			matchingBlocks() {
				if (!this.selectedBlockType) return [];
				const entries = [];
				this.items.forEach((item, itemIndex) => {
					const sameTypeBlocks = Object.values(item.blocks_obj || {}).filter((block) => block.blocktype === this.selectedBlockType);
					let ordinal = 0;
					for (const [blockId, storedBlock] of Object.entries(item.blocks_obj || {})) {
						if (storedBlock.blocktype !== this.selectedBlockType) continue;
						ordinal += 1;
						const key = `${item.item_id}:${blockId}`;
						const preview = this.previews[key] || storedBlock;
						const fileNames = (storedBlock.file_id ? [storedBlock.file_id] : Array.isArray(storedBlock.file_ids) ? storedBlock.file_ids : []).map((fileId) => this.fileName(item, fileId)).filter(Boolean);
						const fileLabel = fileNames.length === 1 ? fileNames[0] : fileNames.length > 1 ? `${fileNames.length} files` : null;
						const distinguisher = sameTypeBlocks.length > 1 ? fileLabel || `#${ordinal}` : null;
						const blockErrors = Array.isArray(preview.errors) ? preview.errors.filter(Boolean).join("; ") : null;
						entries.push({
							key,
							itemId: item.item_id,
							itemType: item.type || "samples",
							itemName: item.name,
							blockId,
							title: storedBlock.title,
							chipLabel: item.name || item.item_id,
							distinguisher,
							fileLabel,
							fileTooltip: fileNames.join(", ") || null,
							color: this.sampleColor(itemIndex),
							bokehPlotData: preview.bokeh_plot_data || null,
							imageData: this.blockImageData(item, preview),
							comment: preview.freeform_comment || null,
							error: this.previewErrors[key] || blockErrors,
							loading: Boolean(this.previewLoading[key])
						});
					}
				});
				return entries;
			},
			activeBlocks() {
				return this.matchingBlocks.filter((entry) => this.isBlockEnabled(entry.key));
			},
			activeBlockKeys() {
				return this.activeBlocks.map((entry) => entry.key).join(",");
			},
			gridStyle() {
				return { gridTemplateColumns: `repeat(${Math.min(this.activeBlocks.length || 1, 2)}, minmax(0, 1fr))` };
			}
		},
		watch: {
			routeSelectionKey: {
				immediate: true,
				handler() {
					this.loadItems();
				}
			},
			allBlockTypesKey(key) {
				const available = key ? key.split(",") : [];
				if (!this.selectedBlockType || !available.includes(this.selectedBlockType)) this.selectedBlockType = available[0] || null;
			},
			selectedBlockType() {
				this.resetOverlay();
				if (!this.overlaySupported && this.mode === "overlay") {
					this.mode = "side-by-side";
					return;
				}
				this.$nextTick(() => this.ensurePreviews());
			},
			mode(mode) {
				if (mode === "overlay") this.runOverlay();
				else {
					this.resetOverlay();
					this.ensurePreviews();
				}
			},
			activeBlockKeys() {
				if (this.mode === "overlay") this.runOverlay();
				else this.ensurePreviews();
			}
		},
		beforeUnmount() {
			this.loadSequence += 1;
			this.previewGeneration += 1;
			this.overlaySequence += 1;
			if (this.resizeNudgeTimer) window.clearTimeout(this.resizeNudgeTimer);
		},
		methods: {
			async loadCapabilities() {
				if (this.capabilitiesLoaded) return;
				try {
					const response = await sdk.api.get(`${PLUGIN_API}/capabilities`);
					const blockTypes = {};
					for (const blockType of response.block_types || []) blockTypes[blockType.id] = {
						name: blockType.name || blockType.id,
						supportsOverlay: Boolean(blockType.supports_overlay)
					};
					this.blockTypes = blockTypes;
					this.capabilitiesLoaded = true;
					this.capabilitiesError = null;
				} catch (error) {
					this.capabilitiesError = errorMessage(error);
				}
			},
			async loadItems() {
				const sequence = ++this.loadSequence;
				this.previewGeneration += 1;
				this.overlaySequence += 1;
				this.loading = true;
				this.metadataPage = 0;
				this.itemsByRefcode = {};
				this.itemErrors = {};
				this.blockEnabled = {};
				this.previews = {};
				this.previewErrors = {};
				this.previewLoading = {};
				this.overlayPlotData = null;
				this.overlayError = null;
				this.overlayLoading = false;
				await this.loadCapabilities();
				await Promise.all(this.itemRefcodes.map(async (refcode) => {
					try {
						const response = await sdk.api.get(`items/${encodeURIComponent(refcode)}`);
						if (sequence === this.loadSequence) {
							this.itemsByRefcode[refcode] = response.item_data;
							delete this.itemErrors[refcode];
						}
					} catch (error) {
						if (sequence === this.loadSequence) this.itemErrors[refcode] = errorMessage(error);
					}
				}));
				if (sequence !== this.loadSequence) return;
				this.loading = false;
				this.$nextTick(() => this.ensurePreviews());
			},
			replaceItemRefcodes(refcodes) {
				sdk.selection.replaceItemRefcodes(refcodes);
			},
			onAddItem(item) {
				const refcode = item?.refcode;
				this.itemToAdd = null;
				if (!refcode || this.itemRefcodes.includes(refcode)) return;
				if (this.itemRefcodes.length >= MAX_ITEMS) {
					sdk.dialogs.alert({
						title: "Comparison is full",
						message: `Remove an item before adding another. At most ${MAX_ITEMS} items can be compared.`
					});
					return;
				}
				this.replaceItemRefcodes([...this.itemRefcodes, refcode]);
			},
			removeItem(refcode) {
				this.replaceItemRefcodes(this.requestedItemRefcodes.filter((candidate) => candidate !== refcode));
			},
			async ensurePreviews() {
				if (this.mode !== "side-by-side" || this.loading) return;
				const missing = this.activeBlocks.filter((entry) => !this.previews[entry.key] && !this.previewErrors[entry.key] && !this.previewLoading[entry.key]).slice(0, MAX_BLOCKS_PER_REQUEST);
				if (!missing.length) {
					this.$nextTick(() => this.nudgeBokehResize());
					return;
				}
				const generation = this.previewGeneration;
				const expectedKeys = new Set(missing.map((entry) => entry.key));
				for (const entry of missing) this.previewLoading[entry.key] = true;
				try {
					const response = await sdk.api.post(`${PLUGIN_API}/previews`, { blocks: missing.map((entry) => ({
						item_id: entry.itemId,
						block_id: entry.blockId
					})) });
					if (generation !== this.previewGeneration) return;
					const returnedKeys = /* @__PURE__ */ new Set();
					for (const result of response.previews || []) {
						const key = `${result.item_id}:${result.block_id}`;
						if (!expectedKeys.has(key) || returnedKeys.has(key)) throw new Error("datalab returned an invalid block-preview response.");
						returnedKeys.add(key);
						if (result.status === "success") {
							this.previews[key] = result.block_data;
							delete this.previewErrors[key];
						} else this.previewErrors[key] = result.message || "The preview could not be generated.";
					}
					for (const entry of missing) if (!returnedKeys.has(entry.key)) this.previewErrors[entry.key] = "datalab returned no preview for this block.";
				} catch (error) {
					if (generation === this.previewGeneration) for (const entry of missing) this.previewErrors[entry.key] = errorMessage(error);
				} finally {
					if (generation === this.previewGeneration) {
						for (const entry of missing) this.previewLoading[entry.key] = false;
						this.$nextTick(() => {
							this.nudgeBokehResize();
							this.ensurePreviews();
						});
					}
				}
			},
			nudgeBokehResize() {
				if (this.resizeNudgeTimer) window.clearTimeout(this.resizeNudgeTimer);
				this.resizeNudgeTimer = window.setTimeout(() => {
					window.dispatchEvent(new Event("resize"));
					this.resizeNudgeTimer = null;
				}, 100);
			},
			retryPreview(key) {
				delete this.previewErrors[key];
				delete this.previews[key];
				this.ensurePreviews();
			},
			setOverlayMode() {
				if (this.overlaySupported) this.mode = "overlay";
			},
			resetOverlay() {
				this.overlaySequence += 1;
				this.overlayLoading = false;
				this.overlayError = null;
				this.overlayPlotData = null;
			},
			async runOverlay() {
				if (this.mode !== "overlay" || !this.overlaySupported) return;
				if (this.activeBlocks.length < 2) {
					this.overlayError = "Enable at least two blocks to build an overlay.";
					this.overlayPlotData = null;
					return;
				}
				if (this.activeBlocks.length > MAX_BLOCKS_PER_REQUEST) {
					this.overlayError = `An overlay can contain at most ${MAX_BLOCKS_PER_REQUEST} blocks.`;
					this.overlayPlotData = null;
					return;
				}
				const sequence = ++this.overlaySequence;
				this.overlayLoading = true;
				this.overlayError = null;
				this.overlayPlotData = null;
				try {
					const response = await sdk.api.post(`${PLUGIN_API}/overlay`, { blocks: this.activeBlocks.map((entry) => ({
						item_id: entry.itemId,
						block_id: entry.blockId,
						label: entry.distinguisher ? `${entry.chipLabel} · ${this.shortenName(entry.distinguisher)}` : entry.chipLabel
					})) });
					if (sequence === this.overlaySequence) this.overlayPlotData = response.bokeh_plot_data;
				} catch (error) {
					if (sequence === this.overlaySequence) this.overlayError = errorMessage(error);
				} finally {
					if (sequence === this.overlaySequence) this.overlayLoading = false;
				}
			},
			fieldDiffers(field) {
				if (this.items.length < 2) return false;
				return new Set(this.items.map((item) => String(field.render(item)))).size > 1;
			},
			isBlockEnabled(key) {
				return this.blockEnabled[key] !== false;
			},
			toggleBlock(key) {
				this.blockEnabled[key] = !this.isBlockEnabled(key);
			},
			chipTooltip(entry) {
				const detail = entry.fileTooltip || entry.title;
				const action = this.isBlockEnabled(entry.key) ? "click to hide" : "click to show";
				return detail ? `${detail} — ${action}` : action;
			},
			blockTypeTitle(blockType) {
				if (!blockType.partial) return `${blockType.name}: ${blockType.blockCount} block(s)`;
				return `${blockType.name}: ${blockType.blockCount} block(s) in ${blockType.sampleCount}/${this.items.length} items`;
			},
			blockTypeName(blockType) {
				return this.blockTypes[blockType]?.name || blockType || "selected";
			},
			sampleColor(index) {
				return SAMPLE_COLORS[index % SAMPLE_COLORS.length];
			},
			fileName(item, fileId) {
				return (item.files || []).find((candidate) => String(candidate.immutable_id) === String(fileId))?.name || null;
			},
			blockImageData(item, block) {
				const fileId = block.file_id;
				const encodedImages = block.b64_encoded_image;
				if (fileId && encodedImages?.[fileId]) return `data:image/png;base64,${encodedImages[fileId]}`;
				if (!fileId) return null;
				const fileName = this.fileName(item, fileId);
				const extension = fileName?.split(".").pop()?.toLowerCase();
				if (!fileName || ![
					"png",
					"jpeg",
					"jpg"
				].includes(extension)) return null;
				const apiBase = new URL(`${sdk.api.baseUrl.replace(/\/+$/, "")}/`, window.location.origin);
				return new URL(`files/${encodeURIComponent(fileId)}/${encodeURIComponent(fileName)}`, apiBase).href;
			},
			shortenName(name, head = 10, tail = 6) {
				if (!name || name.length <= head + tail + 1) return name;
				return `${name.slice(0, head)}…${name.slice(-tail)}`;
			},
			formatDate(date) {
				if (!date) return "—";
				return String(date).replace("T", " ").slice(0, 16);
			},
			formatReferences(references) {
				if (!Array.isArray(references) || !references.length) return "—";
				return references.map((reference) => reference.display_name || reference.name || reference.collection_id || reference.refcode || reference.item_id).filter(Boolean).join(", ") || "—";
			}
		}
	};
	var _hoisted_1 = { class: "datalab-tool-item-comparison comparison-page px-3 px-xl-5 py-3" };
	var _hoisted_2 = { class: "comparison-page-header mb-4" };
	var _hoisted_3 = { class: "comparison-title" };
	var _hoisted_4 = {
		key: 0,
		class: "badge badge-pill badge-secondary"
	};
	var _hoisted_5 = { class: "comparison-item-select" };
	var _hoisted_6 = {
		key: 0,
		class: "alert alert-warning"
	};
	var _hoisted_7 = {
		key: 1,
		class: "alert alert-warning"
	};
	var _hoisted_8 = {
		key: 2,
		class: "alert alert-warning"
	};
	var _hoisted_9 = { class: "mb-0" };
	var _hoisted_10 = ["aria-label", "onClick"];
	var _hoisted_11 = {
		key: 3,
		class: "comparison-loading text-center text-muted py-5",
		role: "status"
	};
	var _hoisted_12 = {
		key: 4,
		class: "comparison-empty text-center py-5"
	};
	var _hoisted_13 = { class: "comparison-card mb-4" };
	var _hoisted_14 = { class: "comparison-card-header" };
	var _hoisted_15 = { class: "comparison-metadata-controls" };
	var _hoisted_16 = {
		key: 0,
		class: "comparison-pager"
	};
	var _hoisted_17 = ["disabled"];
	var _hoisted_18 = { class: "text-muted" };
	var _hoisted_19 = ["disabled"];
	var _hoisted_20 = {
		class: "btn-group btn-group-sm",
		role: "group",
		"aria-label": "Metadata fields"
	};
	var _hoisted_21 = {
		key: 0,
		class: "comparison-diff-count"
	};
	var _hoisted_22 = { class: "table-responsive" };
	var _hoisted_23 = { class: "table comparison-table mb-0" };
	var _hoisted_24 = { class: "comparison-item-heading" };
	var _hoisted_25 = ["aria-label", "onClick"];
	var _hoisted_26 = { class: "comparison-field-column" };
	var _hoisted_27 = { key: 0 };
	var _hoisted_28 = ["colspan"];
	var _hoisted_29 = { class: "comparison-card comparison-sticky-card mb-4" };
	var _hoisted_30 = { class: "comparison-card-header comparison-block-header comparison-sticky-header" };
	var _hoisted_31 = { class: "comparison-block-header-row" };
	var _hoisted_32 = {
		key: 0,
		class: "btn-group btn-group-sm",
		role: "group"
	};
	var _hoisted_33 = ["disabled", "title"];
	var _hoisted_34 = {
		key: 0,
		class: "comparison-type-pills mt-2"
	};
	var _hoisted_35 = ["title", "onClick"];
	var _hoisted_36 = { class: "comparison-pill-count" };
	var _hoisted_37 = { class: "comparison-card-body" };
	var _hoisted_38 = {
		key: 0,
		class: "text-muted text-center py-4"
	};
	var _hoisted_39 = {
		key: 0,
		class: "comparison-block-toggles"
	};
	var _hoisted_40 = ["title", "onClick"];
	var _hoisted_41 = {
		key: 0,
		class: "comparison-chip-detail"
	};
	var _hoisted_42 = { key: 1 };
	var _hoisted_43 = {
		key: 0,
		class: "text-muted text-center py-4"
	};
	var _hoisted_44 = { class: "comparison-block-cell-title" };
	var _hoisted_45 = ["title"];
	var _hoisted_46 = {
		key: 0,
		class: "alert alert-danger small mb-0"
	};
	var _hoisted_47 = { class: "mb-2" };
	var _hoisted_48 = ["onClick"];
	var _hoisted_49 = {
		key: 1,
		class: "text-muted text-center py-4",
		role: "status"
	};
	var _hoisted_50 = ["src", "alt"];
	var _hoisted_51 = {
		key: 4,
		class: "comparison-comment"
	};
	var _hoisted_52 = {
		key: 5,
		class: "text-muted small py-3 text-center"
	};
	var _hoisted_53 = { key: 2 };
	var _hoisted_54 = {
		key: 0,
		class: "alert alert-info mb-0"
	};
	var _hoisted_55 = {
		key: 1,
		class: "alert alert-danger mb-0"
	};
	var _hoisted_56 = {
		key: 2,
		class: "text-muted text-center py-4",
		role: "status"
	};
	var _hoisted_57 = {
		key: 3,
		class: "comparison-overlay"
	};
	function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
		const _component_ItemSelect = (0, vue.resolveComponent)("ItemSelect");
		const _component_FormattedItemName = (0, vue.resolveComponent)("FormattedItemName");
		const _component_ChemicalFormula = (0, vue.resolveComponent)("ChemicalFormula");
		const _component_BokehPlot = (0, vue.resolveComponent)("BokehPlot");
		return (0, vue.openBlock)(), (0, vue.createElementBlock)("section", _hoisted_1, [
			(0, vue.createElementVNode)("header", _hoisted_2, [(0, vue.createElementVNode)("div", _hoisted_3, [_cache[10] || (_cache[10] = (0, vue.createElementVNode)("h1", { class: "h3 mb-0" }, "Item comparison", -1)), $options.items.length ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("span", _hoisted_4, (0, vue.toDisplayString)($options.items.length), 1)) : (0, vue.createCommentVNode)("", true)]), (0, vue.createElementVNode)("div", _hoisted_5, [(0, vue.createVNode)(_component_ItemSelect, {
				modelValue: $data.itemToAdd,
				"onUpdate:modelValue": [_cache[0] || (_cache[0] = ($event) => $data.itemToAdd = $event), $options.onAddItem],
				"types-to-query": $data.itemTypes,
				placeholder: "Add an item to compare..."
			}, null, 8, [
				"modelValue",
				"types-to-query",
				"onUpdate:modelValue"
			])])]),
			$options.requestedItemRefcodes.length > $data.maxItems ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_6, " A comparison can contain at most " + (0, vue.toDisplayString)($data.maxItems) + " items. Only the first " + (0, vue.toDisplayString)($data.maxItems) + " refcodes in this link are shown. ", 1)) : (0, vue.createCommentVNode)("", true),
			$data.capabilitiesError ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_7, " Block names and overlay availability could not be loaded. Side-by-side previews remain available. ")) : (0, vue.createCommentVNode)("", true),
			$options.loadFailures.length ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_8, [_cache[11] || (_cache[11] = (0, vue.createElementVNode)("p", { class: "mb-1" }, "Some requested items could not be loaded:", -1)), (0, vue.createElementVNode)("ul", _hoisted_9, [((0, vue.openBlock)(true), (0, vue.createElementBlock)(vue.Fragment, null, (0, vue.renderList)($options.loadFailures, (failure) => {
				return (0, vue.openBlock)(), (0, vue.createElementBlock)("li", { key: failure.id }, [
					(0, vue.createElementVNode)("code", null, (0, vue.toDisplayString)(failure.id), 1),
					(0, vue.createTextVNode)(": " + (0, vue.toDisplayString)(failure.message) + " ", 1),
					(0, vue.createElementVNode)("button", {
						type: "button",
						class: "btn btn-link btn-sm py-0",
						"aria-label": `Remove ${failure.id} from comparison`,
						onClick: ($event) => $options.removeItem(failure.id)
					}, " Remove ", 8, _hoisted_10)
				]);
			}), 128))])])) : (0, vue.createCommentVNode)("", true),
			$data.loading ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_11, [..._cache[12] || (_cache[12] = [(0, vue.createElementVNode)("span", {
				class: "spinner-border text-primary mb-3",
				"aria-hidden": "true"
			}, null, -1), (0, vue.createElementVNode)("p", { class: "mb-0" }, "Loading items...", -1)])])) : $options.items.length < 1 ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_12, [..._cache[13] || (_cache[13] = [
				(0, vue.createElementVNode)("div", {
					class: "comparison-empty-icon",
					"aria-hidden": "true"
				}, "▦", -1),
				(0, vue.createElementVNode)("h2", { class: "h5" }, "Nothing to compare yet", -1),
				(0, vue.createElementVNode)("p", { class: "text-muted mb-0" }, " Use the search box above to add items. Their refcodes will remain in the page URL, so the comparison can be bookmarked or shared with another authorized user. ", -1)
			])])) : ((0, vue.openBlock)(), (0, vue.createElementBlock)(vue.Fragment, { key: 5 }, [(0, vue.createElementVNode)("section", _hoisted_13, [(0, vue.createElementVNode)("header", _hoisted_14, [
				(0, vue.createElementVNode)("button", {
					type: "button",
					class: "comparison-collapse-toggle",
					title: "Collapse metadata",
					onClick: _cache[1] || (_cache[1] = ($event) => $data.metadataCollapsed = !$data.metadataCollapsed)
				}, [(0, vue.createElementVNode)("span", {
					class: (0, vue.normalizeClass)(["comparison-collapse-caret", { collapsed: $data.metadataCollapsed }]),
					"aria-hidden": "true"
				}, " ▾ ", 2)]),
				_cache[15] || (_cache[15] = (0, vue.createElementVNode)("span", { class: "mr-auto" }, "Metadata", -1)),
				(0, vue.createElementVNode)("div", _hoisted_15, [$options.totalPages > 1 ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_16, [
					(0, vue.createElementVNode)("button", {
						type: "button",
						class: "comparison-pager-button",
						"aria-label": "Previous items",
						disabled: $data.metadataPage === 0,
						onClick: _cache[2] || (_cache[2] = ($event) => $data.metadataPage--)
					}, " ‹ ", 8, _hoisted_17),
					(0, vue.createElementVNode)("span", _hoisted_18, (0, vue.toDisplayString)($options.pageStart) + "–" + (0, vue.toDisplayString)($options.pageEnd) + " of " + (0, vue.toDisplayString)($options.items.length), 1),
					(0, vue.createElementVNode)("button", {
						type: "button",
						class: "comparison-pager-button",
						"aria-label": "Next items",
						disabled: $data.metadataPage >= $options.totalPages - 1,
						onClick: _cache[3] || (_cache[3] = ($event) => $data.metadataPage++)
					}, " › ", 8, _hoisted_19)
				])) : (0, vue.createCommentVNode)("", true), (0, vue.createElementVNode)("div", _hoisted_20, [(0, vue.createElementVNode)("button", {
					type: "button",
					class: (0, vue.normalizeClass)(["btn", $data.showDiffOnly ? "btn-primary" : "btn-outline-secondary"]),
					onClick: _cache[4] || (_cache[4] = ($event) => $data.showDiffOnly = true)
				}, [_cache[14] || (_cache[14] = (0, vue.createTextVNode)(" Differences ", -1)), $options.hiddenIdenticalCount ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("span", _hoisted_21, (0, vue.toDisplayString)($options.displayedMetadataRows.length), 1)) : (0, vue.createCommentVNode)("", true)], 2), (0, vue.createElementVNode)("button", {
					type: "button",
					class: (0, vue.normalizeClass)(["btn", $data.showDiffOnly ? "btn-outline-secondary" : "btn-primary"]),
					onClick: _cache[5] || (_cache[5] = ($event) => $data.showDiffOnly = false)
				}, " All fields ", 2)])])
			]), (0, vue.withDirectives)((0, vue.createElementVNode)("div", _hoisted_22, [(0, vue.createElementVNode)("table", _hoisted_23, [(0, vue.createElementVNode)("thead", null, [(0, vue.createElementVNode)("tr", null, [_cache[16] || (_cache[16] = (0, vue.createElementVNode)("th", { class: "comparison-field-column" }, "Field", -1)), ((0, vue.openBlock)(true), (0, vue.createElementBlock)(vue.Fragment, null, (0, vue.renderList)($options.pagedItems, (entry) => {
				return (0, vue.openBlock)(), (0, vue.createElementBlock)("th", {
					key: entry.item.item_id,
					class: "comparison-item-column",
					style: (0, vue.normalizeStyle)({ borderTopColor: $options.sampleColor(entry.index) })
				}, [(0, vue.createElementVNode)("div", _hoisted_24, [
					(0, vue.createElementVNode)("span", {
						class: "comparison-sample-dot",
						style: (0, vue.normalizeStyle)({ backgroundColor: $options.sampleColor(entry.index) })
					}, null, 4),
					(0, vue.createVNode)(_component_FormattedItemName, {
						item_id: entry.item.item_id,
						"item-type": entry.item.type || "samples",
						name: entry.item.name,
						"enable-click": "",
						"enable-modified-click": ""
					}, null, 8, [
						"item_id",
						"item-type",
						"name"
					]),
					(0, vue.createElementVNode)("button", {
						type: "button",
						class: "comparison-remove-button",
						title: "Remove from comparison",
						"aria-label": `Remove ${entry.item.name || entry.item.item_id}`,
						onClick: ($event) => $options.removeItem(entry.item.refcode)
					}, " × ", 8, _hoisted_25)
				])], 4);
			}), 128))])]), (0, vue.createElementVNode)("tbody", null, [((0, vue.openBlock)(true), (0, vue.createElementBlock)(vue.Fragment, null, (0, vue.renderList)($options.displayedMetadataRows, (field) => {
				return (0, vue.openBlock)(), (0, vue.createElementBlock)("tr", {
					key: field.key,
					class: (0, vue.normalizeClass)({ "comparison-row-differs": !$data.showDiffOnly && $options.fieldDiffers(field) })
				}, [(0, vue.createElementVNode)("th", _hoisted_26, (0, vue.toDisplayString)(field.label), 1), ((0, vue.openBlock)(true), (0, vue.createElementBlock)(vue.Fragment, null, (0, vue.renderList)($options.pagedItems, (entry) => {
					return (0, vue.openBlock)(), (0, vue.createElementBlock)("td", { key: entry.item.item_id }, [field.key === "chemform" && entry.item.chemform ? ((0, vue.openBlock)(), (0, vue.createBlock)(_component_ChemicalFormula, {
						key: 0,
						formula: entry.item.chemform
					}, null, 8, ["formula"])) : ((0, vue.openBlock)(), (0, vue.createElementBlock)("span", {
						key: 1,
						class: (0, vue.normalizeClass)({ "text-muted": field.render(entry.item) === "—" })
					}, (0, vue.toDisplayString)(field.render(entry.item)), 3))]);
				}), 128))], 2);
			}), 128)), !$options.displayedMetadataRows.length ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("tr", _hoisted_27, [(0, vue.createElementVNode)("td", {
				colspan: $options.pagedItems.length + 1,
				class: "text-muted text-center py-3"
			}, [_cache[17] || (_cache[17] = (0, vue.createTextVNode)(" These items share the same displayed metadata. ", -1)), (0, vue.createElementVNode)("button", {
				type: "button",
				class: "btn btn-link btn-sm p-0",
				onClick: _cache[6] || (_cache[6] = ($event) => $data.showDiffOnly = false)
			}, " Show all fields ")], 8, _hoisted_28)])) : (0, vue.createCommentVNode)("", true)])])], 512), [[vue.vShow, !$data.metadataCollapsed]])]), (0, vue.createElementVNode)("section", _hoisted_29, [(0, vue.createElementVNode)("header", _hoisted_30, [(0, vue.createElementVNode)("div", _hoisted_31, [
				(0, vue.createElementVNode)("button", {
					type: "button",
					class: "comparison-collapse-toggle",
					title: "Collapse block comparison",
					onClick: _cache[7] || (_cache[7] = ($event) => $data.blocksCollapsed = !$data.blocksCollapsed)
				}, [(0, vue.createElementVNode)("span", {
					class: (0, vue.normalizeClass)(["comparison-collapse-caret", { collapsed: $data.blocksCollapsed }]),
					"aria-hidden": "true"
				}, " ▾ ", 2)]),
				_cache[18] || (_cache[18] = (0, vue.createElementVNode)("span", { class: "mr-auto" }, "Block comparison", -1)),
				$data.selectedBlockType && !$data.blocksCollapsed ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_32, [(0, vue.createElementVNode)("button", {
					type: "button",
					class: (0, vue.normalizeClass)(["btn", $data.mode === "side-by-side" ? "btn-primary" : "btn-outline-secondary"]),
					onClick: _cache[8] || (_cache[8] = ($event) => $data.mode = "side-by-side")
				}, " Side by side ", 2), (0, vue.createElementVNode)("button", {
					type: "button",
					class: (0, vue.normalizeClass)(["btn", $data.mode === "overlay" ? "btn-primary" : "btn-outline-secondary"]),
					disabled: !$options.overlaySupported,
					title: $options.overlaySupported ? "" : "Overlay is not supported for this block type",
					onClick: _cache[9] || (_cache[9] = (...args) => $options.setOverlayMode && $options.setOverlayMode(...args))
				}, " Overlay ", 10, _hoisted_33)])) : (0, vue.createCommentVNode)("", true)
			]), $options.blockTypeStats.length && !$data.blocksCollapsed ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_34, [((0, vue.openBlock)(true), (0, vue.createElementBlock)(vue.Fragment, null, (0, vue.renderList)($options.blockTypeStats, (blockType) => {
				return (0, vue.openBlock)(), (0, vue.createElementBlock)("button", {
					key: blockType.id,
					type: "button",
					class: (0, vue.normalizeClass)(["comparison-type-pill", {
						active: blockType.id === $data.selectedBlockType,
						partial: blockType.partial
					}]),
					title: $options.blockTypeTitle(blockType),
					onClick: ($event) => $data.selectedBlockType = blockType.id
				}, [(0, vue.createTextVNode)((0, vue.toDisplayString)(blockType.name) + " ", 1), (0, vue.createElementVNode)("span", _hoisted_36, (0, vue.toDisplayString)(blockType.blockCount), 1)], 10, _hoisted_35);
			}), 128))])) : (0, vue.createCommentVNode)("", true)]), (0, vue.withDirectives)((0, vue.createElementVNode)("div", _hoisted_37, [!$options.blockTypeStats.length ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_38, " None of the selected items contain data blocks. ")) : ((0, vue.openBlock)(), (0, vue.createElementBlock)(vue.Fragment, { key: 1 }, [$options.matchingBlocks.length > 1 ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_39, [_cache[19] || (_cache[19] = (0, vue.createElementVNode)("span", { class: "small text-muted" }, "Blocks:", -1)), ((0, vue.openBlock)(true), (0, vue.createElementBlock)(vue.Fragment, null, (0, vue.renderList)($options.matchingBlocks, (entry) => {
				return (0, vue.openBlock)(), (0, vue.createElementBlock)("button", {
					key: entry.key,
					type: "button",
					class: (0, vue.normalizeClass)(["comparison-block-chip", { inactive: !$options.isBlockEnabled(entry.key) }]),
					style: (0, vue.normalizeStyle)($options.isBlockEnabled(entry.key) ? { borderColor: entry.color } : {}),
					title: $options.chipTooltip(entry),
					onClick: ($event) => $options.toggleBlock(entry.key)
				}, [
					(0, vue.createElementVNode)("span", {
						class: "comparison-sample-dot",
						style: (0, vue.normalizeStyle)({ backgroundColor: entry.color })
					}, null, 4),
					(0, vue.createTextVNode)(" " + (0, vue.toDisplayString)(entry.chipLabel) + " ", 1),
					entry.distinguisher ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("span", _hoisted_41, (0, vue.toDisplayString)(entry.distinguisher), 1)) : (0, vue.createCommentVNode)("", true)
				], 14, _hoisted_40);
			}), 128))])) : (0, vue.createCommentVNode)("", true), $data.mode === "side-by-side" ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_42, [!$options.activeBlocks.length ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_43, " Enable at least one block above. ")) : ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", {
				key: 1,
				class: "comparison-block-grid",
				style: (0, vue.normalizeStyle)($options.gridStyle)
			}, [((0, vue.openBlock)(true), (0, vue.createElementBlock)(vue.Fragment, null, (0, vue.renderList)($options.activeBlocks, (entry) => {
				return (0, vue.openBlock)(), (0, vue.createElementBlock)("article", {
					key: entry.key,
					class: "comparison-block-cell",
					style: (0, vue.normalizeStyle)({ borderTopColor: entry.color })
				}, [(0, vue.createElementVNode)("header", _hoisted_44, [
					(0, vue.createElementVNode)("span", {
						class: "comparison-sample-dot",
						style: (0, vue.normalizeStyle)({ backgroundColor: entry.color })
					}, null, 4),
					(0, vue.createVNode)(_component_FormattedItemName, {
						item_id: entry.itemId,
						"item-type": entry.itemType,
						name: entry.itemName,
						"enable-click": "",
						"enable-modified-click": ""
					}, null, 8, [
						"item_id",
						"item-type",
						"name"
					]),
					entry.distinguisher ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("span", {
						key: 0,
						class: "comparison-file-label text-muted small",
						title: entry.fileTooltip
					}, " · " + (0, vue.toDisplayString)(entry.distinguisher), 9, _hoisted_45)) : (0, vue.createCommentVNode)("", true)
				]), entry.error ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_46, [(0, vue.createElementVNode)("p", _hoisted_47, (0, vue.toDisplayString)(entry.error), 1), (0, vue.createElementVNode)("button", {
					type: "button",
					class: "btn btn-outline-danger btn-sm",
					onClick: ($event) => $options.retryPreview(entry.key)
				}, " Retry ", 8, _hoisted_48)])) : entry.loading ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_49, [..._cache[20] || (_cache[20] = [(0, vue.createElementVNode)("span", {
					class: "spinner-border spinner-border-sm mr-2",
					"aria-hidden": "true"
				}, null, -1), (0, vue.createTextVNode)(" Generating preview... ", -1)])])) : entry.bokehPlotData ? ((0, vue.openBlock)(), (0, vue.createBlock)(_component_BokehPlot, {
					key: 2,
					"bokeh-plot-data": entry.bokehPlotData
				}, null, 8, ["bokeh-plot-data"])) : entry.imageData ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("img", {
					key: 3,
					src: entry.imageData,
					alt: entry.fileLabel || "Block media",
					class: "comparison-media"
				}, null, 8, _hoisted_50)) : entry.comment ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_51, (0, vue.toDisplayString)(entry.comment), 1)) : ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_52, " No preview is available for this block type. "))], 4);
			}), 128))], 4))])) : ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_53, [!$options.overlaySupported ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_54, " Overlay is not supported for " + (0, vue.toDisplayString)($options.blockTypeName($data.selectedBlockType)) + " blocks. Use side-by-side mode instead. ", 1)) : $data.overlayError ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_55, (0, vue.toDisplayString)($data.overlayError), 1)) : $data.overlayLoading ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_56, [..._cache[21] || (_cache[21] = [(0, vue.createElementVNode)("span", {
				class: "spinner-border spinner-border-sm mr-2",
				"aria-hidden": "true"
			}, null, -1), (0, vue.createTextVNode)(" Building overlay... ", -1)])])) : $data.overlayPlotData ? ((0, vue.openBlock)(), (0, vue.createElementBlock)("div", _hoisted_57, [(0, vue.createVNode)(_component_BokehPlot, { "bokeh-plot-data": $data.overlayPlotData }, null, 8, ["bokeh-plot-data"])])) : (0, vue.createCommentVNode)("", true)]))], 64))], 512), [[vue.vShow, !$data.blocksCollapsed]])])], 64))
		]);
	}
	var ToolView_default = /*#__PURE__*/ _plugin_vue_export_helper_default(_sfc_main, [["render", _sfc_render]]);
	//#endregion
	//#region src/tool.css?inline
	var tool_default = ".datalab-tool-item-comparison.comparison-page {\n  max-width: 1800px;\n  margin: 0 auto;\n}\n\n.datalab-tool-item-comparison .comparison-page-header {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 1rem;\n}\n\n.datalab-tool-item-comparison .comparison-title {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n}\n\n.datalab-tool-item-comparison .comparison-item-select {\n  width: min(28rem, 100%);\n  min-width: 24rem;\n}\n\n.datalab-tool-item-comparison .comparison-loading {\n  min-height: 12rem;\n}\n\n.datalab-tool-item-comparison .comparison-empty {\n  border: 1px dashed #d0d5da;\n  border-radius: 0.5rem;\n  background: #fafbfc;\n}\n\n.datalab-tool-item-comparison .comparison-empty-icon {\n  margin-bottom: 0.75rem;\n  color: #6c757d;\n  font-size: 3rem;\n  line-height: 1;\n}\n\n.datalab-tool-item-comparison .comparison-card {\n  overflow: hidden;\n  border: 1px solid #e7eaee;\n  border-radius: 0.5rem;\n  background: #fff;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);\n}\n\n.datalab-tool-item-comparison .comparison-card.comparison-sticky-card {\n  overflow: visible;\n}\n\n.datalab-tool-item-comparison .comparison-card-header {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  padding: 0.6rem 1rem;\n  border-top-left-radius: 0.5rem;\n  border-top-right-radius: 0.5rem;\n  border-bottom: 1px solid #e7eaee;\n  background: #f7f9fa;\n  font-weight: 600;\n}\n\n.datalab-tool-item-comparison .comparison-block-header {\n  display: block;\n}\n\n.datalab-tool-item-comparison .comparison-block-header-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n}\n\n.datalab-tool-item-comparison .comparison-sticky-header {\n  position: sticky;\n  z-index: 20;\n  top: 0;\n}\n\n.datalab-tool-item-comparison .comparison-card-body {\n  padding: 1rem;\n}\n\n.datalab-tool-item-comparison .comparison-collapse-toggle {\n  padding: 0 0.5rem 0 0;\n  border: 0;\n  background: transparent;\n  color: #55606a;\n  cursor: pointer;\n}\n\n.datalab-tool-item-comparison .comparison-collapse-caret {\n  display: inline-block;\n  transition: transform 0.15s ease;\n}\n\n.datalab-tool-item-comparison .comparison-collapse-caret.collapsed {\n  transform: rotate(-90deg);\n}\n\n.datalab-tool-item-comparison .comparison-metadata-controls {\n  display: flex;\n  align-items: center;\n  gap: 1rem;\n  font-size: 0.875rem;\n  font-weight: 400;\n}\n\n.datalab-tool-item-comparison .comparison-type-pills {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.4rem;\n}\n\n.datalab-tool-item-comparison .comparison-type-pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.35rem;\n  padding: 0.2rem 0.7rem;\n  border: 1px solid #c8ced3;\n  border-radius: 1rem;\n  background: #fff;\n  color: #2c3e50;\n  font-size: 0.85rem;\n  font-weight: 500;\n  cursor: pointer;\n}\n\n.datalab-tool-item-comparison .comparison-type-pill.active {\n  border-color: #007bff;\n  background: #007bff;\n  color: #fff;\n}\n\n.datalab-tool-item-comparison .comparison-type-pill.partial:not(.active) {\n  border-style: dashed;\n  opacity: 0.6;\n}\n\n.datalab-tool-item-comparison .comparison-pill-count {\n  padding: 0 0.4rem;\n  border-radius: 0.7rem;\n  background: rgba(0, 0, 0, 0.08);\n  font-size: 0.7rem;\n}\n\n.datalab-tool-item-comparison .comparison-type-pill.active .comparison-pill-count {\n  background: rgba(255, 255, 255, 0.25);\n}\n\n.datalab-tool-item-comparison .comparison-diff-count {\n  display: inline-block;\n  padding: 0.15rem 0.4rem;\n  margin-left: 0.3rem;\n  border-radius: 0.7rem;\n  background: rgba(255, 255, 255, 0.25);\n  font-size: 0.7rem;\n  line-height: 1;\n}\n\n.datalab-tool-item-comparison .btn-outline-secondary .comparison-diff-count {\n  background: rgba(0, 0, 0, 0.08);\n}\n\n.datalab-tool-item-comparison .comparison-table {\n  width: 100%;\n  margin-bottom: 0;\n  table-layout: fixed;\n}\n\n.datalab-tool-item-comparison .comparison-table td,\n.datalab-tool-item-comparison .comparison-table th {\n  padding: 0.3rem 0.6rem;\n  overflow-wrap: anywhere;\n  border-color: #eef1f3;\n  vertical-align: top;\n}\n\n.datalab-tool-item-comparison .comparison-table tbody tr:nth-child(odd) td,\n.datalab-tool-item-comparison .comparison-table tbody tr:nth-child(odd) .comparison-field-column {\n  background-color: #fcfcfd;\n}\n\n.datalab-tool-item-comparison .comparison-table tbody tr.comparison-row-differs td {\n  background-color: #fff8e1;\n}\n\n.datalab-tool-item-comparison\n  .comparison-table\n  tbody\n  tr.comparison-row-differs\n  .comparison-field-column {\n  background-color: #fff3cd;\n  box-shadow: inset 3px 0 0 #f0ad4e;\n}\n\n.datalab-tool-item-comparison .comparison-field-column {\n  width: 11rem;\n  background-color: #f7f9fa;\n  color: #55606a;\n  font-weight: 600;\n  white-space: nowrap;\n}\n\n.datalab-tool-item-comparison .comparison-table thead .comparison-item-column {\n  border-top: 3px solid transparent;\n  background: #fff;\n}\n\n.datalab-tool-item-comparison .comparison-item-heading {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.datalab-tool-item-comparison .comparison-item-heading > :nth-child(2) {\n  min-width: 0;\n  margin-right: auto;\n}\n\n.datalab-tool-item-comparison .comparison-pager {\n  display: flex;\n  align-items: center;\n  white-space: nowrap;\n}\n\n.datalab-tool-item-comparison .comparison-pager-button {\n  padding: 0 0.35rem;\n  border: 0;\n  background: transparent;\n  color: #007bff;\n  font-size: 1.3rem;\n  line-height: 1;\n  cursor: pointer;\n}\n\n.datalab-tool-item-comparison .comparison-pager-button:disabled {\n  color: #c8ced3;\n  cursor: default;\n}\n\n.datalab-tool-item-comparison .comparison-sample-dot {\n  display: inline-block;\n  flex: 0 0 auto;\n  width: 0.65rem;\n  height: 0.65rem;\n  margin-right: 0.4rem;\n  border-radius: 50%;\n}\n\n.datalab-tool-item-comparison .comparison-remove-button {\n  padding: 0;\n  margin-left: 0.5rem;\n  border: 0;\n  background: transparent;\n  color: #6c757d;\n  font-size: 1.2rem;\n  line-height: 1;\n  opacity: 0.5;\n  cursor: pointer;\n}\n\n.datalab-tool-item-comparison .comparison-remove-button:hover {\n  opacity: 1;\n}\n\n.datalab-tool-item-comparison .comparison-block-toggles {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 0.4rem;\n  padding-bottom: 0.75rem;\n  margin-bottom: 1rem;\n  border-bottom: 1px solid #eef1f3;\n}\n\n.datalab-tool-item-comparison .comparison-block-chip {\n  display: inline-flex;\n  align-items: center;\n  padding: 0.2rem 0.6rem;\n  border: 1px solid #c8ced3;\n  border-radius: 1rem;\n  background: #fff;\n  color: #2c3e50;\n  font-size: 0.85rem;\n  cursor: pointer;\n}\n\n.datalab-tool-item-comparison .comparison-block-chip.inactive {\n  border-style: dashed;\n  text-decoration: line-through;\n  opacity: 0.45;\n}\n\n.datalab-tool-item-comparison .comparison-block-chip.inactive .comparison-sample-dot {\n  filter: grayscale(1);\n}\n\n.datalab-tool-item-comparison .comparison-chip-detail {\n  max-width: 9rem;\n  margin-left: 0.35rem;\n  overflow: hidden;\n  color: #6c757d;\n  font-size: 0.75rem;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.datalab-tool-item-comparison .comparison-file-label {\n  display: inline-block;\n  max-width: 14rem;\n  margin-left: 0.5rem;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  vertical-align: bottom;\n  white-space: nowrap;\n}\n\n.datalab-tool-item-comparison .comparison-block-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 1.25rem;\n}\n\n.datalab-tool-item-comparison .comparison-block-cell {\n  min-width: 0;\n  padding: 0.75rem;\n  border: 1px solid #e7eaee;\n  border-top: 3px solid #ccc;\n  border-radius: 0.35rem;\n  background: #fff;\n}\n\n.datalab-tool-item-comparison .comparison-block-cell-title {\n  display: flex;\n  align-items: center;\n  margin-bottom: 0.5rem;\n}\n\n.datalab-tool-item-comparison .comparison-media {\n  display: block;\n  max-width: 100%;\n  max-height: 360px;\n  margin: 0 auto;\n  object-fit: contain;\n}\n\n.datalab-tool-item-comparison .comparison-comment {\n  color: #2c3e50;\n  font-size: 0.9rem;\n  white-space: pre-wrap;\n}\n\n.datalab-tool-item-comparison .comparison-overlay {\n  max-width: 1100px;\n  margin: 0 auto;\n}\n\n@media (max-width: 900px) {\n  .datalab-tool-item-comparison .comparison-item-select {\n    width: 100%;\n    min-width: 0;\n  }\n\n  .datalab-tool-item-comparison .comparison-metadata-controls {\n    width: 100%;\n    align-items: flex-start;\n    justify-content: space-between;\n    margin-top: 0.5rem;\n  }\n\n  .datalab-tool-item-comparison .comparison-block-grid {\n    grid-template-columns: minmax(0, 1fr) !important;\n  }\n}\n";
	//#endregion
	//#region src/main.js
	var styleId = `datalab-tool-item-comparison-styles`;
	if (!document.getElementById(styleId)) {
		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = tool_default;
		document.head.appendChild(style);
	}
	window.datalabToolSdk.register(ToolView_default);
	//#endregion
})(window.datalabToolSdk.runtime);
