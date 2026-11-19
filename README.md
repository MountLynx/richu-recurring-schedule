# 日序 · 周期任务日程

周期任务日程管理 Web 应用。前端使用原生 HTML、CSS、JavaScript，后端为 Node.js 原生 HTTP 薄服务，数据持久化到 SQLite，并带有账户登录与用户级数据隔离。

## 环境

- Node.js 24 或更高版本（使用内置 `node:sqlite`，无需安装数据库或第三方依赖）

## 启动

```bash
npm start
```

浏览器打开 `http://localhost:4173`，首次使用请先注册账户。

可选环境变量：

```bash
PORT=8080 HOST=0.0.0.0 DB_PATH=./data/my-schedule.db npm start
```

默认数据库文件：`data/schedule.db`。

## 用户系统与数据隔离

- 支持注册、登录、退出登录。
- 密码使用随机盐 + `scrypt` 派生哈希保存，不存储明文密码。
- 会话令牌生成后仅以 SHA-256 哈希形式写入 SQLite，浏览器端使用 `HttpOnly`、`SameSite=Lax` Cookie。
- 每个事项通过 `user_id` 归属到具体用户。
- 查询、创建、编辑、删除、完成操作全部在服务端按当前会话用户过滤，用户之间无法读取或修改彼此的数据。
- 登录和注册接口有基于 IP 的频率限制。
- 写接口启用同源检查，配合 `SameSite` Cookie 降低 CSRF 风险。
- 所有接口输入都在服务端校验，SQL 使用预编译参数。

## 功能

### 事项类型

1. **固定间隔**
   - 根据开始日期和间隔天数计算出现日期。
   - 例如：每日、每 2 日、每 3 日，事项会落在对应日期。

2. **区间完成**
   - 每 N 天构成一个完成区间，事项在区间内完成。
   - **连续进行**：贯穿整个区间，适合持续性任务。
   - **灵活完成**：可在区间内任意一天完成。
   - 周视图中会以跨天色条表示区间范围。

3. **单日事项**
   - 在单日视图中创建，只在该日期出现一次，不重复。
   - 可以在日视图中直接添加并勾选完成。
   - 月视图与周视图会以单日样式进行视觉展示。

### 视图

- 月视图：42 格完整月历，展示每个日期发生的事项，点击日期进入单日视图。
- 周视图：7 列周面板，非重叠事项会合并到同一行显示；区间事项跨列展示。
- 单日视图：查看当天所有事项，并显示区间任务的当前进度（第 N 天 / 区间总天数）。
  - 可以添加仅在当天出现的单日事项。
  - 可以勾选事项完成或取消完成。
  - 固定事项按当天这一“次”记录完成状态。
  - 区间事项按整个完成区间记录，勾选后区间内每一天都会显示为已完成。
  - 支持配置时间点，时间点以横向分隔线呈现。
  - 事项可以拖动到任意时间点区间。
  - 周期事项的区间位置保存在事项本身，拖动后会同步到所有日期。
  - 新建事项默认位于第一个时间点上方。
  - 时间点默认使用 `09:00 / 12:00 / 18:00 / 21:00`，每个用户独立配置。
- 月视图与周视图只做完成状态的视觉展示，不提供勾选操作。

### 其他

- SQLite 持久化：所有新增、编辑、删除操作都通过后端 API 写入数据库。
- 侧栏今日总览：展示今天的完成进度、最早三项未完成事项、区间剩余天数和「查看今日」入口。
- 响应式布局，支持桌面与移动端。

## API

### 账户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册并登录 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 退出当前会话 |
| GET | `/api/auth/me` | 获取当前登录用户 |

注册请求体：

```json
{ "username": "your_name", "password": "at-least-8-chars" }
```

### 事项

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/tasks` | 获取当前用户的全部事项 |
| POST | `/api/tasks` | 新建当前用户的事项 |
| PUT | `/api/tasks/:id` | 更新当前用户的事项 |
| DELETE | `/api/tasks/:id` | 删除当前用户的事项 |
| PUT | `/api/tasks/:id/completion` | 标记/取消某次事项完成状态 |
| GET | `/api/time-points` | 获取当前用户的时间点配置 |
| PUT | `/api/time-points` | 替换当前用户的时间点配置 |
| PUT | `/api/tasks/:id/slot` | 更新事项所在的时间区间 |

事项字段：`title`、`startDate`（单日事项的日期或周期事项的开始日期）、`interval`（固定/区间事项为 1–365 天，单日事项固定为 1）、`color`、`note`、`type`（`fixed` / `window` / `once`）、`windowMode`（`continuous` / `flexible`，仅区间事项使用）、`timeSlot`（时间点区间索引，0 表示第一个时间点上方）。

完成状态保存在 `task_completions` 表中，使用 `{ date, completed }` 请求体；固定事项以日期作为 occurrence key，区间事项以当前区间的开始日期作为 occurrence key。

时间点配置请求体：

```json
{ "timePoints": ["09:00", "12:00", "18:00"] }
```

拖动事项后的区间更新请求体：

```json
{ "slot": 2 }
```

其中 `slot: 0` 表示第一个时间点上方，`slot: 1` 表示第一个与第二个时间点之间，以此类推。

## 云服务器部署建议

- 使用 Nginx/Caddy 等反向代理提供 HTTPS，并将 Node 服务监听在 `127.0.0.1` 上。
- 启用 HTTPS 后设置 `COOKIE_SECURE=1`，确保会话 Cookie 只通过 HTTPS 传输。
- 如果反向代理传递了 `X-Forwarded-Proto`、`X-Forwarded-Host` 和 `X-Forwarded-For`，设置 `TRUST_PROXY=1`，以正确识别协议和客户端 IP。
- 不要将 `data/schedule.db` 暴露为静态文件；服务端已限制只能访问 `index.html`、`styles.css` 和 `app.js`。
- 旧版本数据库升级时，如确认只有一个可信用户并希望把旧的未归属事项交给首个注册账户，可在首次注册时临时设置 `CLAIM_LEGACY_TASKS=1`，完成后移除该变量。

示例生产启动：

```bash
HOST=127.0.0.1 PORT=4173 COOKIE_SECURE=1 TRUST_PROXY=1 npm start
```

## 项目文件

- `server.js`：静态文件服务、认证系统、REST API 与 SQLite
- `index.html`：页面结构与登录界面
- `styles.css`：界面样式
- `app.js`：日历、周期计算、认证交互与前后端通信
- `data/schedule.db`：运行后自动生成的 SQLite 数据库，包含用户、事项、完成记录、时间点与会话数据
