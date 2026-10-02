# Supabase V49 数据库变更记录

用户于 2026-10-02 批准全部操作；已核验真实结构并执行。

- `000_preflight.sql`：只读结构/权限/一致性检查。无重复日期、孤儿组或账号不一致。
- `001_documents.sql`：文档存储、版本/墓碑、事务同步。内部收据与特权 helper 位于非 API schema gym_private；公开 RPC 用 SECURITY INVOKER，helper 严格验证 auth.uid、owner、负载与 expected version。前端无 service-role key。
- `003_import_and_harden.sql`：完整复制旧历史及原始组元数据，保留旧表；补休默认延续 V48 开启状态，从部署日起生效；整理重复 RLS 策略，收紧内部函数权限，增加组关联索引。
- `002_auto_rest.sql`：启用 pg_cron，部署受限定时任务，Brisbane 02:05 补记昨天，无多年历史回填。草稿进度、已记录日和删除墓碑均受保护。
- 内部收据增加明确拒绝直接访问的 RLS 策略；authenticated 无表权限，仅经严格 RPC 操作。

迁移由 Supabase 记录在 migration history。review 目录是审阅/复现快照，不应手动重复运行已执行脚本。详见 validation.md 的真实回滚测试。

新记录文档为 JSON；其他直接读取旧两表的工具不会看到 V49 新写入。历史改日期先创建目标再删除来源，两项都有持久重试，临时可能重复，避免先丢失唯一副本。旧记录 note、原始组、multiplier、更新时间等保留在 legacy 元数据。

回退：先停止 gym-v49-auto-rest cron，再回退前端。保留新表、收据和 JSON 备份；旧两表仍完整，但 V48 不会展示 V49 新写入，不能直接 drop 新表。幂等收据暂不自动清理，保护长期离线重试。

参考：https://supabase.com/docs/guides/database/functions 、https://supabase.com/docs/guides/database/postgres/row-level-security 、https://supabase.com/docs/guides/cron 。
