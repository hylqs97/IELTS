# IELTS 备考记录器

一个本地运行、浏览器查看的雅思备考记录工具：

- Node.js 本地服务
- 单一 JSON 文件存储（`data/ielts-log.json`）
- GitHub Contributions 风格 52 周热力图（按每日总训练分钟数）
- 月历视图 + 列表视图
- 点击日期后在右侧栏查看/录入
- 记录字段默认可空（仅日期和记录类型必需）

## 数据结构

`data/ielts-log.json` 示例：

```json
{
  "meta": {
    "lastViewMode": "contributions"
  },
  "entriesByDate": {
    "2026-06-22": [
      {
        "id": "...",
        "entryType": "practice",
        "title": "口语练习",
        "section": "Part 2",
        "source": null,
        "durationMinutes": 30,
        "totalScore": null,
        "listeningScore": null,
        "readingScore": null,
        "writingScore": null,
        "speakingScore": null,
        "note": "练了半小时",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  },
  "updatedAt": "..."
}
```

## 快速开始

已从当前仓库内容确认到项目初始只有 `LICENSE`，下面是最小启动步骤：

```bash
cd /home/karl-hou/IdeaProjects/IELTS
npm install
npm start
```

然后打开：`http://localhost:3000`

## 测试

项目包含一个最小烟雾测试（会启动临时端口、调用 API 并校验核心行为）：

```bash
cd /home/karl-hou/IdeaProjects/IELTS
npm test
```

## 视图说明

- `52周热力图`：固定分钟阈值 `0 / 1-30 / 31-60 / 61-120 / 120+`
- `月历视图`：按月浏览与点击日期
- `列表视图`：最近 30 天有记录的日期汇总
- 顶部 Tab 会记住上次视图偏好

## 同步建议

因为所有数据都在 `data/ielts-log.json`，可以通过以下方式同步：

1. Git 私有仓库（注意处理并发修改冲突）
2. 网盘同步（建议开启历史版本）
3. 手动备份该 JSON 文件

如果出现多设备同时改动，优先保留较新的 `updatedAt` 文件，再人工合并冲突日期下的数组。

