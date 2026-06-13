# Status Log LLM Demo

这个目录是本地后端 LLM 分析服务 demo，独立于 Chrome 插件运行。

它做的事情很简单：

- 接收插件导出的采集 JSON
- 提取其中的 `statusLogInfo`
- 把状态日志发给 LLM 做诊断分析
- 返回分析结果

## 适用系统

- macOS
- Windows

代码和目录放在一起，不分两个项目。

## 先配置

直接编辑这个文件：

[.env](/Users/che/projects/html/status-log-llm-demo/.env)

把这些值填进去：

```bash
OPENAI_API_KEY=你的 Key
OPENAI_BASE_URL=你的接口地址
OPENAI_MODEL=gpt-5.5
PORT=3001
```

## macOS 启动

1. 进入目录：

```bash
cd /Users/che/projects/html/status-log-llm-demo
```

2. 安装依赖：

```bash
npm install
```

3. 启动服务：

```bash
npm start
```

也可以直接运行：

```bash
./start-mac.sh
```

## Windows 启动

1. 进入目录：

```powershell
cd C:\path\to\html\status-log-llm-demo
```

2. 安装依赖：

```powershell
npm install
```

3. 启动服务：

```powershell
npm start
```

也可以直接双击：

- `start-windows.bat`

## 启动后访问

浏览器打开：

[http://localhost:3001](http://localhost:3001)

页面里可以：

- 直接上传插件导出的完整 `.json`
- 或者粘贴完整采集 JSON

后端会自动提取 `statusLogInfo`，你不用手工挑字段。

## Windows 说明

- 这个 demo 现在不依赖 macOS 专用启动方式
- `.env` 会自动读取，不需要手工 `export`
- 只要本机有 Node.js 和 npm，Windows 可以和 macOS 用同一套代码

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

Windows PowerShell 示例：

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/analyze-status-log" `
  -Method Post `
  -ContentType "application/json" `
  -InFile ".\your-capture.json"
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
