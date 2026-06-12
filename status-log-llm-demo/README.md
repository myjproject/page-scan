# Status Log LLM Demo

这个 demo 独立于 Chrome 插件运行。

它做的事情很简单：

- 接收插件导出的采集 JSON
- 提取其中的 `statusLogInfo`
- 把状态日志发给 LLM 做诊断分析
- 返回分析结果

## 启动

1. 进入目录：

```bash
cd /Users/che/projects/html/status-log-llm-demo
```

2. 安装依赖：

```bash
npm install
```

3. 配置环境变量：

```bash
直接编辑这个文件：

[.env](/Users/che/projects/html/status-log-llm-demo/.env)
```

把这些值填进去：

```bash
OPENAI_API_KEY=你的 Key
OPENAI_BASE_URL=你的接口地址
OPENAI_MODEL=gpt-5.5
PORT=3001
```

4. 启动服务：

```bash
npm start
```

启动后访问：

[http://localhost:3001](http://localhost:3001)

页面里可以：

- 直接上传插件导出的完整 `.json`
- 或者粘贴完整采集 JSON

后端会自动提取 `statusLogInfo`，你不用手工挑字段。

## 接口

### `POST /analyze-status-log`

请求体直接传插件导出的完整 JSON 即可。

也兼容这种包装形式：

```json
{
  "capture": {
    "captureMode": "production"
  }
}
```

### curl 示例

```bash
curl -X POST http://localhost:3001/analyze-status-log \
  -H "Content-Type: application/json" \
  --data @your-capture.json
```

## 期望的状态日志结构

这个 demo 主要读取生产插件导出的：

```json
{
  "statusLogInfo": {
    "key": "statusLogInfo",
    "label": "状态日志",
    "entries": [
      {
        "fields": [
          { "key": "time", "label": "时间", "value": "..." },
          { "key": "reason", "label": "原因", "value": "..." },
          { "key": "info", "label": "信息", "value": "..." },
          { "key": "source", "label": "来源", "value": "..." }
        ]
      }
    ]
  }
}
```

如果请求里没有 `statusLogInfo`，接口会直接返回报错。
