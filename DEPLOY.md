# PlanTrace 一键部署说明

## Vite 在项目里的作用

Vite 是 PlanTrace 的本地开发服务器和构建工具：

- 启动本地网页应用：`npm run start` 会运行 Vite，并打开 `http://localhost:5173`
- 支持 React 热更新：改代码后页面可以快速刷新
- 打包发布资源：`npm run build` 会生成 `dist/`
- 承载本地接口：本项目在 `vite.config.js` 里额外加了 `/api/backup`、`/api/update/check`、`/api/update/apply`，用于备份和一键更新

Vite 不是数据库。用户任务、主题、日记索引等仍保存在浏览器本地数据、用户选择的日记文件夹或 `backups/` 里。

## GitHub 应提交的内容

必须提交：

- `.gitattributes`
- `src/`
- `public/`
- `scripts/`
- `index.html`
- `package.json`
- `package-lock.json`
- `vite.config.js`
- `eslint.config.js`
- `.gitignore`
- `install.bat`
- `start.bat`
- `Install-PlanTrace-From-GitHub.bat`
- `Update-PlanTrace.bat`
- `Install-PlanTrace-From-GitHub-Windows.bat`
- `Update-PlanTrace-Windows.bat`
- `Start-PlanTrace-Windows.bat`
- `Install-PlanTrace-Local-Windows.bat`
- `Install-PlanTrace-From-GitHub-macOS.command`
- `install-macOS.command`
- `start-macOS.command`
- `Update-PlanTrace-macOS.command`
- `README.md`
- `DEPLOY.md`
- `LICENSE`

通常不要提交：

- `node_modules/`，客户电脑执行安装脚本后会自动安装
- `dist/`，这是构建产物，不是安装必需源码
- `backups/`，这是本地个人数据备份

可选提交：

- `static/`，只用于 README 截图展示

## 给客户的安装方式

### Windows 10/11

推荐只发一个入口：

1. 发 `Install-PlanTrace-From-GitHub-Windows.bat`
2. 客户双击运行
3. 脚本会从 GitHub 下载最新版，安装到 `%LOCALAPPDATA%\PlanTrace`，安装依赖，创建桌面快捷方式并启动

兼容入口仍然保留：

- `Install-PlanTrace-From-GitHub.bat`
- `install.bat`
- `start.bat`
- `Update-PlanTrace.bat`

它们会自动转到新的 Windows 后缀脚本，不会影响老用户。

### macOS

推荐只发一个入口：

1. 发 `Install-PlanTrace-From-GitHub-macOS.command`
2. 客户双击运行
3. 脚本会从 GitHub 下载最新版，安装到 `~/Applications/PlanTrace`，安装依赖，创建桌面启动器并启动

如果 macOS 提示“无法打开”或“没有权限”，让客户执行一次：

```bash
chmod +x Install-PlanTrace-From-GitHub-macOS.command
```

如果是完整 ZIP 安装，客户解压后双击：

- Windows：`install.bat`
- macOS：`install-macOS.command`

## 客户电脑要求

Windows：

- Windows 10/11
- 可访问 GitHub 和 npm registry
- Node.js `20.19+` 或 `22.12+`
- 如果没有 Node.js，脚本会优先用 `winget` 自动安装；没有 `winget` 时会打开 Node.js 下载页

macOS：

- macOS 12+ 建议
- 可访问 GitHub 和 npm registry
- Node.js `20.19+` 或 `22.12+`
- 如果没有 Node.js，脚本会优先用 Homebrew 安装；没有 Homebrew 时会打开 Node.js 下载页

## 更新方式

Windows：

- 软件内点击更新按钮
- 或双击 `Update-PlanTrace-Windows.bat`
- 旧入口 `Update-PlanTrace.bat` 仍可用

macOS：

- 软件内点击更新按钮
- 或双击 `Update-PlanTrace-macOS.command`

所有更新方式都会保护：

- 浏览器 localStorage 用户数据
- 日记文件夹数据
- `backups/` 备份目录

## 跨平台注意事项

`.gitattributes` 已经统一换行策略：

- `.bat`、`.ps1` 使用 CRLF
- `.command`、`.sh`、`.js`、`.jsx`、`.json`、`.md` 使用 LF

路径处理原则：

- Vite 和 Node 代码里统一使用 `path.join()` / `path.resolve()`
- npm 脚本不使用 Windows 专属 `set NODE_ENV=...`
- 软件内更新会按系统选择命令：Windows 用 PowerShell 解压，macOS 用 `unzip`
- macOS/Linux 对文件名大小写更严格，提交前建议运行一次构建检查

## 建议提交命令

如果当前目录是 Git 仓库：

```bash
git add .gitattributes src public scripts index.html package.json package-lock.json vite.config.js eslint.config.js .gitignore README.md DEPLOY.md LICENSE
git add install.bat start.bat Install-PlanTrace-From-GitHub.bat Update-PlanTrace.bat
git add Install-PlanTrace-From-GitHub-Windows.bat Update-PlanTrace-Windows.bat Start-PlanTrace-Windows.bat Install-PlanTrace-Local-Windows.bat
git add Install-PlanTrace-From-GitHub-macOS.command install-macOS.command start-macOS.command Update-PlanTrace-macOS.command
git add -f static
git update-index --chmod=+x Install-PlanTrace-From-GitHub-macOS.command install-macOS.command start-macOS.command Update-PlanTrace-macOS.command scripts/*.sh
git commit -m "Add macOS installer and cross-platform updater"
git push origin main
```

如果这里不是 Git 仓库，就重新 clone GitHub 仓库，然后把上述文件复制进去再提交。
