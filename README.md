# Gym Vault V49

保留 V48 玻璃 UI 的模块化稳定版。静态 GitHub Pages 应用，无构建步骤。

- `src/catalog.js`：PPL 模板和动作名称。
- `src/core.js`：日期、解析、计划、补休判定、描述性分析。
- `src/storage.js`：按账号隔离的文档、持久队列、冲突和迁移。
- `src/sync.js`：分页读取、旧表只读导入、事务 RPC、重试。
- `src/app.js` / `styles.css`：UI 和计时。
- `vendor/supabase`：固定版本 2.49.8 的 Supabase UMD 和 MIT 许可证，随应用壳缓存，不依赖 CDN 在线加载。
- `sw.js`：离线应用壳，仅管理 Gym 缓存。
- `supabase/review`：已授权执行的 SQL 审阅快照，不要重复运行。

验证：Node 24+，先 `npm ci`，`npm test` 与 `npm run check`。本地预览：`python -m http.server 8765`。

详见 [V48 审计](docs/V48-audit.md) 和 [SQL 审核说明](docs/SQL-review.md)。数据库迁移与真实回滚集成测试已完成，旧数据完整保留。无需 service-role key 或密码写入代码。
