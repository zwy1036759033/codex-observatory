# CODEX Observatory · 本地活动观察台

**本项目基于以下三个上游项目进行二次开发与视觉适配：**

- **[AgentCockpit / levywang](https://github.com/levywang/AgentCockpit)**（MIT）：桌面框架、控制台及原版基础场景。
- **[HALOFLUX / Ryder191](https://github.com/Ryder191/haloflux)**（源码公开，PolyForm Noncommercial 1.0.0）：光核、旋转光环、多层光束及视听设计。该项目有非商业限制，不属于可自由商用的 MIT 开源项目。
- **[prompt-spider-ui / Kirito14IT](https://github.com/Kirito14IT/prompt-spider-ui)**（MIT）：机械蜘蛛、抓取收放、词条飞行与星云动效的设计参考及适配。

本项目新增本地 Codex 活动适配、真实调用记录、已保存代码回放，以及两种视觉模式的整合与控制。上游框架和视觉设计的原创归属不因本次适配而改变。

**包含 HALOFLUX 衍生视觉的整体版本仅限非商业用途。** 各部分版权归原作者所有，详见 [许可与来源](#许可与来源)。本项目是社区适配作品，与 OpenAI 无官方隶属关系。

## 当前功能

- **两种可选视觉**：光环视觉和 AgentCockpit 原版，主标题为 CODEX。
- **两种模式均支持机械蜘蛛和星云景深**：独立开关，共享暂停与速度；可调整蜘蛛收放幅度和飞出词条密度。
- **鼠标运镜**：光环视角随鼠标平滑移动，移出后回到全景。
- **真实调用记录**：TASK FEED 显示本地 Codex 日志中已识别的工具调用、命令状态和文件变更。
- **真实代码回放**：WORKSPACE 展示确认由 Codex 修改且实际保存的源文件，不使用演示脚本填充。
- **真实项目词条**：从当前确认的代码快照提取文件名与标识符，循环向外飞出；没有可信代码来源时不编造词条。
- **重启恢复**：在正常短日志回放之外，一次性、有上限地恢复最近代码修改的来源记录，避免后续调用把代码事件挤出回放范围后词条消失。
- **本地所有 Codex 会话**：启动脚本默认不限定某个聊天；系统信息、调用吞吐与会话状态来自本地采集。

现有视觉未被替换；蜘蛛与星云是在同一场景中的可选增强层。已移除实验性的“记忆中枢”。

## 使用与构建（Windows）

需要 Windows、WebView2 Runtime、Node.js 24+、npm，以及 `go.mod` 指定的 Go 版本。当前桌面适配主要在 Windows 验证。

```powershell
npm ci
npm run build
go test ./...
node tests/project-terms-check.mjs
node tests/swarm-motion-check.mjs
node tests/framework-check.mjs
node tests/renderer-lifecycle-check.mjs
go build -tags 'desktop,production' -ldflags '-H windowsgui -s -w' -o Codex-Observatory.exe .
Copy-Item config.example.yaml config.yaml
.\start-all-sessions.cmd
```

在控制台的“视觉风格”中切换画面；蜘蛛光轨和星云景深可以分别关闭。默认以普通窗口启动，不自动锁屏。使用锁屏功能前，请自行修改本地 `config.yaml` 的 `passcode`；该功能不是 Windows 系统登录或安全边界。

`CODEX_HOME` 可指定本地 Codex 数据目录。`AGENT_COCKPIT_CODEX_THREAD` 非空时仅筛选指定会话；附带的启动脚本会清空它，并设置 `AGENT_COCKPIT_CODEX_ONLY=1`。

## 数据边界

观察台读取本机可用的 Codex 会话文件；不同 Codex 日志格式或没有落盘的事件不保证都能识别。动画是活动的视觉表达，不代表模型内部神经网络、权重、隐藏推理或真实计算进度。

代码来自实际磁盘文件；记录命令时使用经过筛选的命令标签，不复制原始命令输出。飞出词条排除字符串字面量、注释和通用语言关键字。工作区尚无可信代码、文件被删除或超出启动恢复范围时，可以暂时没有词条。恢复仅针对近期日志、额外最多读取每个日志 2 MiB；不会无限向旧聊天回溯。

本仓库不包含个人聊天记录、真实运行快照、密码配置、工作区路径、WebView2 用户目录或缓存。使用者本机运行时产生的记录和代码画面仍可能包含项目敏感信息，请自行决定是否截屏分享。诊断命令 `go run ./cmd/activity-snapshot` 的输出属于本地数据，不应提交到仓库。

## 结构与验证

- `internal/agent_watcher/`：本地事件解析、文件来源确认、真实代码预览和恢复。
- `src/components/Stage/`：原有场景、光环渲染和可选蜘蛛/星云层。
- `src/components/Panels/`：活动、代码、粒子模拟与系统信息。
- `tests/`：词条来源、动作边界、订阅清理、渲染资源释放检查。

保存代码预览限制为 128 KiB / 2048 行，词条池最多 48 项，飞行词条同时最多 96 项；增强层复用场景时钟，并清理画布和事件订阅。短时测试不能保证所有硬件上的长时间稳定性；目前不对其他系统的桌面行为作支持承诺。

## 许可与来源

| 来源 | 适配内容 | 上游许可 |
| --- | --- | --- |
| [levywang/AgentCockpit](https://github.com/levywang/AgentCockpit) | Go/Wails 桌面框架、原版控制台与基础场景 | [MIT](licenses/AGENTCOCKPIT-LICENSE.txt) |
| [Ryder191/haloflux](https://github.com/Ryder191/haloflux) | 光核、光环、多层光束与视听设计 | [PolyForm Noncommercial 1.0.0 及上游声明](licenses/HALOFLUX-LICENSE.txt) |
| [Kirito14IT/prompt-spider-ui](https://github.com/Kirito14IT/prompt-spider-ui) | 蜘蛛、探针收放、词条飞行与星云设计参考/适配 | [MIT](licenses/PROMPT-SPIDER-UI-LICENSE.txt) |

HALOFLUX by Ryder191 (RYDER CODE / Ms MAIKEBAIs CAT): https://github.com/Ryder191/haloflux

Required Notice: Copyright (c) 2026 Ryder191 (RYDER CODE / Ms MAIKEBAIs CAT) - https://github.com/Ryder191/haloflux

Required Notice: Noncommercial use only. Any commercial use is strictly prohibited. No commercial licenses are offered.

请同时保留 [LICENSE](LICENSE)、`licenses/` 中的原始版权和许可文件。整个组合版本不能按“全部 MIT、可随意商用”理解。
