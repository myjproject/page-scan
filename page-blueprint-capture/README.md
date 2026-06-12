# 页面蓝本采集器

这个插件用于探索页面结构，适合接入新页面时先看“页面里到底有什么”。

## 适用场景

- 新页面刚接入时做结构摸底
- 查看当前子页有没有表格、键值对、文本块
- 为生产采集器补规则前先拿蓝本

## 如何加载

1. 打开 Chrome 的 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择 `/Users/che/projects/html/page-blueprint-capture`

## 输出内容

- `standardized`：当前已知的标准字段
- `blueprint.page`：页面元信息
- `blueprint.summary`：当前子页摘要
- `blueprint.tables`：当前子页表格
- `blueprint.keyValueBlocks`：候选键值对
- `blueprint.textBlocks`：重要文本块样本

## 如何加载

1. 打开 Chrome 的 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择 `/Users/che/projects/html/page-blueprint-capture`
