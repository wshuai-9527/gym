# Supabase SQL 审核清单

这些脚本尚未执行。

1. `000_preflight.sql`：只读检查字段、RLS、索引、扩展、重复日期、孤儿组和账号不一致。先核验实际 schema；异常数据不得自动删除。
2. `001_documents.sql`：新增 `gym_documents`（记录/草稿/设置、版本、墓碑）与 `gym_mutations`（幂等收据），增加以 auth.uid 和明确 owner 验证的事务 RPC。用户仅能读取自己的文档，写入须经 RPC。不改动旧表。真实训练记录导入由用户登录后的前端完成；同日期旧数据不一致先解决，旧表继续保留。
3. `002_auto_rest.sql`：新增受限服务器函数与每天 16:05 UTC（Brisbane 02:05）执行的 cron。用户开启后，只补昨天、保护云端已编辑或勾选草稿，尊重现有记录与删除墓碑。必须预先启用 pg_cron。本脚本不自行启用扩展。

风险与边界：关闭/离线设备未上传的草稿服务器不可见；恢复联网时会生成同日期冲突让用户选择，不能悄悄覆盖。固定 Brisbane 时区，旅行不会自动跟随定位。新记录文档为 JSON 格式，其他直接读取旧两表的工具不会看到 V49 后的新写入。变更历史日期为两个有持久重试的操作，非跨日期单事务；先创建新日期再删除旧日期，临时可能存在重复而不会先丢失唯一记录。

批准后顺序：只读审计 → 如需调整先重审 SQL → 001 → 使用测试账号验证 A/B 权限隔离、重复 mutation、版本冲突、离线重试、账号切换和旧表迁移 → 002 → 确认定时任务与草稿保护 → 手机浏览器回归 → 合并发布。

回退：先停止 `gym-v49-auto-rest` cron，再回退前端提交。保留 V49 新表和导出 JSON；旧训练表一直未改，但回到 V48 不会展示 V49 新记录，需先导出/转换，不能直接 drop 新表回退。幂等收据不自动清理，以保护长时间离线重试，后续增长可单独设计保留策略。

参考：https://supabase.com/docs/guides/database/functions 、https://supabase.com/docs/guides/database/postgres/row-level-security 、https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API 。
