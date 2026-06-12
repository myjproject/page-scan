const captureBtn = document.querySelector("#captureBtn");
const downloadBtn = document.querySelector("#downloadBtn");
const statusEl = document.querySelector("#status");
const pageTypeEl = document.querySelector("#pageType");
const activeTabEl = document.querySelector("#activeTab");
const taskIdEl = document.querySelector("#taskId");
const usernameEl = document.querySelector("#username");
const taskStatusEl = document.querySelector("#taskStatus");
const logPreviewEl = document.querySelector("#logPreview");
const yamlPreviewEl = document.querySelector("#yamlPreview");
const snapshotEl = document.querySelector("#snapshot");

let lastCapture = null;

captureBtn.addEventListener("click", async () => {
  setStatus("正在抓取当前页面...");
  setBusy(true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error("没有找到活动标签页");
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureCurrentPage,
    });

    lastCapture = result;
    renderCapture(result);
    downloadBtn.disabled = false;
    setStatus("抓取完成，可以导出 JSON。");
    await chrome.storage.local.set({ lastCapture });
  } catch (error) {
    console.error(error);
    setStatus(`抓取失败：${error.message}`);
  } finally {
    setBusy(false);
  }
});

downloadBtn.addEventListener("click", async () => {
  if (!lastCapture) {
    return;
  }

  const blob = new Blob([JSON.stringify(lastCapture, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const basicInfo = lastCapture.standardized?.basicInfo || {};
  const fileId =
    basicInfo.rjobId ||
    basicInfo.name ||
    basicInfo.rjobName ||
    `${lastCapture.entityType || "capture"}-${Date.now()}`;

  try {
    await chrome.downloads.download({
      url,
      filename: `diagnosis-capture-${sanitizeFileName(fileId)}.json`,
      saveAs: true,
    });
    setStatus("JSON 导出已触发。");
  } catch (error) {
    console.error(error);
    setStatus(`导出失败：${error.message}`);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});

hydrateLastCapture();

async function hydrateLastCapture() {
  const { lastCapture: storedCapture } = await chrome.storage.local.get("lastCapture");
  if (!storedCapture) {
    return;
  }

  lastCapture = storedCapture;
  renderCapture(storedCapture);
  downloadBtn.disabled = false;
  setStatus("已恢复上一次抓取结果。");
}

function renderCapture(capture) {
  const sections = capture.standardized || [];
  const sectionMap = Object.fromEntries(
    sections
      .filter((section) => section && section.key)
      .map((section) => [section.key, section])
  );
  const basicInfo = arrayToMap(sectionMap.basicInfo?.fields || []);
  const envConfig = arrayToMap(sectionMap.envConfig?.fields || []);
  pageTypeEl.textContent = capture.entityType || "-";
  activeTabEl.textContent = capture.activeTab || "-";
  taskIdEl.textContent =
    basicInfo.rjobId?.value ||
    basicInfo.name?.value ||
    basicInfo.rjobName?.value ||
    "-";
  usernameEl.textContent = basicInfo.creator?.value || "-";
  taskStatusEl.textContent = basicInfo.status?.value || "-";
  logPreviewEl.textContent = previewText(capture.logs || "");
  yamlPreviewEl.textContent = previewText(envConfig.command?.value || "");
  snapshotEl.value = JSON.stringify(capture, null, 2);
}

function previewText(value) {
  if (!value) {
    return "-";
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setBusy(busy) {
  captureBtn.disabled = busy;
}

function sanitizeFileName(value) {
  return String(value || "capture")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function arrayToMap(items) {
  return Object.fromEntries(
    items
      .filter((item) => item && item.key)
      .map((item) => [item.key, item])
  );
}

function captureCurrentPage() {
  const bodyText = normalizeWhitespace(document.body?.innerText || "");
  const title = document.title || "";
  const url = location.href;
  const urlObject = new URL(url);
  const pageSignals = detectPageSignals(urlObject, bodyText);
  const sectionBlocks = buildSectionBlocks(bodyText);

  const commonFields = collectCommonFields();
  const structuredData = collectStructuredData(pageSignals.entityType);
  const logs = collectLogSignals();
  const processTable = extractActiveProcessTable();
  const standardizedCapture = buildStandardizedCapture();
  const blueprint = buildBlueprint();

  return {
    captureMode: "blueprint",
    capturedAt: new Date().toISOString(),
    entityType: pageSignals.entityType,
    activeTab: pageSignals.activeTab,
    standardized: standardizedCapture,
    blueprint,
    logs: pageSignals.entityType === "rjob" ? logs.bestText : "",
  };

  function buildStandardizedCapture() {
    if (pageSignals.entityType === "开发机") {
      const basicInfo = structuredData.basicInfo || {};
      const resources = structuredData.resources || {};
      const cloudDiskConfig = structuredData.cloudDiskConfig || {};
      const sections = [
        makeSection("basicInfo", "基本信息", [
          makeField("name", "名称", basicInfo.name),
          makeField("description", "描述", basicInfo.description),
          makeField("status", "状态", basicInfo.status),
          makeField("creator", "创建者", basicInfo.creator),
          makeField("ip", "IP", basicInfo.ip),
          makeField("machine", "机器", basicInfo.machine),
          makeField("createdAt", "创建时间", basicInfo.createdAt),
          makeField("updatedAt", "更新时间", basicInfo.updatedAt),
          makeField("powerOnAt", "开机时间", basicInfo.powerOnAt),
          makeField("powerOffAt", "关机时间", basicInfo.powerOffAt),
        ]),
      ];

      if (isProcessTab(pageSignals.activeTab) && processTable) {
        sections.push(makeTableSection("processInfo", "进程", processTable.headers, processTable.rows));
      }

      sections.push(
        makeSection("resources", "资源配置", [
          makeField("project", "项目", resources.project),
          makeField("quotaGroup", "配额组", resources.quotaGroup),
          makeField("cpu", "CPU", resources.cpu),
          makeField("memory", "内存", resources.memory),
          makeField("privateMachine", "私有机器", resources.privateMachine),
        ]),
        makeSection("cloudDiskConfig", "云盘配置", [
          makeField("image", "镜像", cloudDiskConfig.image),
          makeField("systemDisk", "系统盘", cloudDiskConfig.systemDisk),
          makeField("dataDisk", "数据盘", cloudDiskConfig.dataDisk),
        ])
      );

      return sections;
    }

    if (pageSignals.entityType === "worker") {
      const sections = [
        makeSection("basicInfo", "基本信息", [
          makeField("name", "名称", structuredData.basicInfo?.name),
          makeField("status", "状态", structuredData.basicInfo?.status),
          makeField("image", "镜像", structuredData.basicInfo?.image),
          makeField("creator", "创建者", structuredData.basicInfo?.creator),
          makeField("createdAt", "创建时间", structuredData.basicInfo?.createdAt),
          makeField("updatedAt", "更新时间", structuredData.basicInfo?.updatedAt),
        ]),
      ];

      if (isProcessTab(pageSignals.activeTab) && processTable) {
        sections.push(makeTableSection("processInfo", "进程", processTable.headers, processTable.rows));
      }

      sections.push(
        makeSection("resources", "资源配置", [
          makeField("project", "项目", structuredData.resources?.project),
          makeField("quotaGroup", "配额组", structuredData.resources?.quotaGroup),
          makeField("cpu", "CPU", structuredData.resources?.cpu),
          makeField("gpu", "GPU", structuredData.resources?.gpu),
          makeField("memory", "内存", structuredData.resources?.memory),
          makeField("localDisk", "本地盘", structuredData.resources?.localDisk),
          makeField("preemptible", "可抢占", structuredData.resources?.preemptible),
          makeField("privateMachine", "私有机器", structuredData.resources?.privateMachine),
        ]),
        makeSection("otherInfo", "其他信息", [
          makeField("ip", "IP", structuredData.otherInfo?.ip),
          makeField("machine", "机器", structuredData.otherInfo?.machine),
        ])
      );

      return sections;
    }

    if (pageSignals.entityType === "rjob") {
      return [
        makeSection("basicInfo", "基本信息", [
          makeField("rjobName", "RJob 名称", structuredData.basicInfo?.rjobName),
          makeField("rjobId", "RJob ID", structuredData.basicInfo?.rjobId),
          makeField("taskType", "任务类型", structuredData.basicInfo?.taskType),
          makeField("detectionStatus", "检测状态", structuredData.basicInfo?.detectionStatus),
          makeField("status", "状态", structuredData.basicInfo?.status),
          makeField("creator", "创建者", structuredData.basicInfo?.creator),
          makeField("createdAt", "创建时间", structuredData.basicInfo?.createdAt),
          makeField("expireAt", "预计删除时间", structuredData.basicInfo?.expireAt),
          makeField("subTaskCount", "子任务数", structuredData.basicInfo?.subTaskCount),
          makeField("message", "信息", structuredData.basicInfo?.message),
        ]),
        makeSection("envConfig", "环境配置", [
          makeField("image", "镜像", structuredData.envConfig?.image),
          makeField("command", "启动命令", structuredData.envConfig?.command),
        ]),
        makeSection("envVars", "环境变量", makeEnvVarFields(structuredData.envVars || {})),
        makeSection("resources", "资源配置", [
          makeField("project", "项目", structuredData.resources?.project),
          makeField("quotaGroup", "配额组", structuredData.resources?.quotaGroup),
          makeField("gpu", "GPU", structuredData.resources?.gpu),
          makeField("cpu", "CPU", structuredData.resources?.cpu),
          makeField("memory", "内存", structuredData.resources?.memory),
          makeField("localDisk", "本地盘", structuredData.resources?.localDisk),
        ]),
        makeSection("taskConfig", "任务配置", [
          makeField("autoCleanupTime", "自动清理时间", structuredData.taskConfig?.autoCleanupTime),
          makeField("keepReplicaRunning", "保留副本运行态", structuredData.taskConfig?.keepReplicaRunning),
          makeField("recycleWaitTime", "等待数据回收时间", structuredData.taskConfig?.recycleWaitTime),
          makeField("scheduleRetry", "任务调度重试", structuredData.taskConfig?.scheduleRetry),
          makeField("highPrioritySelfHealing", "高优任务自愈", structuredData.taskConfig?.highPrioritySelfHealing),
          makeField("inTrainingDiagnosis", "训中异常诊断", structuredData.taskConfig?.inTrainingDiagnosis),
        ]),
      ];
    }

    return [makeSection("basicInfo", "基本信息", [])];
  }

  function makeField(key, label, value) {
    return {
      key,
      label,
      value: value || "",
    };
  }

  function makeSection(key, label, fields) {
    return {
      key,
      label,
      fields,
    };
  }

  function makeTableSection(key, label, headers, rows) {
    return {
      key,
      label,
      entries: buildTableEntries(headers, rows),
      sectionType: "table",
    };
  }

  function buildTableEntries(headers, rows) {
    return (rows || []).map((row) => {
      const fields = [];
      (headers || []).forEach((header, index) => {
        const label = String(header || "").trim() || `列${index + 1}`;
        fields.push({
          key: toEnglishLikeKey(label, index),
          label,
          value: row?.[index] || "",
        });
      });
      return { fields };
    });
  }

  function toEnglishLikeKey(label, index) {
    const normalized = String(label || "").trim();
    const mapping = {
      "时间": "time",
      "原因": "reason",
      "信息": "message",
      "来源": "source",
      "状态": "status",
      "命令": "command",
      "CPU": "cpu",
      "内存": "memory",
      "显存": "gpuMemory",
      "GPU": "gpu",
      "容器进程 ID": "processId",
      "镜像名称": "imageName",
      "镜像版本": "imageVersion",
      "镜像仓库": "imageRegistry",
    };

    return mapping[normalized] || `column${index + 1}`;
  }

  function makeEnvVarFields(envVars) {
    return Object.entries(envVars).map(([key, value]) => ({
      key,
      label: key,
      value: value || "",
    }));
  }

  function buildBlueprint() {
    const activePanel =
      document.querySelector(".ant-tabs-tabpane-active") ||
      document.querySelector(".el-tab-pane.is-active") ||
      document.querySelector("[role='tabpanel'][aria-hidden='false']") ||
      document.querySelector("[role='tabpanel']") ||
      document.body;

    return {
      page: {
        title,
        url,
        entityType: pageSignals.entityType,
        activeTab: pageSignals.activeTab,
        tabLabels: pageSignals.tabLabels,
      },
      summary: {
        activePanelTextSample: normalizeWhitespace(activePanel.innerText || "").slice(0, 4000),
        hasTable: activePanel.querySelectorAll("table").length > 0,
        hasCanvas: activePanel.querySelectorAll("canvas").length > 0,
        hasSvg: activePanel.querySelectorAll("svg").length > 0,
      },
      terminalProbe: extractTerminalProbe(activePanel),
      tables: extractBlueprintTables(activePanel),
      keyValueBlocks: extractBlueprintKeyValueBlocks(activePanel),
      textBlocks: extractBlueprintTextBlocks(activePanel),
    };
  }

  function extractTerminalProbe(root) {
    const xtermNodes = Array.from(
      root.querySelectorAll(
        ".xterm, .xterm-screen, .xterm-rows, .xterm-accessibility, [class*='xterm'], [class*='terminal']"
      )
    );
    const canvasNodes = Array.from(root.querySelectorAll("canvas"));
    const preNodes = Array.from(root.querySelectorAll("pre, code, textarea"));
    const iframeNodes = Array.from(root.querySelectorAll("iframe"));

    const readableTextCandidates = xtermNodes
      .map((node) => normalizeWhitespace(node.innerText || node.textContent || ""))
      .filter(Boolean)
      .slice(0, 5);

    const roleCandidates = Array.from(root.querySelectorAll("[role], [aria-label]"))
      .map((node) => ({
        role: node.getAttribute("role") || "",
        ariaLabel: node.getAttribute("aria-label") || "",
        className: String(node.className || "").slice(0, 120),
        textSample: normalizeWhitespace(node.innerText || "").slice(0, 300),
      }))
      .filter((item) => item.role || item.ariaLabel)
      .slice(0, 20);

    return {
      activeTab: pageSignals.activeTab,
      hasXtermLikeNode: xtermNodes.length > 0,
      hasCanvas: canvasNodes.length > 0,
      hasPreLikeNode: preNodes.length > 0,
      hasIframe: iframeNodes.length > 0,
      xtermNodeCount: xtermNodes.length,
      canvasCount: canvasNodes.length,
      preNodeCount: preNodes.length,
      iframeCount: iframeNodes.length,
      readableTextCandidates,
      roleCandidates,
      panelTextLength: normalizeWhitespace(root.innerText || "").length,
    };
  }

  function extractBlueprintTables(root) {
    const tables = Array.from(root.querySelectorAll("table")).map((table, index) => {
      const rows = Array.from(table.querySelectorAll("tr"))
        .map((row) =>
          Array.from(row.querySelectorAll("th, td")).map((cell) =>
            normalizeWhitespace(cell.innerText || "")
          )
        )
        .filter((cells) => cells.some(Boolean));

      return {
        index,
        rowCount: rows.length,
        rows: rows.slice(0, 20),
      };
    });

    if (tables.length) {
      return tables;
    }

    const fallbackRows = Array.from(root.querySelectorAll("[role='row'], .ant-table-row"))
      .map((row) =>
        Array.from(row.querySelectorAll("[role='cell'], td, th")).map((cell) =>
          normalizeWhitespace(cell.innerText || "")
        )
      )
      .filter((cells) => cells.some(Boolean));

    if (!fallbackRows.length) {
      return [];
    }

    return [
      {
        index: 0,
        rowCount: fallbackRows.length,
        rows: fallbackRows.slice(0, 20),
        source: "role-row-fallback",
      },
    ];
  }

  function extractBlueprintKeyValueBlocks(root) {
    const lines = normalizeWhitespace(root.innerText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const pairs = [];

    for (let index = 0; index < lines.length - 1; index += 1) {
      const current = lines[index];
      const next = lines[index + 1];
      if (/[:：]$/.test(current) && next && !/[:：]$/.test(next)) {
        pairs.push({
          label: current.replace(/[:：]$/, "").trim(),
          value: next,
        });
      }
    }

    return pairs.slice(0, 100);
  }

  function extractBlueprintTextBlocks(root) {
    const selectors = [
      ".ant-card",
      ".ant-table-wrapper",
      ".chart",
      ".echarts-for-react",
      ".gm-scrollbar-container",
      ".log_wrapper",
      ".replica_log_content",
      "section",
      "article",
      "pre",
    ];

    const blocks = [];
    const seen = new Set();

    for (const selector of selectors) {
      const nodes = Array.from(root.querySelectorAll(selector));
      for (const node of nodes) {
        const text = normalizeWhitespace(node.innerText || "");
        if (!text) {
          continue;
        }
        const key = `${selector}::${text.slice(0, 120)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        blocks.push({
          selector,
          className: String(node.className || "").slice(0, 200),
          textSample: text.slice(0, 1200),
        });
      }
    }

    if (blocks.length) {
      return blocks.slice(0, 30);
    }

    return [
      {
        selector: "active-panel",
        className: String(root.className || "").slice(0, 200),
        textSample: normalizeWhitespace(root.innerText || "").slice(0, 2000),
      },
    ];
  }

  function extractActiveProcessTable() {
    if (!isProcessTab(pageSignals.activeTab)) {
      return null;
    }

    const activePanel =
      document.querySelector(".ant-tabs-tabpane-active") ||
      document.querySelector(".el-tab-pane.is-active") ||
      document.querySelector("[role='tabpanel'][aria-hidden='false']") ||
      document.querySelector("[role='tabpanel']") ||
      document.body;

    const tables = Array.from(activePanel.querySelectorAll("table")).filter((table) => {
      const text = normalizeWhitespace(table.innerText || "");
      return /容器进程|命令|CPU|内存|显存|状态/.test(text);
    });

    for (const table of tables) {
      const allRows = Array.from(table.querySelectorAll("tr"))
        .map((row) =>
          Array.from(row.querySelectorAll("th, td"))
            .map((cell) => normalizeWhitespace(cell.innerText || ""))
        )
        .filter((cells) => cells.some(Boolean));

      if (allRows.length < 2) {
        continue;
      }

      const headers = allRows[0].filter(Boolean);
      const rows = allRows
        .slice(1)
        .map((cells) => cells.slice(0, headers.length))
        .filter((cells) => cells.some(Boolean));

      if (headers.length >= 3 && rows.length) {
        return { headers, rows };
      }
    }

    const fallbackRows = Array.from(activePanel.querySelectorAll("[role='row'], .ant-table-row"))
      .map((row) =>
        Array.from(row.querySelectorAll("[role='cell'], td, th"))
          .map((cell) => normalizeWhitespace(cell.innerText || ""))
      )
      .filter((cells) => cells.some(Boolean));

    if (fallbackRows.length >= 2) {
      const headers = fallbackRows[0].filter(Boolean);
      const rows = fallbackRows
        .slice(1)
        .map((cells) => cells.slice(0, headers.length))
        .filter((cells) => cells.some(Boolean));

      if (headers.length >= 3 && rows.length) {
        return { headers, rows };
      }
    }

    return null;
  }

  function isProcessTab(activeTab) {
    const normalized = String(activeTab || "").trim().toLowerCase();
    return normalized === "进程" || normalized === "process";
  }

  function detectPageSignals(currentUrl, pageText) {
    const pathname = currentUrl.pathname;
    const explicitTab = currentUrl.searchParams.get("tab") || "";
    const tabLabels = Array.from(document.querySelectorAll("[role='tab'], .ant-tabs-tab, .el-tabs__item, .tabs li, .tab"))
      .map((node) => normalizeWhitespace(node.innerText || ""))
      .filter(Boolean)
      .slice(0, 20);

    const entityType = detectEntityType(pathname, pageText);
    const pageType = entityType === "rjob" ? "job-detail" : "workspace-detail";

    let activeTab = explicitTab || detectVisibleActiveTab();
    if (!activeTab && /状态日志/.test(pageText.slice(0, 3000))) {
      activeTab = "statusLog";
    }

    return {
      entityType,
      pageType,
      activeTab: activeTab || "unknown",
      tabLabels,
    };
  }

  function detectEntityType(pathname, pageText) {
    if (/\/job\/detail\//i.test(pathname) || /RJob 名称|RJob ID|环境变量/.test(pageText)) {
      return "rjob";
    }

    if (/worker/i.test(pathname) || /Rlaunch\(worker\)|可抢占|其他信息/.test(pageText)) {
      return "worker";
    }

    if (/\/workspace\//i.test(pathname) || /开机时间|关机时间|云盘配置|系统盘|数据盘/.test(pageText)) {
      return "开发机";
    }

    return "generic-page";
  }

  function detectVisibleActiveTab() {
    const tabNodes = Array.from(
      document.querySelectorAll(
        "[role='tab'][aria-selected='true'], .ant-tabs-tab-active, .is-active, .active.tab, .tabs .active"
      )
    );

    for (const node of tabNodes) {
      const text = normalizeWhitespace(node.innerText || "");
      if (text) {
        return text;
      }
    }

    return "";
  }

  function collectCommonFields() {
    const fields = {
      taskId: "",
      username: "",
      status: "",
      name: "",
      ip: "",
      machine: "",
      project: "",
      quotaGroup: "",
      cpu: "",
      memory: "",
      gpu: "",
    };

    fields.taskId =
      readLabeledField(["RJob ID", "任务 ID", "任务ID", "Job ID", "RJob 名称"]) ||
      extractTaskId(url, title, bodyText);
    fields.username = readLabeledField(["创建者", "用户名", "用户", "Owner"]);
    fields.status = readLabeledField(["状态"]) || extractPreferredStatus();
    fields.name = readLabeledField(["名称", "任务名称", "RJob 名称"]);
    fields.ip = readLabeledField(["IP"]);
    fields.machine = readLabeledField(["机器", "节点"]);
    fields.project = readLabeledField(["项目"]);
    fields.quotaGroup = readLabeledField(["配额组", "资源组"]);
    fields.cpu = readLabeledField(["CPU"]);
    fields.memory = readLabeledField(["内存"]);
    fields.gpu = readLabeledField(["GPU"]);

    return fields;

    function readLabeledField(fieldLabels) {
      const match = readFieldFromText(bodyText, fieldLabels);
      if (match) {
        return match;
      }

      const normalizedLabels = new Set(fieldLabels.map((label) => normalizeLabel(label)));
      const labels = Array.from(document.querySelectorAll("body *"))
        .map((node) => normalizeWhitespace(node.innerText || ""))
        .filter((text) => text && text.length <= 120);

      for (let index = 0; index < labels.length - 1; index += 1) {
        const current = normalizeLabel(labels[index]);
        const next = labels[index + 1];
        if (normalizedLabels.has(current) && next) {
          return next;
        }
      }

      return "";
    }
  }

  function collectStructuredData(entityType) {
    const basicInfoText = sectionBlocks.basicInfo || bodyText;
    const envConfigText = sectionBlocks.envConfig || bodyText;
    const envVarsText = sectionBlocks.envVars || bodyText;
    const resourcesText = sectionBlocks.resources || bodyText;
    const taskConfigText = sectionBlocks.taskConfig || bodyText;
    const cloudDiskText = sectionBlocks.cloudDisk || bodyText;
    const otherInfoText = sectionBlocks.otherInfo || bodyText;
    const envVars = extractEnvironmentVariables(envVarsText);

    if (entityType === "开发机") {
      return {
        entityType,
        basicInfo: {
          name: readFieldFromText(basicInfoText, ["名称"]),
          description: readFieldFromText(basicInfoText, ["描述"]),
          status: extractPreferredStatus() || readFieldFromText(basicInfoText, ["状态"]),
          creator: readFieldFromText(basicInfoText, ["创建者"]),
          ip: readFieldFromText(basicInfoText, ["IP"]),
          machine: readFieldFromText(basicInfoText, ["机器"]),
          createdAt: readFieldFromText(basicInfoText, ["创建时间"]),
          updatedAt: readFieldFromText(basicInfoText, ["更新时间"]),
          powerOnAt: readFieldFromText(basicInfoText, ["开机时间"]),
          powerOffAt: readFieldFromText(basicInfoText, ["关机时间"]),
        },
        resources: {
          project: readFieldFromText(resourcesText, ["项目"]),
          quotaGroup: readFieldFromText(resourcesText, ["配额组"]),
          cpu: readFieldFromText(resourcesText, ["CPU"]),
          memory: readFieldFromText(resourcesText, ["内存"]),
          privateMachine: readFieldFromText(resourcesText, ["私有机器"]),
        },
        cloudDiskConfig: {
          image: readFieldFromText(cloudDiskText, ["镜像"]),
          systemDisk: readFieldFromText(cloudDiskText, ["系统盘"]),
          dataDisk: readFieldFromText(cloudDiskText, ["数据盘"]),
        },
      };
    }

    if (entityType === "worker") {
      return {
        entityType,
        basicInfo: {
          name: readFieldFromText(basicInfoText, ["名称"]),
          status: extractPreferredStatus() || readFieldFromText(basicInfoText, ["状态"]),
          image: readFieldFromText(basicInfoText, ["镜像"]),
          creator: readFieldFromText(basicInfoText, ["创建者"]),
          createdAt: readFieldFromText(basicInfoText, ["创建时间"]),
          updatedAt: readFieldFromText(basicInfoText, ["更新时间"]),
        },
        resources: {
          project: readFieldFromText(resourcesText, ["项目"]),
          quotaGroup: readFieldFromText(resourcesText, ["配额组"]),
          cpu: readFieldFromText(resourcesText, ["CPU"]),
          gpu: readFieldFromText(resourcesText, ["GPU"]),
          memory: readFieldFromText(resourcesText, ["内存"]),
          localDisk: readFieldFromText(resourcesText, ["本地盘"]),
          preemptible: readFieldFromText(resourcesText, ["可抢占"]),
          privateMachine: readFieldFromText(resourcesText, ["私有机器"]),
        },
        otherInfo: {
          ip: readFieldFromText(otherInfoText, ["IP"]),
          machine: readFieldFromText(otherInfoText, ["机器"]),
        },
      };
    }

    if (entityType === "rjob") {
      return {
        entityType,
        basicInfo: {
          rjobName: readFieldFromText(basicInfoText, ["RJob 名称"]),
          rjobId:
            readFieldFromText(basicInfoText, ["RJob ID", "任务 ID", "任务ID", "Job ID"]) ||
            extractTaskId(url, title, bodyText),
          taskType: readFieldFromText(basicInfoText, ["任务类型"]),
          detectionStatus: readFieldFromText(basicInfoText, ["检测状态"]),
          status: extractPreferredStatus() || readFieldFromText(basicInfoText, ["状态"]),
          creator: readFieldFromText(basicInfoText, ["创建者"]),
          createdAt: readFieldFromText(basicInfoText, ["创建时间"]),
          expireAt: readFieldFromText(basicInfoText, ["预计删除时间"]),
          subTaskCount: readFieldFromText(basicInfoText, ["子任务数"]),
          message: readFieldFromText(basicInfoText, ["信息"]),
        },
        envConfig: {
          image: readFieldFromText(envConfigText, ["镜像"]),
          command: readFieldFromText(envConfigText, ["启动命令", "命令"]),
        },
        envVars,
        resources: {
          project: readFieldFromText(resourcesText, ["项目"]),
          quotaGroup:
            readFieldFromText(resourcesText, ["配额组", "资源组"]) ||
            envVars.KUBEBRAIN_QUOTA_GROUP ||
            "",
          gpu: readFieldFromText(resourcesText, ["GPU"]),
          cpu: readFieldFromText(resourcesText, ["CPU"]),
          memory: readFieldFromText(resourcesText, ["内存"]),
          localDisk: readFieldFromText(resourcesText, ["本地盘", "磁盘"]),
        },
        taskConfig: {
          autoCleanupTime: readFieldFromText(taskConfigText, ["自动清理时间"]),
          keepReplicaRunning: readFieldFromText(taskConfigText, ["保留副本运行态"]),
          recycleWaitTime: readFieldFromText(taskConfigText, ["等待数据回收时间"]),
          scheduleRetry: readFieldFromText(taskConfigText, ["任务调度重试"]),
          highPrioritySelfHealing: readFieldFromText(taskConfigText, ["高优任务自愈"]),
          inTrainingDiagnosis: readFieldFromText(taskConfigText, ["训中异常诊断"]),
        },
      };
    }

    return {
      entityType,
      basicInfo: {
        name: readFieldFromText(basicInfoText, ["名称", "RJob 名称"]),
        status: extractPreferredStatus() || readFieldFromText(basicInfoText, ["状态"]),
        creator: readFieldFromText(basicInfoText, ["创建者"]),
      },
    };
  }

  function collectStructuredSections() {
    const candidates = [];

    document.querySelectorAll("table").forEach((table, index) => {
      const rows = Array.from(table.rows || []).slice(0, 20).map((row) =>
        Array.from(row.cells || []).map((cell) => normalizeWhitespace(cell.innerText || ""))
      );

      if (rows.length) {
        candidates.push({
          type: "table",
          index,
          rows,
        });
      }
    });

    document.querySelectorAll("dl").forEach((dl, index) => {
      const items = [];
      const terms = Array.from(dl.querySelectorAll("dt"));
      terms.forEach((dt) => {
        const dd = dt.nextElementSibling;
        if (dd?.tagName?.toLowerCase() === "dd") {
          items.push({
            key: normalizeWhitespace(dt.innerText || ""),
            value: normalizeWhitespace(dd.innerText || ""),
          });
        }
      });

      if (items.length) {
        candidates.push({
          type: "definition-list",
          index,
          items,
        });
      }
    });

    document.querySelectorAll("pre, code, textarea").forEach((node, index) => {
      const text = normalizeWhitespace(node.innerText || node.value || "");
      if (text) {
        candidates.push({
          type: node.tagName.toLowerCase(),
          index,
          text: text.slice(0, 4000),
        });
      }
    });

    return candidates.slice(0, 30);
  }

  function collectTabPanels() {
    const panels = Array.from(
      document.querySelectorAll("[role='tabpanel'], .ant-tabs-tabpane-active, .el-tab-pane.is-active, .tab-pane.active")
    )
      .map((node, index) => ({
        index,
        textSample: normalizeWhitespace(node.innerText || "").slice(0, 2500),
      }))
      .filter((item) => item.textSample);

    return panels.slice(0, 10);
  }

  function collectLogSignals() {
    const nodes = Array.from(
      document.querySelectorAll(
        "pre, code, textarea, [class*='log'], [id*='log'], [class*='terminal'], [class*='xterm']"
      )
    );
    const withScore = nodes
      .map((node) => {
        const text = normalizeWhitespace(node.innerText || node.textContent || node.value || "");
        return {
          tagName: node.tagName.toLowerCase(),
          className: String(node.className || "").slice(0, 200),
          text,
          score: scoreLogText(text),
        };
      })
      .filter((entry) => entry.text);

    withScore.sort((a, b) => b.score - a.score);
    return {
      bestText: withScore[0]?.text?.slice(0, 6000) || "",
      topCandidates: withScore.slice(0, 5).map((entry) => ({
        tagName: entry.tagName,
        className: entry.className,
        score: entry.score,
        textSample: entry.text.slice(0, 800),
      })),
      containsToolbarOnly:
        withScore[0]?.text &&
        /重置|时间范围|下载日志|最新日志|最旧日志|字体大小/.test(withScore[0].text) &&
        !/error|exception|traceback|warn|fail|permission denied/i.test(withScore[0].text),
    };
  }

  function buildSectionBlocks(text) {
    return {
      basicInfo: extractSectionText(text, "基本信息", ["环境配置", "资源配置", "任务配置", "云盘配置", "其他信息", "子任务", "yaml", "状态日志", "日志", "历史副本"]),
      envConfig: extractSectionText(text, "环境配置", ["资源配置", "任务配置", "云盘配置", "其他信息", "子任务", "yaml", "状态日志", "日志", "历史副本"]),
      envVars: extractSectionText(text, "环境变量", ["资源配置", "任务配置", "云盘配置", "其他信息", "子任务", "yaml", "状态日志", "日志", "历史副本"]),
      resources: extractSectionText(text, "资源配置", ["任务配置", "云盘配置", "其他信息", "子任务", "yaml", "状态日志", "日志", "历史副本"]),
      taskConfig: extractSectionText(text, "任务配置", ["云盘配置", "其他信息", "子任务", "yaml", "状态日志", "日志", "历史副本"]),
      cloudDisk: extractSectionText(text, "云盘配置", ["其他信息", "子任务", "yaml", "状态日志", "日志", "历史副本"]),
      otherInfo: extractSectionText(text, "其他信息", ["子任务", "yaml", "状态日志", "日志", "历史副本"]),
    };
  }

  function extractSectionText(text, startLabel, endLabels) {
    const startIndex = text.indexOf(startLabel);
    if (startIndex === -1) {
      return "";
    }

    const sectionStart = startIndex + startLabel.length;
    let endIndex = text.length;

    for (const endLabel of endLabels) {
      const candidateIndex = text.indexOf(endLabel, sectionStart);
      if (candidateIndex !== -1 && candidateIndex < endIndex) {
        endIndex = candidateIndex;
      }
    }

    return text.slice(sectionStart, endIndex).trim();
  }

  function extractEnvironmentVariables(text) {
    const envVars = {};
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index] !== "Key") {
        continue;
      }

      const key = lines[index + 1];
      if (!key) {
        continue;
      }

      let value = "";
      for (let cursor = index + 2; cursor < Math.min(index + 7, lines.length); cursor += 1) {
        if (lines[cursor] === "Value" && lines[cursor + 1]) {
          value = lines[cursor + 1];
          break;
        }
      }

      envVars[key] = value;
    }

    return envVars;
  }

  function findBestYamlCandidate() {
    const activePanel = findActivePanel();
    const scopedRoot = activePanel || document.body;
    const selector = [
      "pre",
      "code",
      "textarea",
      "[class*='yaml']",
      "[id*='yaml']",
      "[class*='monaco']",
      "[class*='editor']",
      "[class*='syntax']",
      "[class*='highlight']",
      "[class*='xterm']",
    ].join(", ");
    const nodes = Array.from(scopedRoot.querySelectorAll(selector));
    const withScore = nodes
      .map((node) => {
        const text = normalizeYamlText(node.innerText || node.textContent || node.value || "");
        return {
          text,
          score: scoreYamlText(text),
        };
      })
      .filter((entry) => entry.text);

    const panelText = normalizeYamlText(scopedRoot.innerText || scopedRoot.textContent || "");
    if (panelText) {
      withScore.push({
        text: panelText,
        score: scoreYamlText(panelText) - 100,
      });
    }

    withScore.sort((a, b) => b.score - a.score);
    return withScore[0]?.text?.slice(0, 30000) || "";
  }

  function extractTaskId(pageUrl, pageTitle, pageText) {
    const combined = `${pageUrl}\n${pageTitle}\n${pageText.slice(0, 1500)}`;
    const patterns = [
      /\/detail\/([A-Za-z0-9._-]+)/i,
      /task\/([A-Za-z0-9_-]+)/i,
      /RJob ID[:：\s]*([A-Za-z0-9._-]+)/i,
      /Job ID[:：\s]*([A-Za-z0-9._-]+)/i,
      /任务ID[:：\s]*([A-Za-z0-9_-]+)/i,
      /task[_\s-]*id[:：\s]*([A-Za-z0-9_-]+)/i,
      /\b(job|task)[-_ ]?([A-Za-z0-9._-]{6,})\b/i,
    ];

    for (const pattern of patterns) {
      const match = combined.match(pattern);
      if (match) {
        return match[2] || match[1];
      }
    }

    return "";
  }

  function extractLabeledValue(text, labels) {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`${escaped}[:：\\s]+([^\\n]{1,120})`, "i");
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return "";
  }

  function extractStatusBadge() {
    const badgeNodes = Array.from(
      document.querySelectorAll("[class*='status'], [class*='badge'], [data-status]")
    );
    const statusKeywords = [
      "failed",
      "error",
      "running",
      "success",
      "pending",
      "terminated",
      "异常",
      "失败",
      "成功",
      "运行中",
      "已完成",
    ];

    for (const node of badgeNodes) {
      const text = normalizeWhitespace(node.innerText || "");
      if (statusKeywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()))) {
        return text;
      }
    }

    return "";
  }

  function extractPreferredStatus() {
    const basicInfoText = sectionBlocks.basicInfo || bodyText;
    const lines = basicInfoText.split("\n").map((line) => line.trim()).filter(Boolean);

    for (let index = 0; index < lines.length - 1; index += 1) {
      if (lines[index] === "状态" || lines[index] === "状态：") {
        const candidate = lines[index + 1];
        if (candidate && !/未配置|关闭/.test(candidate) && !/^(创建者|创建时间|更新时间|预计删除时间|IP|机器)$/.test(candidate)) {
          return candidate;
        }
      }
    }

    const labeled = basicInfoText.match(/状态[:：\s]*\n?([^\n]{1,60})/);
    if (labeled?.[1] && !/未配置/.test(labeled[1]) && !/^(创建者|创建时间|更新时间|预计删除时间|IP|机器)$/.test(labeled[1].trim())) {
      return labeled[1].trim();
    }

    return "";
  }

  function readFieldFromText(text, labels) {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const normalizedLabels = new Set(labels.map((label) => normalizeLabel(label)));

    for (let index = 0; index < lines.length; index += 1) {
      const current = lines[index];
      if (!normalizedLabels.has(normalizeLabel(current))) {
        continue;
      }

      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const candidate = lines[cursor];
        if (!candidate) {
          continue;
        }
        if (normalizedLabels.has(normalizeLabel(candidate))) {
          break;
        }
        if (/^(Key|Value|基本信息|环境配置|环境变量|资源配置|任务配置)$/.test(candidate)) {
          break;
        }
        return candidate;
      }
    }

    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = text.match(new RegExp(`${escaped}[:：\\s]*\\n?([^\\n]{1,200})`, "i"));
      if (match?.[1]) {
        const value = match[1].trim();
        if (value && !normalizedLabels.has(normalizeLabel(value))) {
          return value;
        }
      }
    }

    return "";
  }

  function normalizeLabel(value) {
    return String(value || "")
      .replace(/[：:]/g, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function scoreLogText(text) {
    if (!text) {
      return -1;
    }

    let score = text.length;
    if (/重置|时间范围|下载日志|最新日志|最旧日志|字体大小/.test(text)) {
      score -= 400;
    }
    if (/error|exception|traceback|warn|failed|permission denied/i.test(text)) {
      score += 1000;
    }
    if (/commit|schedul|pulling|killed|oom|exit code|traceback|error/i.test(text)) {
      score += 500;
    }
    if (text.split(/\n|\s{2,}/).length > 8) {
      score += 300;
    }
    return score;
  }

  function scoreYamlText(text) {
    if (!text) {
      return -1;
    }

    let score = 0;
    if (/apiVersion:|kind:|metadata:|spec:|image:|env:/i.test(text)) {
      score += 1500;
    }
    if (/---\s*\n/.test(text)) {
      score += 800;
    }
    if (/labels:|annotations:|containers:|volumes:|command:/i.test(text)) {
      score += 800;
    }
    if (/^\s*[A-Za-z0-9_-]+\s*:/m.test(text)) {
      score += 500;
    }
    score += Math.min(text.length, 2000);
    return score;
  }

  function normalizeYamlText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/\t/g, "  ")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .trim();
  }

  function normalizeWhitespace(value) {
    return value
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
