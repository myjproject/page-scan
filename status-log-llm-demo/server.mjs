import http from "node:http";
import fs from "node:fs/promises";
import { URL } from "node:url";
import OpenAI from "openai";

const PORT = Number(process.env.PORT || 3001);
const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const BASE_URL = process.env.OPENAI_BASE_URL || "";
const MAX_BODY_SIZE = 2 * 1024 * 1024;

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(BASE_URL ? { baseURL: BASE_URL } : {}),
    })
  : null;

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    writeCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      model: MODEL,
      baseUrl: BASE_URL || "default",
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/") {
    sendHtml(res, buildDemoPageHtml());
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/sample-capture.json") {
    try {
      const sampleJson = await fs.readFile(new URL("./sample-capture.json", import.meta.url), "utf8");
      writeCorsHeaders(res);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(sampleJson);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/analyze-status-log") {
    try {
      if (!client) {
        sendJson(res, 500, {
          error: "Missing OPENAI_API_KEY. Please configure it before calling this endpoint.",
        });
        return;
      }

      const payload = await readJsonBody(req);
      const capture = unwrapCapturePayload(payload);
      const statusLogRows = extractStatusLogRows(capture);

      if (!statusLogRows.length) {
        sendJson(res, 400, {
          error: "No statusLogInfo found in the JSON payload.",
        });
        return;
      }

      const meta = extractCaptureMeta(capture);
      const llmAnalysis = await analyzeStatusLogWithLlm({
        meta,
        statusLogRows,
      });

      sendJson(res, 200, {
        ok: true,
        model: MODEL,
        meta,
        statusLogCount: statusLogRows.length,
        statusLogRows,
        llmAnalysis,
      });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Status log LLM demo listening on http://localhost:${PORT}`);
});

async function analyzeStatusLogWithLlm({ meta, statusLogRows }) {
  const trimmedRows = statusLogRows.slice(0, 80);
  const logText = trimmedRows
    .map((row, index) => {
      const parts = [
        `#${index + 1}`,
        row.time ? `time=${row.time}` : "",
        row.reason ? `reason=${row.reason}` : "",
        row.message ? `message=${row.message}` : "",
        row.source ? `source=${row.source}` : "",
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .join("\n");

  const prompt = [
    "请你分析下面这份内部任务页面的状态日志。",
    "你的目标不是复述，而是帮助排查问题。",
    "",
    "请按下面结构输出：",
    "1. 总体判断",
    "2. 关键异常信号",
    "3. 最可能的根因猜测",
    "4. 建议的下一步排查动作",
    "5. 风险等级（低/中/高）",
    "",
    "如果信息不足，请明确写出“信息不足”以及还缺什么。",
    "",
    "页面元信息：",
    JSON.stringify(meta, null, 2),
    "",
    "状态日志：",
    logText,
  ].join("\n");

  const response = await client.responses.create({
    model: MODEL,
    instructions:
      "你是一名擅长阅读任务调度/训练任务/工作机状态日志的诊断助手。请用中文输出，结论简洁、可执行，避免空话。",
    input: prompt,
  });

  return response.output_text || "";
}

function unwrapCapturePayload(payload) {
  if (payload && typeof payload === "object" && payload.capture && typeof payload.capture === "object") {
    return payload.capture;
  }

  return payload;
}

function extractCaptureMeta(capture) {
  const basicInfoSection = findSectionByKey(capture, "basicInfo");
  const basicInfo = sectionFieldsToMap(basicInfoSection?.fields || []);

  return {
    captureMode: capture?.captureMode || "",
    entityType: capture?.entityType || "",
    activeTab: capture?.activeTab || "",
    taskId: basicInfo.rjobId || basicInfo.name || basicInfo.rjobName || "",
    creator: basicInfo.creator || "",
    status: basicInfo.status || "",
  };
}

function extractStatusLogRows(capture) {
  const statusLogSection =
    capture?.statusLogInfo ||
    findSectionByKey(capture, "statusLogInfo");

  const entries = Array.isArray(statusLogSection?.entries) ? statusLogSection.entries : [];

  return entries.map((entry, index) => {
    const fields = sectionFieldsToMap(entry?.fields || []);
    return {
      index: index + 1,
      time: fields.time || fields["时间"] || "",
      reason: fields.reason || fields["原因"] || "",
      message: fields.message || fields.info || fields["信息"] || "",
      source: fields.source || fields["来源"] || "",
    };
  });
}

function findSectionByKey(capture, key) {
  const sections = Array.isArray(capture?.standardized) ? capture.standardized : [];
  return sections.find((section) => section?.key === key) || null;
}

function sectionFieldsToMap(fields) {
  const result = {};

  for (const field of fields) {
    if (!field || typeof field !== "object") {
      continue;
    }

    if (field.key) {
      result[field.key] = field.value || "";
    }

    if (field.label) {
      result[field.label] = field.value || "";
    }
  }

  return result;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_SIZE) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        reject(new Error("Request body is empty."));
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON payload: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  writeCorsHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res, html) {
  writeCorsHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
  });
  res.end(html);
}

function writeCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function buildDemoPageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Status Log LLM Demo</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f1e8;
        --panel: #fffdfa;
        --ink: #1f2937;
        --muted: #6b7280;
        --accent: #9f3a24;
        --line: #e8ddd0;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font: 14px/1.5 "SF Pro Text", "PingFang SC", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top right, rgba(159, 58, 36, 0.12), transparent 32%),
          linear-gradient(180deg, #fbf6ef 0%, var(--bg) 100%);
      }

      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: 24px 16px 40px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px;
        box-shadow: 0 10px 30px rgba(31, 41, 55, 0.06);
      }

      h1, h2 {
        margin: 0 0 12px;
      }

      p {
        color: var(--muted);
      }

      textarea {
        width: 100%;
        min-height: 320px;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        font: 12px/1.45 ui-monospace, monospace;
        resize: vertical;
        background: #fff;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        background: var(--accent);
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .button-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 12px;
      }

      input[type="file"] {
        display: block;
        width: 100%;
        margin-top: 12px;
      }

      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #fff;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        min-height: 220px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Status Log LLM Demo</h1>
        <p>直接上传插件导出的完整 JSON，或者把完整 JSON 粘进来。服务会自动提取其中的 <code>statusLogInfo</code>，再发给 LLM 分析。</p>
        <input id="jsonFile" type="file" accept=".json,application/json" />
        <textarea id="jsonInput" placeholder="也可以在这里粘贴完整采集 JSON"></textarea>
        <div class="button-row">
          <button id="analyzeBtn">分析状态日志</button>
          <button id="useSampleBtn" type="button">填入示例 JSON</button>
        </div>
      </section>

      <section class="panel" style="margin-top: 16px;">
        <h2>分析结果</h2>
        <pre id="result">等待分析</pre>
      </section>
    </main>

    <script>
      const analyzeBtn = document.getElementById("analyzeBtn");
      const useSampleBtn = document.getElementById("useSampleBtn");
      const jsonFile = document.getElementById("jsonFile");
      const jsonInput = document.getElementById("jsonInput");
      const result = document.getElementById("result");

      jsonFile.addEventListener("change", async () => {
        const file = jsonFile.files && jsonFile.files[0];
        if (!file) {
          return;
        }

        const text = await file.text();
        jsonInput.value = text;
      });

      useSampleBtn.addEventListener("click", async () => {
        result.textContent = "加载示例中...";

        try {
          const response = await fetch("/sample-capture.json");
          const text = await response.text();
          jsonInput.value = text;
          result.textContent = "示例 JSON 已填入。";
        } catch (error) {
          result.textContent = error.message;
        }
      });

      analyzeBtn.addEventListener("click", async () => {
        result.textContent = "分析中...";

        try {
          const response = await fetch("/analyze-status-log", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: jsonInput.value
          });

          const data = await response.json();
          result.textContent = JSON.stringify(data, null, 2);
        } catch (error) {
          result.textContent = error.message;
        }
      });
    </script>
  </body>
</html>`;
}
