# 诊断数据采集器

这个插件用于给后端诊断服务提供稳定的标准化 JSON，不保留页面蓝本输出。

## 适用场景

- 后端正式消费
- 固定 schema 的任务详情、开发机、worker 页面采集
- 不需要调试信息时直接用这版

## 如何加载

1. 打开 Chrome 的 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前仓库中的 `diagnosis-data-collector` 目录

## 输出内容

- `entityType`
- `activeTab`
- `standardized`
- `logs`（仅 RJob 日志页）
