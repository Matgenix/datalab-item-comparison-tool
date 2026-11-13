<template>
  <section class="datalab-tool-item-comparison comparison-page px-3 px-xl-5 py-3">
    <header class="comparison-page-header mb-4">
      <div class="comparison-title">
        <h1 class="h3 mb-0">
          Item comparison
        </h1>
        <span
          v-if="items.length"
          class="badge badge-pill badge-secondary"
        >
          {{ items.length }}
        </span>
      </div>
      <div class="comparison-item-select">
        <ItemSelect
          v-model="itemToAdd"
          :types-to-query="itemTypes"
          placeholder="Add an item to compare..."
          @update:model-value="onAddItem"
        />
      </div>
    </header>

    <div
      v-if="requestedItemRefcodes.length > maxItems"
      class="alert alert-warning"
    >
      A comparison can contain at most {{ maxItems }} items. Only the first {{ maxItems }} refcodes
      in this link are shown.
    </div>

    <div
      v-if="capabilitiesError"
      class="alert alert-warning"
    >
      Block names and overlay availability could not be loaded. Side-by-side previews remain
      available.
    </div>

    <div
      v-if="loadFailures.length"
      class="alert alert-warning"
    >
      <p class="mb-1">
        Some requested items could not be loaded:
      </p>
      <ul class="mb-0">
        <li
          v-for="failure in loadFailures"
          :key="failure.id"
        >
          <code>{{ failure.id }}</code>: {{ failure.message }}
          <button
            type="button"
            class="btn btn-link btn-sm py-0"
            :aria-label="`Remove ${failure.id} from comparison`"
            @click="removeItem(failure.id)"
          >
            Remove
          </button>
        </li>
      </ul>
    </div>

    <div
      v-if="loading"
      class="comparison-loading text-center text-muted py-5"
      role="status"
    >
      <span
        class="spinner-border text-primary mb-3"
        aria-hidden="true"
      />
      <p class="mb-0">
        Loading items...
      </p>
    </div>

    <div
      v-else-if="items.length < 1"
      class="comparison-empty text-center py-5"
    >
      <div
        class="comparison-empty-icon"
        aria-hidden="true"
      >
        ▦
      </div>
      <h2 class="h5">
        Nothing to compare yet
      </h2>
      <p class="text-muted mb-0">
        Use the search box above to add items. Their refcodes will remain in the page URL, so the
        comparison can be bookmarked or shared with another authorized user.
      </p>
    </div>

    <template v-else>
      <section class="comparison-card mb-4">
        <header class="comparison-card-header">
          <button
            type="button"
            class="comparison-collapse-toggle"
            title="Collapse metadata"
            @click="metadataCollapsed = !metadataCollapsed"
          >
            <span
              class="comparison-collapse-caret"
              :class="{ collapsed: metadataCollapsed }"
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
          <span class="mr-auto">Metadata</span>
          <div class="comparison-metadata-controls">
            <div
              v-if="totalPages > 1"
              class="comparison-pager"
            >
              <button
                type="button"
                class="comparison-pager-button"
                aria-label="Previous items"
                :disabled="metadataPage === 0"
                @click="metadataPage--"
              >
                ‹
              </button>
              <span class="text-muted"> {{ pageStart }}–{{ pageEnd }} of {{ items.length }} </span>
              <button
                type="button"
                class="comparison-pager-button"
                aria-label="Next items"
                :disabled="metadataPage >= totalPages - 1"
                @click="metadataPage++"
              >
                ›
              </button>
            </div>
            <div
              class="btn-group btn-group-sm"
              role="group"
              aria-label="Metadata fields"
            >
              <button
                type="button"
                class="btn"
                :class="showDiffOnly ? 'btn-primary' : 'btn-outline-secondary'"
                @click="showDiffOnly = true"
              >
                Differences
                <span
                  v-if="hiddenIdenticalCount"
                  class="comparison-diff-count"
                >
                  {{ displayedMetadataRows.length }}
                </span>
              </button>
              <button
                type="button"
                class="btn"
                :class="showDiffOnly ? 'btn-outline-secondary' : 'btn-primary'"
                @click="showDiffOnly = false"
              >
                All fields
              </button>
            </div>
          </div>
        </header>

        <div
          v-show="!metadataCollapsed"
          class="table-responsive"
        >
          <table class="table comparison-table mb-0">
            <thead>
              <tr>
                <th class="comparison-field-column">
                  Field
                </th>
                <th
                  v-for="entry in pagedItems"
                  :key="entry.item.item_id"
                  class="comparison-item-column"
                  :style="{ borderTopColor: sampleColor(entry.index) }"
                >
                  <div class="comparison-item-heading">
                    <span
                      class="comparison-sample-dot"
                      :style="{ backgroundColor: sampleColor(entry.index) }"
                    />
                    <FormattedItemName
                      :item_id="entry.item.item_id"
                      :item-type="entry.item.type || 'samples'"
                      :name="entry.item.name"
                      enable-click
                      enable-modified-click
                    />
                    <button
                      type="button"
                      class="comparison-remove-button"
                      title="Remove from comparison"
                      :aria-label="`Remove ${entry.item.name || entry.item.item_id}`"
                      @click="removeItem(entry.item.refcode)"
                    >
                      ×
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="field in displayedMetadataRows"
                :key="field.key"
                :class="{ 'comparison-row-differs': !showDiffOnly && fieldDiffers(field) }"
              >
                <th class="comparison-field-column">
                  {{ field.label }}
                </th>
                <td
                  v-for="entry in pagedItems"
                  :key="entry.item.item_id"
                >
                  <ChemicalFormula
                    v-if="field.key === 'chemform' && entry.item.chemform"
                    :formula="entry.item.chemform"
                  />
                  <span
                    v-else
                    :class="{ 'text-muted': field.render(entry.item) === '—' }"
                  >
                    {{ field.render(entry.item) }}
                  </span>
                </td>
              </tr>
              <tr v-if="!displayedMetadataRows.length">
                <td
                  :colspan="pagedItems.length + 1"
                  class="text-muted text-center py-3"
                >
                  These items share the same displayed metadata.
                  <button
                    type="button"
                    class="btn btn-link btn-sm p-0"
                    @click="showDiffOnly = false"
                  >
                    Show all fields
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="comparison-card comparison-sticky-card mb-4">
        <header class="comparison-card-header comparison-block-header comparison-sticky-header">
          <div class="comparison-block-header-row">
            <button
              type="button"
              class="comparison-collapse-toggle"
              title="Collapse block comparison"
              @click="blocksCollapsed = !blocksCollapsed"
            >
              <span
                class="comparison-collapse-caret"
                :class="{ collapsed: blocksCollapsed }"
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
            <span class="mr-auto">Block comparison</span>
            <div
              v-if="selectedBlockType && !blocksCollapsed"
              class="btn-group btn-group-sm"
              role="group"
            >
              <button
                type="button"
                class="btn"
                :class="mode === 'side-by-side' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="mode = 'side-by-side'"
              >
                Side by side
              </button>
              <button
                type="button"
                class="btn"
                :class="mode === 'overlay' ? 'btn-primary' : 'btn-outline-secondary'"
                :disabled="!overlaySupported"
                :title="overlaySupported ? '' : 'Overlay is not supported for this block type'"
                @click="setOverlayMode"
              >
                Overlay
              </button>
            </div>
          </div>

          <div
            v-if="blockTypeStats.length && !blocksCollapsed"
            class="comparison-type-pills mt-2"
          >
            <button
              v-for="blockType in blockTypeStats"
              :key="blockType.id"
              type="button"
              class="comparison-type-pill"
              :class="{
                active: blockType.id === selectedBlockType,
                partial: blockType.partial,
              }"
              :title="blockTypeTitle(blockType)"
              @click="selectedBlockType = blockType.id"
            >
              {{ blockType.name }}
              <span class="comparison-pill-count">{{ blockType.blockCount }}</span>
            </button>
          </div>
        </header>

        <div
          v-show="!blocksCollapsed"
          class="comparison-card-body"
        >
          <div
            v-if="!blockTypeStats.length"
            class="text-muted text-center py-4"
          >
            None of the selected items contain data blocks.
          </div>

          <template v-else>
            <div
              v-if="matchingBlocks.length > 1"
              class="comparison-block-toggles"
            >
              <span class="small text-muted">Blocks:</span>
              <button
                v-for="entry in matchingBlocks"
                :key="entry.key"
                type="button"
                class="comparison-block-chip"
                :class="{ inactive: !isBlockEnabled(entry.key) }"
                :style="isBlockEnabled(entry.key) ? { borderColor: entry.color } : {}"
                :title="chipTooltip(entry)"
                @click="toggleBlock(entry.key)"
              >
                <span
                  class="comparison-sample-dot"
                  :style="{ backgroundColor: entry.color }"
                />
                {{ entry.chipLabel }}
                <span
                  v-if="entry.distinguisher"
                  class="comparison-chip-detail"
                >
                  {{ entry.distinguisher }}
                </span>
              </button>
            </div>

            <div v-if="mode === 'side-by-side'">
              <div
                v-if="!activeBlocks.length"
                class="text-muted text-center py-4"
              >
                Enable at least one block above.
              </div>
              <div
                v-else
                class="comparison-block-grid"
                :style="gridStyle"
              >
                <article
                  v-for="entry in activeBlocks"
                  :key="entry.key"
                  class="comparison-block-cell"
                  :style="{ borderTopColor: entry.color }"
                >
                  <header class="comparison-block-cell-title">
                    <span
                      class="comparison-sample-dot"
                      :style="{ backgroundColor: entry.color }"
                    />
                    <FormattedItemName
                      :item_id="entry.itemId"
                      :item-type="entry.itemType"
                      :name="entry.itemName"
                      enable-click
                      enable-modified-click
                    />
                    <span
                      v-if="entry.distinguisher"
                      class="comparison-file-label text-muted small"
                      :title="entry.fileTooltip"
                    >
                      · {{ entry.distinguisher }}
                    </span>
                  </header>

                  <div
                    v-if="entry.error"
                    class="alert alert-danger small mb-0"
                  >
                    <p class="mb-2">
                      {{ entry.error }}
                    </p>
                    <button
                      type="button"
                      class="btn btn-outline-danger btn-sm"
                      @click="retryPreview(entry.key)"
                    >
                      Retry
                    </button>
                  </div>
                  <div
                    v-else-if="entry.loading"
                    class="text-muted text-center py-4"
                    role="status"
                  >
                    <span
                      class="spinner-border spinner-border-sm mr-2"
                      aria-hidden="true"
                    />
                    Generating preview...
                  </div>
                  <BokehPlot
                    v-else-if="entry.bokehPlotData"
                    :bokeh-plot-data="entry.bokehPlotData"
                  />
                  <img
                    v-else-if="entry.imageData"
                    :src="entry.imageData"
                    :alt="entry.fileLabel || 'Block media'"
                    class="comparison-media"
                  >
                  <div
                    v-else-if="entry.comment"
                    class="comparison-comment"
                  >
                    {{ entry.comment }}
                  </div>
                  <div
                    v-else
                    class="text-muted small py-3 text-center"
                  >
                    No preview is available for this block type.
                  </div>
                </article>
              </div>
            </div>

            <div v-else>
              <div
                v-if="!overlaySupported"
                class="alert alert-info mb-0"
              >
                Overlay is not supported for {{ blockTypeName(selectedBlockType) }} blocks. Use
                side-by-side mode instead.
              </div>
              <div
                v-else-if="overlayError"
                class="alert alert-danger mb-0"
              >
                {{ overlayError }}
              </div>
              <div
                v-else-if="overlayLoading"
                class="text-muted text-center py-4"
                role="status"
              >
                <span
                  class="spinner-border spinner-border-sm mr-2"
                  aria-hidden="true"
                />
                Building overlay...
              </div>
              <div
                v-else-if="overlayPlotData"
                class="comparison-overlay"
              >
                <BokehPlot :bokeh-plot-data="overlayPlotData" />
              </div>
            </div>
          </template>
        </div>
      </section>
    </template>
  </section>
