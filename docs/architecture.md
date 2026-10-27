# 架构与产品约束

## 文件定位

| 文件 | 职责 |
|---|---|
| serve.mjs | 本机 HTTP 服务、静态白名单、地图代理、凭证保存、分析接口 |
| analysis.mjs / discovery.mjs | 输入验证、城市/范围查询、候选筛选、分级和去重 |
| basemap-service.mjs | OpenFreeMap 瓦片、动态范围缓存、SVG/PNG 栅格化 |
| sharp-runtime.mjs | 部署副本的本地 sharp 依赖 |
| dist/app.js | 搜索、确认场地、编辑状态、UI、生成及导出流程 |
| dist/core.js / analysis-data.js | 数据结构、校验、项目迁移、微调合并 |
| dist/analysis-svg.js / scene.js / basemap.js | 图例、标注、底图和共享图面渲染 |
| dist/satellite-export.js / png-export.js | 卫星捕获、PNG 合成和资源清理 |
| dist/project-storage.js | 本机存储、版本冲突与备份提示 |
| dist/workbench.css | 浮动大地图工作台；末尾桌面 1.2 倍 UI 规则 |
| tests / samples | 行为回归测试和明确命名的测试素材 |

没有独立前端构建步骤；dist 内就是可维护源码，不要把它当成随意可删的编译产物。此版本不是 React/Next 项目。

## 几何与状态

用户场地边界、地点真实定位点、文字偏移位置、城市出图范围、手动标绘是不同对象。搜索 chooseResult 只移动视角。setSiteName 同步 state.name 和 analysis.site.name。acceptDrawing 不从搜索词写入项目名。siteConfirmed 控制生成与导出资格。

以实际源代码为数据结构依据。不要只靠修改 JSON 绕过用户的边界确认。现有 GCJ-02 显示与 WGS84 数据转换必须一致；若未来迁移地图，边界、地点、瓦片和导出需要一起验证位置，不能仅换底图 URL。

## 自动识别能力

实际是查询、筛选、分级和排布地点数据，不是从影像推理功能分区。当前最多 22 个自动显示节点，最多保留 48 个候选；实际值以 discovery.mjs 为准。行政边界、真实设计边界和手动示意圈不能混称。已有手动名称、位置及隐藏状态应在匹配同一地点后保留。

## 交付与视觉

保留大地图＋浮动工具、四种风格、清晰距离圈、轻量手绘，输出单张分析图。不要自动加入大标题、整页汇报排版、AI 聊天框、登录收费系统。名称和图例随项目/行政区变化，不能硬编码杭州。

1.2 倍通过 CSS 只作用于桌面 UI，SVG 图例和比例尺不缩放，地图工作区尺寸不变。生成图像预览不能证明精确 CSS 比例。

