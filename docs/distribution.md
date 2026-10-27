# 数据、凭证与分发边界

简体中文 | [English](distribution.en.md)

本 Skill 包装了本地产品和 Agent 工作流程，不授予第三方地图、影像或参考材料的额外许可，也不替作者选择整套产品的开源许可证。出售、开源发布和公开部署应由产品所有者另行确定条款。

- 原创应用源码尚未在此次打包中指定公共开源许可证。不要为了“可上传 GitHub”擅自添加 MIT/GPL 到整个产品。
- vendor 下附 coordtransform 与 html2canvas 原有许可证。npm 依赖通过标准包管理器获取并保留其许可证；sharp 的二进制依赖也有各自声明。
- 随包杭州矢量数据和渲染图用于现有底图回归复现，保留 OSM/OpenMapTiles 来源；数据库及派生数据按 ODbL 等适用条款处理。不要抹去页面、视频和出图中的来源署名。
- 回归测试含杭州/良渚地点样本，不包含真实用户项目；它们仍是第三方来源数据，公开分发前核对对应数据权利。
- 当前高德 JS SDK 从供应商加载，卫星影像不随包；真实搜索、查询和影像加载需要网络及使用者自己的合法凭证。
- 自备 Key、本地运行或叫“Skill”都不能自动解决商业授权或公开地图服务要求。收费和发布时重新查官方规则，不沿用某日价格。
- 排除 .local、.env、node_modules、临时下载、动态瓦片缓存、个人项目、参考 PDF、聊天历史和 AI 生成的效果预览。不要从这些文件中提取密钥帮助别人复用。

官方核对入口：
- https://developer.amap.com/pages/authorization/
- https://developer.amap.com/upgrade
- https://openfreemap.org/
- https://www.openstreetmap.org/copyright

产品当前目标是本地复现与视频验证；包本身不是经过多用户、安全、计费和运营验收的公网部署方案。

