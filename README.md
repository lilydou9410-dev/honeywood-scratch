# Honeywood 500 Followers Special Scratch Card

React + Netlify Functions + Supabase PostgreSQL。日本顾客使用的线上刮刮乐，含真实服务器抽奖和管理员后台。

## 当前交付状态

代码、原图素材、数据库迁移、自动测试和 Netlify 配置已完成。15 项本地自动测试、生产构建通过；桌面与 390px 手机宽度页面经浏览器检查，刮卡测试页实际鼠标刮开后可自动揭晓。

**Supabase正式项目已完成数据库迁移和300份奖池初始化；Netlify尚未部署，不能标记为已正式上线。** 详细记录见 `SUPABASE_SETUP.md`。真实Supabase数据库的隔离测试数据已完成6连接并发300次抽奖；本地30连接脚本仍未在当前环境运行成功。管理员账号和线上端到端验收尚待完成。

## 本地启动

需要 Node.js 22+：

```sh
npm ci
npm test
npm run check
npm run build
npm run dev
```

未配置后端时，页面显示准备中，不会生成假结果。可复制 `.env.example` 为 `.env`，仅在自己的受信任环境填写测试项目密钥。开发服务器代理 `/api`；正式环境由 Netlify Functions 提供相同 API。生产管理员 Cookie 强制 HTTPS，本地 HTTP 登录不会保留 Cookie，完整登录测试应在 HTTPS 测试部署进行。

开发专用视觉检查：`/tests/scratch.html`（明显标注测试券）、`/tests/responsive.html`。这些页面和测试券不会进入 `dist`，不会被正式构建发布。

## 数据库设计

迁移：`supabase/001_schema.sql`。

| 表（私有 honeywood schema） | 用途 |
| --- | --- |
| campaign | 活动是否初始化、是否开放、日文使用条件 |
| entries | 一次性资格码、哈希、发放/使用时间 |
| prizes | 固定奖池、金额、唯一兑换码、对应资格、抽奖/核销时间 |
| rate_limits | 已 HMAC 匿名化的 IP 限速桶 |
| audit | 管理员初始化、设置变更、核销审计 |

所有数据表启用 RLS，不提供任何顾客数据访问策略；撤销 anon/authenticated/PUBLIC 的表访问和 RPC 执行权限。只有服务器 service_role 能执行指定 RPC。管理员身份由服务器调用 Supabase Auth 验证，并比对环境变量邮箱白名单。页面隐藏后台入口不被当作权限保护。

抽奖事务锁定 campaign 行，将资格码验证、原结果恢复、随机选择剩余奖品、绑定奖品和标记资格使用一次提交。对于300份奖池，这种串行分配策略简单可靠。entry_id 和 coupon 唯一约束是第二重保护。服务器忽略任何前端金额输入。

同一代码换设备/浏览器也不会重新发奖；重新输入原资格码就能找回同一结果。服务端提交成功而客户端未收到响应，也使用同样恢复方式。不依赖 localStorage。

每个资格码和兑换码包含随机 UUID（约122位随机熵），不使用可枚举的顺序码。管理员 CSV 包含完整资格码，仅用于私下分发；不要公开整个 CSV。

奖池严格为：50円 ×150、100円 ×75、200円 ×60、300円 ×15。初始化仅能成功一次；重复执行不会追加奖品。不提供清空正式记录、重抽或重新初始化按钮。

## 正式 Supabase 设置

1. 当前项目 `zuarqawunkiqgoeakdsq` 已完成迁移和初始化，不要重复执行建表脚本或重新生成奖池。后续端到端测试继续使用隔离测试环境，保留正式项目的300份奖池。
2. 只有部署到全新项目时才执行 `supabase/001_schema.sql`。迁移使用事务，不会删除已有表；如果同名对象已存在会失败，应先检查，不要删原来的业务数据。
3. Data API 保留 public schema 可用；不要把 `honeywood` 添加为公开 schema。
4. 在 Authentication 创建/邀请自己的管理员账号并完成邮箱验证；本网站不提供公开注册入口。密码在 Supabase 设置，不写入代码。
5. 记录项目根 URL（`https://...supabase.co`，不是 `/rest/v1/` URL）和服务器 service_role key，后者只填 Netlify 服务器环境变量。
6. 配置管理员邮箱白名单。普通 Supabase 用户即使登录成功也不能访问后台。

## Netlify 发布

此工程含服务器函数，**不能只把 dist 拖到 Netlify Drop**，否则只有前端，没有抽奖后台。

