# HTML Project Overview

这个仓库目前包含 4 个主要目录，其中最容易混淆的是：

- `llm-diagnosis-demo`：Chrome 插件 demo
- `status-log-llm-demo`：本地后端 LLM 分析服务 demo

它们不是同一个东西，而是前后端联调用的两部分。

## 目录说明

### `diagnosis-data-collector`

生产版页面采集插件。

作用：

- 抓取业务页面
- 输出稳定的结构化 JSON
- 供后端正式消费

特点：

- 不负责 LLM 分析
- 更关注 schema 稳定和采集结果可落地

### `page-blueprint-capture`

页面蓝本调试插件。

作用：

- 探索页面结构
- 查看表格、文本块、键值对、日志区域在哪
- 为后续补采集规则提供参考

特点：

- 偏调试
- 输出更多页面结构信息

### `status-log-llm-demo`

本地后端 LLM 分析服务 demo。

作用：

- 接收插件上传的完整采集 JSON
- 自动提取 `statusLogInfo`
- 把状态日志发送给 LLM
- 返回分析结果

特点：

- 这是后端服务，不是 Chrome 插件
- 需要先配置 `.env` 里的 API Key、模型、接口地址
- 默认启动在 `http://localhost:3001`

### `llm-diagnosis-demo`

插件侧联调 demo。

作用：

- 复用生产采集器的抓取流程
- 抓到完整 JSON 后直接调用 `status-log-llm-demo`
- 在插件 popup 中显示 LLM 返回的分析结果

特点：

- 这是 Chrome 插件，不是后端
- 依赖 `status-log-llm-demo` 先启动
- 用来验证“页面抓取 -> JSON -> LLM 分析 -> 插件展示”的整条链路

## 两个 Demo 的关系

最容易混淆的是这两个：

1. `status-log-llm-demo`
   这是后端服务，负责真正调用 LLM。
2. `llm-diagnosis-demo`
   这是前端插件，负责抓页面并把 JSON 发给后端服务。

可以把它们理解成：

- `llm-diagnosis-demo` = 调用入口
- `status-log-llm-demo` = 分析后端

## 一步到位链路

完整流程如下：

1. 在 Chrome 页面里打开 `llm-diagnosis-demo`
2. 插件抓取当前业务页面，生成完整 JSON
3. 插件把 JSON 发到 `status-log-llm-demo`
4. 后端服务提取 `statusLogInfo`
5. 后端把状态日志发给 LLM
6. LLM 返回分析结果
7. 插件把结果显示在 popup 里

## 推荐启动顺序

1. 先启动后端服务：

```bash
cd /Users/che/projects/html/status-log-llm-demo
npm install
npm start
```

2. 再在 Chrome 里加载插件：

- `/Users/che/projects/html/llm-diagnosis-demo`

3. 在插件里点击：

- `抓取并分析`

## 备注

如果你只是想导出稳定 JSON，用 `diagnosis-data-collector`。

如果你只是想摸清页面结构，用 `page-blueprint-capture`。

如果你想验证 LLM 联调链路，用：

- `status-log-llm-demo`
- `llm-diagnosis-demo`
