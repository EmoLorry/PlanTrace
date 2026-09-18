# PlanTrace 一键部署说明

## GitHub 应更新的内容

必须提交：

- `src/`
- `public/`
- `index.html`
- `package.json`
- `package-lock.json`
- `vite.config.js`
- `eslint.config.js`
- `.gitignore`
- `install.bat`
- `start.bat`
- `Install-PlanTrace-From-GitHub.bat`
- `scripts/`
- `README.md`
- `DEPLOY.md`

通常不要提交：

- `node_modules/`，客户电脑执行安装脚本后自动安装
- `dist/`，这是构建产物，不是源码
- `backups/`，这是本地个人数据备份

可选提交：

- `static/`，只用于 README 截图展示；如果要让 GitHub 首页显示截图，需要提交它，或把截图移动到 `public/` 后更新 README。

## 给客户的两种安装方式

方式 A：发完整项目 ZIP。

1. 客户解压项目。
2. 双击 `install.bat`。
3. 安装完成后桌面会出现 `PlanTrace` 快捷方式。

方式 B：只发一个安装入口。

1. 把 `Install-PlanTrace-From-GitHub.bat` 发给客户。
2. 客户双击运行。
3. 脚本会从 `https://github.com/EmoLorry/PlanTrace` 的 `main` 分支下载最新源码，安装到 `%LOCALAPPDATA%\PlanTrace`，创建桌面快捷方式并启动。

## 客户电脑要求

- Windows 10/11
- 可访问 GitHub 和 npm registry
- Node.js `20.19+` 或 `22.12+`

如果客户电脑没有合适版本的 Node.js，脚本会优先尝试用 `winget` 安装 Node.js LTS；如果没有 `winget`，会打开 Node.js 下载页。

## 更新 GitHub 的建议命令

如果电脑上已经装好 Git：

```bash
git add src public index.html package.json package-lock.json vite.config.js eslint.config.js .gitignore install.bat start.bat Install-PlanTrace-From-GitHub.bat scripts README.md DEPLOY.md
git add -f static
git commit -m "Update PlanTrace installer and deployment scripts"
git push origin main
```

如果这里的项目目录不是 Git 仓库，可以重新 clone 一份 GitHub 仓库，然后把上述文件/文件夹复制进去再提交。
