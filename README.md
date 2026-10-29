# 小钱 · 截图识日程

浏览器版小钱日程助手。聊天截图只在浏览器内通过 Tesseract.js 做 OCR，网页会根据截图日期和消息中的相对日期推算事件日期，并生成可导入 Apple 日历的 `.ics` 文件。

## 本地运行

```sh
npm test
npm run serve
```

打开 <http://localhost:4173>。

## 部署

这是一个无构建步骤的静态站，`main` 分支根目录通过 GitHub Pages 发布。