1. 将本文件夹的工程源码放入自己的 Git 仓库，在 Netlify 导入该仓库。
2. Base directory 设为工程所在目录（工程在仓库根目录时留空）。Build command `npm run build`；Publish directory `dist`；Functions directory `netlify/functions`。`netlify.toml` 已包含这些设置和 API 路由。
3. 在 Netlify 的服务器环境变量配置以下4项，作用域至少包含 Functions，然后重新部署：

| 变量 | 填写内容 |
| --- | --- |
| SUPABASE_URL | 项目根 URL |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service_role 密钥，仅服务端 |
| ADMIN_EMAILS | 允许登录的管理员邮箱，多人用逗号分隔 |
| RATE_LIMIT_SECRET | 至少32字符的随机服务器密钥 |

4. 使用 Netlify HTTPS 域名访问 `/api/status`，应返回JSON，不应返回网页HTML。`/admin` 未登录只能看到登录页。
5. 当前正式库已生成资格码和奖池：后台登录 → 下载资格码CSV → 填写日文使用条件 → 保存开放设置。只有全新未初始化项目才需要点生成按钮。
6. 使用条件应明确有效期限、适用商品、最低购买金额、能否与其他优惠并用。不要直接用测试占位文本开放。
7. 正式库初始化后，后台必须显示奖池150/75/60/15。先停止活动确认管理数据正确，再按计划开放并私下分发资格码。

管理 Cookie 设置 HttpOnly、Secure、SameSite=Strict，最长1小时。过期后需重新登录；不在浏览器存储管理员 JWT。POST 校验同源 Origin，抽奖/登录按平台提供的客户端IP做数据库限速（每分钟15次），IP以HMAC储存，窗口超过1天后在后续请求清理。缺少必要后端配置或可信IP会拒绝操作。

## 测试与验收

```sh
npm test                  # 15项单元/API/实际SQL测试
npm run test:database     # 运行完整迁移及PL/pgSQL逻辑，使用PGlite
npm run test:concurrency  # 独立真实PostgreSQL，30连接并发（普通系统用户运行）
```

`test:concurrency` 自动创建临时本地集群并清理，不接受正式数据库地址：60次同资格并发、300名不同顾客竞争30条数据库连接、丢响应重试、20次同时核销。使用端口15439，需要本地可执行PostgreSQL二进制。GitHub Actions 已配置自动执行全部测试和构建；CI尚未实际触发，不能视作已通过。

本地PGlite测试执行的是完整真实SQL，而非用数组模拟奖池；但单连接引擎会排队执行 Promise.all，因此不等价于真正的多连接并发测试。

线上测试环境还需确认：iPhone Safari 触摸滑动、Android、桌面鼠标、刷新/换浏览器恢复、网络超时恢复、未登录管理API返回401、普通用户不能直接执行任何 hw_* RPC、并发最后一份奖品不会超发、CSV日文Excel打开、管理员Cookie过期、实际核销与二次核销。

## 业务约定

- 一次资格对应一次抽奖，而非验证一人一设备；同一顾客是否可获多个资格由Honeywood发放规则决定。
- 兑换时管理员确认订单并核销，记录数据库中的核销时间和管理员账号；重复核销被原子拒绝。有效期限等文字规则由管理员在订单核销时检查，不会自动解析日文规则判断期限。
- 不在顾客页宣传奖池总量，仅显示当前剩余名额。
- 不收集顾客姓名、地址、电话；后台记录资格码、抽奖时间、券码和核销状态。
- 原始参考图用于主视觉，角色未被重绘；蜂蜜色、木棕、奶油黄和樱花粉配色。中奖金额不同使用不同底色，300円有额外金色效果；尊重 reduced-motion 设置。

## 维护文件

- `src/main.jsx`：顾客端与管理员端
- `src/Scratch.jsx`：指针/触摸刮层，覆盖擦除约40%自动揭晓
- `netlify/functions/api.mjs`：后端API、管理员验证、同源和限速
- `supabase/001_schema.sql`：唯一初始迁移、权限、事务RPC
- `tests/`：测试和开发专用视觉检查页
- `scripts/concurrency.mjs`：真实PostgreSQL并发验证
- `TEST_REPORT.md`：此次实际执行结果与未完成项

参考官方说明：[Supabase数据库函数权限](https://supabase.com/docs/guides/database/functions)、[Netlify Functions](https://docs.netlify.com/build/functions/overview/)。
