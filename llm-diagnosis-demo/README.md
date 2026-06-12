# LLM 诊断 Demo

这个插件基于生产采集器改出来，保留原来的页面抓取逻辑，同时新增一步：

- 抓取页面
- 直接把完整 JSON 发给分析后端
- 在插件里显示 LLM 返回结果

## 适用场景

- 想保留原始采集 JSON
- 想一步拿到 LLM 分析结果
- 想验证“插件 -> 本地分析服务 -> LLM -> 插件展示”的整条链路

## 如何加载

1. 打开 Chrome 的 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择 `/Users/che/projects/html/llm-diagnosis-demo`

## 使用方式

1. 先启动本地分析服务：`/Users/che/projects/html/status-log-llm-demo`
2. 在插件里确认“分析接口”地址
3. 点击“抓取并分析”
4. 插件会直接显示 LLM 结果
