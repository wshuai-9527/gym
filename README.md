# Gym Vault · V53

移动优先的训练记录应用，部署在 GitHub Pages，Supabase 提供账号与文档同步。日期固定 Australia/Brisbane。

## V53

按最近同动作逐组预填重量/次数/时长，显示日期与原始记录；腿日保留负重分腿蹲和哑铃臀桥，优先减少组数。详见 `docs/V53-history-informed-plan.md`。

## V52

根据用户补充，保留自重保加利亚分腿蹲和平板支撑；每次腿部4组、核心6组。V49/V50/V51在练草稿保留原动作映射。

## V51

腿＋核心轻量模板、320/375/430px手机样式与自重/计时记录；旧草稿与历史保留。详见 `docs/V51-leg-core-mobile.md`。

## V50

- 紧凑训练表格、每动作操作说明、上次重量；历史支持日期/动作搜索与模块筛选。
- 版本化训练模板：新 Pull 用单臂哑铃划船；中肩侧平举、后肩反向飞鸟分开。旧草稿保留旧动作映射，完成或清空后采用 V50。
- 按 2026-10-18 为固定锚点，每 3 个 Brisbane 自然日结算报告。App 打开时从真实历史派生；历史修订会重算，未记录不视为休息。无后台通知承诺。
- 训练计划核查、同动作统计口径与 ACSM 2026 依据见 `docs/V50-design-and-training.md`。
- 包含上轮未上线的日期/闪动修复；不再在当天归档后自动跳明天，同步无数据变化时不重建训练节点。

## 开发

Node 24：`npm ci` → `npm test` → `npm run check`。纯静态 ES modules，无构建步骤。`src/app.js` 处理 UI，`core.js` 处理日期/训练规则，`catalog.js` 管理模板，`reports.js` 计算报告，`storage.js` 保留队列/墓碑，`sync.js` 执行版本化 RPC。

## 数据

旧 training_days / training_sets 保留；gym_documents 是 V49+ 文档与版本同步层。公开客户端仅含 publishable key。离线数据先存本机，联网后事务确认。账号隔离、版本冲突和删除恢复由同步层处理。不要清除浏览器数据代替同步。

本次 V50 前端升级无新 SQL。`supabase/review` 是过往授权变更的历史记录，不是应重新执行的安装脚本。
## V54 手机与持久登录

适配 iPhone 16 Pro Max 的 440px 竖屏布局、安全区与大号训练输入。已登录隐藏密码框，沿用原会话自动恢复和续期；退出只影响当前设备。详见 [V54 说明](docs/V54-phone-session.md)。
