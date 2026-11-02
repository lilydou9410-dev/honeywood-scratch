# Supabase正式数据库接入记录

日期：2026-11-02（日本时间）

- 项目：honeywood-scratch
- 项目ID：zuarqawunkiqgoeakdsq
- API根URL：https://zuarqawunkiqgoeakdsq.supabase.co
- 区域：ap-northeast-1
- PostgreSQL：17
- 正式迁移：honeywood_scratch_initial_schema

## 正式业务数据

| 金额 | 数量 |
| --- | ---: |
| 50円 | 150 |
| 100円 | 75 |
| 200円 | 60 |
| 300円 | 15 |

已生成300个资格码和300个唯一兑换码；未向顾客分配任何奖品。活动关闭，利用条件尚未填写。资格码只保存在私有数据库，不放在此文档或网站源码中。

原有 public.honeywood_draws、public.scratch_results 表原样保留。本次实现使用独立的 honeywood schema。

## 已完成的云端验证

1. 使用完整正式RPC实现，执行300次抽奖、相同资格重复恢复、重复初始化、重复核销及暂停后恢复，随后回滚所有测试修改。
2. 用独立测试schema复制相同实现，初始化独立测试奖池，通过6个独立PostgreSQL后端会话同时竞争共享资格和不同资格，共完成300次分配。实测300个唯一资格、300个唯一券码，150/75/60/15分布准确。
3. 6个独立请求同时核销同一测试券：最终只有1次核销、1条核销审计。
4. 正式奖池仍剩300份，已抽0份，活动关闭。
5. 普通anon/authenticated角色无法执行任何正式hw_* RPC；5个正式业务表均启用RLS。

隔离测试资源仅供本次验证，收尾时清理；正式数据不受影响。

## 尚待配置

- Supabase Auth管理员账号，目前没有任何Auth账号；需指定自己的管理员邮箱并设置登录方式。
- Netlify项目、服务器环境变量和正式HTTPS域名。
- 优惠券日文使用期限、适用商品、最低金额和併用规则。
- 正式部署后的登录、Cookie、API路由、iPhone/Android触摸与端到端验收。

不得重复运行初始建表脚本，也不得清空正式奖池来测试。Netlify尚未部署，因此本记录不代表网站已公开上线。
