# LLM 诊断 Demo

这个目录是一个 Chrome 插件 demo，不是后端服务。

它基于生产采集器改出来，保留原来的页面抓取逻辑，同时新增一步：

- 抓取页面
- 按页面规划连续切换并抓取多个子页
- 直接把完整 JSON 发给本地分析后端
- 在插件里显示 LLM 返回结果

## 它依赖哪个后端

这个插件不会自己调用模型。

真正负责调用 LLM 的，是仓库里的另一个目录：

- `status-log-llm-demo`

也就是说：

- `llm-diagnosis-demo` = 插件前端
- `status-log-llm-demo` = 后端 LLM 分析服务

如果后端没启动，这个插件只能抓取 JSON，不能返回 LLM 分析结果。

## 适用场景

- 想保留原始采集 JSON
- 想一步拿到 LLM 分析结果
- 想验证“插件 -> 本地分析服务 -> LLM -> 插件展示”的整条链路

## 如何加载

1. 打开 Chrome 的 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前仓库中的 `llm-diagnosis-demo` 目录

## 使用方式

1. 先启动本地分析服务：

```bash
cd status-log-llm-demo
npm install
npm start
```

2. 再加载这个插件：

- `llm-diagnosis-demo`

3. 打开插件，确认“分析接口”地址默认是：

```text
http://localhost:3001/analyze-status-log
```

4. 点击 `抓取并分析`

5. 插件会自动：

- 抓取当前页面完整 JSON
- 在支持的页面里连续切换多个 tab，并补采对应子页数据
- 把 JSON 发给 `status-log-llm-demo`
- 等待后端调用 LLM
- 在 popup 里显示分析结果

## 和别的目录怎么区分

- `diagnosis-data-collector`：只负责采集，不做 LLM 分析
- `page-blueprint-capture`：只负责页面结构探索
- `status-log-llm-demo`：后端 LLM 服务
- `llm-diagnosis-demo`：调用后端 LLM 服务的插件 demo