</template>

<script>
const sdk = window.datalabToolSdk;
const { BokehPlot, ChemicalFormula, FormattedItemName, ItemSelect } = sdk.components;

const TOOL_ID = "item-comparison";
const PLUGIN_API = `tools/plugins/${TOOL_ID}`;
const MAX_ITEMS = 20;
const MAX_BLOCKS_PER_REQUEST = 20;
const PAGE_SIZE = 5;
const ITEM_TYPES = ["samples", "starting_materials", "cells"];
const SAMPLE_COLORS = [
  "#1b9e77",
  "#d95f02",
  "#7570b3",
  "#e7298a",
  "#66a61e",
  "#e6ab02",
  "#a6761d",
  "#666666",
];

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected response from datalab.";
}

export default {
  name: "ItemComparisonTool",
  components: {
    BokehPlot,
    ChemicalFormula,
    FormattedItemName,
    ItemSelect,
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
      metadataPage: 0,
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
      return this.itemRefcodes
        .filter((refcode) => this.itemErrors[refcode])
        .map((refcode) => ({ id: refcode, message: this.itemErrors[refcode] }));
    },
    metadataRows() {
      return [
        { label: "Name", key: "name", render: (item) => item.name || "—" },
        { label: "ID", key: "item_id", render: (item) => item.item_id || "—" },
        { label: "Date", key: "date", render: (item) => this.formatDate(item.date) },
        {
          label: "Chemical formula",
          key: "chemform",
          render: (item) => item.chemform || "—",
        },
        {
          label: "Description",
          key: "description",
          render: (item) => item.description || "—",
        },
        {
          label: "Blocks",
          key: "blocks",
          render: (item) => Object.keys(item.blocks_obj || {}).length,
        },
        { label: "Refcode", key: "refcode", render: (item) => item.refcode || "—" },
        { label: "Type", key: "type", render: (item) => item.type || "—" },
        { label: "Status", key: "status", render: (item) => item.status || "—" },
        {
          label: "Creators",
          key: "creators",
          render: (item) => this.formatReferences(item.creators),
        },
        {
          label: "Collections",
          key: "collections",
          render: (item) => this.formatReferences(item.collections),
        },
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
      return this.items
        .slice(start, start + PAGE_SIZE)
        .map((item, index) => ({ item, index: start + index }));
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
        const typesInItem = new Set();
        for (const block of Object.values(item.blocks_obj || {})) {
          if (!block.blocktype) continue;
          stats[block.blocktype] ||= {
            id: block.blocktype,
            blockCount: 0,
            sampleCount: 0,
          };
          stats[block.blocktype].blockCount += 1;
          typesInItem.add(block.blocktype);
        }
        for (const blockType of typesInItem) {
          stats[blockType].sampleCount += 1;
        }
      }
      return Object.values(stats)
        .map((entry) => ({
          ...entry,
          name: this.blockTypeName(entry.id),
          partial: entry.sampleCount < this.items.length,
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
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
        const sameTypeBlocks = Object.values(item.blocks_obj || {}).filter(
          (block) => block.blocktype === this.selectedBlockType,
        );
        let ordinal = 0;
        for (const [blockId, storedBlock] of Object.entries(item.blocks_obj || {})) {
          if (storedBlock.blocktype !== this.selectedBlockType) continue;
          ordinal += 1;
          const key = `${item.item_id}:${blockId}`;
          const preview = this.previews[key] || storedBlock;
          const fileIds = storedBlock.file_id
            ? [storedBlock.file_id]
            : Array.isArray(storedBlock.file_ids)
              ? storedBlock.file_ids
              : [];
          const fileNames = fileIds.map((fileId) => this.fileName(item, fileId)).filter(Boolean);
          const fileLabel =
            fileNames.length === 1
              ? fileNames[0]
              : fileNames.length > 1
                ? `${fileNames.length} files`
                : null;
          const distinguisher = sameTypeBlocks.length > 1 ? fileLabel || `#${ordinal}` : null;
          const blockErrors = Array.isArray(preview.errors)
            ? preview.errors.filter(Boolean).join("; ")
            : null;

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
            loading: Boolean(this.previewLoading[key]),
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
      const columns = Math.min(this.activeBlocks.length || 1, 2);
      return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
    },
  },
  watch: {
    routeSelectionKey: {
      immediate: true,
      handler() {
        this.loadItems();
      },
    },
    allBlockTypesKey(key) {
      const available = key ? key.split(",") : [];
      if (!this.selectedBlockType || !available.includes(this.selectedBlockType)) {
        this.selectedBlockType = available[0] || null;
      }
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
      if (mode === "overlay") {
        this.runOverlay();
      } else {
        this.resetOverlay();
        this.ensurePreviews();
      }
    },
    activeBlockKeys() {
      if (this.mode === "overlay") {
        this.runOverlay();
      } else {
        this.ensurePreviews();
      }
    },
  },
  beforeUnmount() {
    this.loadSequence += 1;
    this.previewGeneration += 1;
    this.overlaySequence += 1;
    if (this.resizeNudgeTimer) {
      window.clearTimeout(this.resizeNudgeTimer);
    }
  },
  methods: {
    async loadCapabilities() {
      if (this.capabilitiesLoaded) return;
      try {
        const response = await sdk.api.get(`${PLUGIN_API}/capabilities`);
        const blockTypes = {};
        for (const blockType of response.block_types || []) {
          blockTypes[blockType.id] = {
            name: blockType.name || blockType.id,
            supportsOverlay: Boolean(blockType.supports_overlay),
          };
        }
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

      await Promise.all(
        this.itemRefcodes.map(async (refcode) => {
          try {
            const response = await sdk.api.get(`items/${encodeURIComponent(refcode)}`);
            if (sequence === this.loadSequence) {
              this.itemsByRefcode[refcode] = response.item_data;
              delete this.itemErrors[refcode];
            }
          } catch (error) {
            if (sequence === this.loadSequence) {
              this.itemErrors[refcode] = errorMessage(error);
            }
          }
        }),
      );

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
          message: `Remove an item before adding another. At most ${MAX_ITEMS} items can be compared.`,
        });
        return;
      }
      this.replaceItemRefcodes([...this.itemRefcodes, refcode]);
    },
    removeItem(refcode) {
      this.replaceItemRefcodes(
        this.requestedItemRefcodes.filter((candidate) => candidate !== refcode),
      );
    },
    async ensurePreviews() {
      if (this.mode !== "side-by-side" || this.loading) return;
      const missing = this.activeBlocks
        .filter(
          (entry) =>
            !this.previews[entry.key] &&
            !this.previewErrors[entry.key] &&
            !this.previewLoading[entry.key],
        )
        .slice(0, MAX_BLOCKS_PER_REQUEST);
      if (!missing.length) {
        this.$nextTick(() => this.nudgeBokehResize());
        return;
      }

      const generation = this.previewGeneration;
      const expectedKeys = new Set(missing.map((entry) => entry.key));
      for (const entry of missing) {
        this.previewLoading[entry.key] = true;
      }
      try {
        const response = await sdk.api.post(`${PLUGIN_API}/previews`, {
          blocks: missing.map((entry) => ({
            item_id: entry.itemId,
            block_id: entry.blockId,
          })),
        });
        if (generation !== this.previewGeneration) return;
        const returnedKeys = new Set();
        for (const result of response.previews || []) {
          const key = `${result.item_id}:${result.block_id}`;
          if (!expectedKeys.has(key) || returnedKeys.has(key)) {
            throw new Error("datalab returned an invalid block-preview response.");
          }
          returnedKeys.add(key);
          if (result.status === "success") {
            this.previews[key] = result.block_data;
            delete this.previewErrors[key];
          } else {
            this.previewErrors[key] = result.message || "The preview could not be generated.";
          }
        }
        for (const entry of missing) {
          if (!returnedKeys.has(entry.key)) {
            this.previewErrors[entry.key] = "datalab returned no preview for this block.";
          }
        }
      } catch (error) {
        if (generation === this.previewGeneration) {
          for (const entry of missing) {
            this.previewErrors[entry.key] = errorMessage(error);
          }
        }
      } finally {
        if (generation === this.previewGeneration) {
          for (const entry of missing) {
            this.previewLoading[entry.key] = false;
          }
          this.$nextTick(() => {
            this.nudgeBokehResize();
            this.ensurePreviews();
          });
        }
      }
    },
    nudgeBokehResize() {
      if (this.resizeNudgeTimer) {
        window.clearTimeout(this.resizeNudgeTimer);
      }
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
        const response = await sdk.api.post(`${PLUGIN_API}/overlay`, {
          blocks: this.activeBlocks.map((entry) => ({
            item_id: entry.itemId,
            block_id: entry.blockId,
            label: entry.distinguisher
              ? `${entry.chipLabel} · ${this.shortenName(entry.distinguisher)}`
              : entry.chipLabel,
          })),
        });
        if (sequence === this.overlaySequence) {
          this.overlayPlotData = response.bokeh_plot_data;
        }
      } catch (error) {
        if (sequence === this.overlaySequence) {
          this.overlayError = errorMessage(error);
        }
      } finally {
        if (sequence === this.overlaySequence) {
          this.overlayLoading = false;
        }
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
      const file = (item.files || []).find(
        (candidate) => String(candidate.immutable_id) === String(fileId),
      );
      return file?.name || null;
    },
    blockImageData(item, block) {
      const fileId = block.file_id;
      const encodedImages = block.b64_encoded_image;
      if (fileId && encodedImages?.[fileId]) {
        return `data:image/png;base64,${encodedImages[fileId]}`;
      }
      if (!fileId) return null;

      const fileName = this.fileName(item, fileId);
      const extension = fileName?.split(".").pop()?.toLowerCase();
      if (!fileName || !["png", "jpeg", "jpg"].includes(extension)) return null;

      const apiBase = new URL(`${sdk.api.baseUrl.replace(/\/+$/, "")}/`, window.location.origin);
      return new URL(`files/${encodeURIComponent(fileId)}/${encodeURIComponent(fileName)}`, apiBase)
        .href;
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
      const labels = references
        .map(
          (reference) =>
            reference.display_name ||
            reference.name ||
            reference.collection_id ||
            reference.refcode ||
            reference.item_id,
        )
        .filter(Boolean);
      return labels.join(", ") || "—";
    },
  },
};
</script>
