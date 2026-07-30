import ToolView from "./ToolView.vue";
import styles from "./tool.css?inline";

const TOOL_ID = "item-comparison";

const styleId = `datalab-tool-${TOOL_ID}-styles`;
if (!document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = styles;
  document.head.appendChild(style);
}

window.datalabToolSdk.register(ToolView);
