# Folio for MarginNote

MarginNote 4 文献管理面板。当前版本 **0.11.0**。

[下载最新版](https://github.com/cheemskc/marginnote-folio/releases/latest)

- 选择 MarginNote 内的文件夹作为文献库，包含子文件夹与嵌套目录。
- 紧凑文献条目：类型图标、单行标题、期刊分区与影响因子、作者、年份、来源、星标和打开。
- 文献详情：摘要、书目字段、编辑保存、参考文献与引文列表和来源链接。
- 搜索、多选筛选、排序；目录宽度可调整，左右栏可收起。
- 独立设置界面集中管理文件夹、Crossref / OpenAlex / easyScholar、密钥及批量补全。
- 面板四角支持拖动调整大小；窄面板切换列表与详情视图。

## 界面与数据

界面使用随插件打包的本地 React/Vite WebView，通过系统表单面板呈现。列表、详情和设置在页面内部独立滚动。无需外部网页或远程字体。

MarginNote 文件夹与文档读取、打开文献、API 请求和 JSON 持久化由原生 JSCore 层完成。页面不使用浏览器存储保存业务数据，已保存的 API Key 不回传给页面。

插件标识仍为 `com.azeedel.marginnote.paper-library`，覆盖升级可继续使用原有数据与配置。安装后完全退出并重新打开 MarginNote。

## 开发

需要 Node.js 20.19+ 或兼容的更新版本。

```sh
npm install
npm test
npm run build
```

安装包输出到 `build/marginnote-folio-v0.11.0.mnaddon`。原生脚本位于 `src/`，页面源文件位于 `web/`，构建产物在 `build/`。

## 验证范围

数据服务与桥接回归测试通过。Mac 上验证了真实文献列表、详情、滚动、系统面板呈现，以及拖动面板角落同时调整宽高；验证过程中保持不透明。iPad 真机仍需用户确认。外部数据源可能限流或缺少记录，相关错误会显示在界面中。
