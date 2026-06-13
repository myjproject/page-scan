# 页面蓝本采集器

这个插件用于采集页面蓝本，适合在接入新页面或新子页时，先把页面中的数据结构和内容尽量采出来，再决定生产版应该标准化采哪些字段。

## 适用场景

- 新页面刚接入时先采集一份页面蓝本
- 还不清楚页面里有哪些数据、哪些字段值得保留时先做摸底
- 先拿到蓝本结果，再人工判断生产采集器该采哪些字段、如何标准化输出

## 如何加载

1. 打开 Chrome 的 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前仓库中的 `page-blueprint-capture` 目录

## 输出内容

- `standardized`：当前已知的标准字段
- `blueprint.page`：页面元信息
- `blueprint.summary`：当前子页摘要
- `blueprint.tables`：当前子页表格
- `blueprint.keyValueBlocks`：候选键值对
- `blueprint.textBlocks`：重要文本块样本
