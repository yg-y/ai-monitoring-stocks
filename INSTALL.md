# 装到其他电脑的 DeepSeek Harness

本插件是一个**纯 JS 的 Cordis bundle**：没有依赖、没有构建步骤、没有原生模块，所以迁移成本只在「怎么把这个目录放进目标机的 profile」。

| 项 | 说明 |
| --- | --- |
| 包名 | `@local/ashare-radar`（本地包，不发布也能用） |
| 版本 | 0.1.0 |
| 开发验证环境 | DSH 0.2.2-rc.1，Desktop profile（`~/.dsh/profiles/desktop`） |
| 运行依赖 | 无（`dependencies` 为空） |
| 宿主服务 | `webServer`（HTTP 路由）、`tools`（Agent 工具）；`llm` + `agentDefaultModel`（AI 分析，缺失时该面板降级）；`connection`（POST 路由鉴权，缺失时放行） |
| 客户端 | 走 Harness 的 Web UI，仅用 `slots` / `locale` / React |
| 外部数据 | 东方财富、雪球（公开行情），需要能出网 |

## 路线 A：拷贝目录（推荐，已实测）

1. 把整个 `ashare-radar/` 目录拷到目标机，例如 `~/plugins/ashare-radar`。
2. 在目标机的任意 Harness 会话里，让 Agent 安装这个绝对路径：

   ```
   plugin_manager  install_bundle  target=/Users/<you>/plugins/ashare-radar
   ```

   等价于在本机执行的这一步：`application: applied` 表示已生效。
3. 刷新 Web 页面，侧栏出现「A股盯盘」图标。

> 安装后 profile 里只是多了一条 `link:` 依赖指向该目录。**目录别删**，删了插件就没了；要更新就改目录里的文件，然后重新启用一次。

## 路线 B：用打好的 tarball

每个 tag 会由 GitHub Actions 自动构建 tgz 并附到 Release，所以最省事的是直接从 Release 装：

```
plugin_manager  install_bundle  target=https://github.com/yg-y/ai-monitoring-stocks/releases/download/v0.1.0/local-ashare-radar-0.1.0.tgz
```

底层是 pnpm，接受 URL 形式的 `file:` 规格。想先落盘再装：

```bash
curl -LO https://github.com/yg-y/ai-monitoring-stocks/releases/download/v0.1.0/local-ashare-radar-0.1.0.tgz
plugin_manager  install_bundle  target=./local-ashare-radar-0.1.0.tgz
```

解包安装（不依赖「安装目标可以是压缩包」这个特性）：

```bash
mkdir -p ~/plugins && tar -xzf local-ashare-radar-0.1.0.tgz -C ~/plugins
mv ~/plugins/package ~/plugins/ashare-radar
```

也可以直接按 git 源装（跟随 main 分支，或钉到 tag）：

```
plugin_manager  install_bundle  target=github:yg-y/ai-monitoring-stocks#v0.1.0
```

## 路线 C：走 registry（多台机器时最省事）

1. 把 `package.json` 里的 `name` 改成你自己的作用域，例如 `@yourname/ashare-radar`，`version` 按需递增。
2. 发布到 npm 或公司私有源：`pnpm publish`。
3. 目标机直接按包名安装：

   ```
   plugin_manager  install_bundle  target=@yourname/ashare-radar@0.1.0
   ```

这条路的好处是升级只要改版本号，卸载一条命令。

## 装完自检（30 秒）

| 检查 | 期望 |
| --- | --- |
| 侧栏 | 出现「A股盯盘」图标，点开是整页面板 |
| 指数条 | 五个指数有价格与涨跌幅（说明 `webServer` 路由已挂上） |
| 个股详情 | 点自选股能出分时图、盘口、资金、消息面（说明 `/detail`、`/flow`、`/news` 正常） |
| 板块 | 点推荐板块能出成分股（`/board`） |
| AI 分析 | 点「开始分析」能流式出六维卡片；返回「还没有设置默认模型」说明目标机未配置模型 |

## 目标机需要满足的前提

1. **Harness 是 bundle 型 profile**：`dsh web` 或 Desktop 默认都是；纯 headless 的 `dsh-headless` profile 没有 webServer，面板与路由都不会出现（Host 侧工具仍可用）。
2. **能访问行情源**：`push2*.eastmoney.com`、`flash-api.xuangubao.cn`、`searchapi.eastmoney.com`。公司网络若拦截，面板会显示错误条而不是白屏。
3. **AI 分析用目标机自己的模型与凭据**：不共享这台机器的 key。目标机 `agentDefaultModel` 没配置就只影响 AI 面板。
4. **端口暴露**：`/ashare-radar/api/*` 的 GET 路由注册在 bare `webServer` 上（和插件市场同一层），如果目标机以 `dsh web --host 0.0.0.0` 绑定到局域网，同网段的人也能读到这些行情数据；`POST /analyze` 走主机请求闸门，未登录会被 403。仅本机使用时可忽略。

## 升级与卸载

```bash
# 升级：替换目录内容后重新启用（模块是 ESM，需要一次重载）
plugin_manager  set_plugin  target=include:ashare-radar  enabled=false
plugin_manager  set_plugin  target=include:ashare-radar  enabled=true

# 卸载
plugin_manager  remove_bundle  target=@local/ashare-radar
```

## 手工兜底（不推荐）

不想走插件管理器时，也可以手工做它替你做的两件事：

1. 目标 profile 的 `package.json` 里加依赖 `"@local/ashare-radar": "link:/abs/path/ashare-radar"`，并把它加进 `dsh.profile.bundles`；
2. 在 profile 目录 `pnpm install`。

这需要直接改 profile 的清单文件，插件管理器每次安装都会重写这些字段，**除非你明确知道后果，否则优先用 `install_bundle`**。

## 另一种玩法：一台机器托管，多台电脑用浏览器看

如果目的只是「多台电脑看同一个面板」，不必每台都装：

1. 只在**一台**机器上装插件（按上文任一路线）；
2. 这台机器以局域网可访问的方式启动：`dsh web --host 0.0.0.0`（按需配 `--trusted-host`）；
3. 其他电脑用浏览器打开这台机器的地址即可，面板、路由、AI 都在服务端跑。

代价是：所有访问者共用服务端的模型额度，且上面「端口暴露」一节的提醒在这里更重要——行情 GET 路由对同网段可读。纯本地看盘，一台机器装一次就够。
