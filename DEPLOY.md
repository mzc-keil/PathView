# PathView 启动与部署指南

前端 React + 三维渲染，后端 Express + SQLite，**单进程即可完整运行**（后端同时托管前端静态资源）。
所以部署很简单：一个 Node 进程 + 一个反向代理，不需要数据库服务、不需要消息队列。

- [一、本地怎么启动](#一本地怎么启动)
- [二、部署前必读](#二部署前必读)
- [三、方案 A：宝塔面板（图形化，最省事）](#三方案-a宝塔面板图形化最省事)
- [四、方案 B：裸机 systemd + Nginx（推荐）](#四方案-b裸机-systemd--nginx推荐)
- [五、方案 C：Docker Compose（最干净）](#五方案-cdocker-compose最干净)
- [六、数据备份、迁移与恢复](#六数据备份迁移与恢复)
- [七、日常更新发布](#七日常更新发布)
- [八、安全加固清单](#八安全加固清单)
- [九、排错速查](#九排错速查)

---

## 一、本地怎么启动

### 1. 首次准备

```bash
cd D:/mzc/softdev/pathView      # 或你 clone 下来的目录
npm run setup                    # 装三层依赖 + 构建前端，只需跑一次
```

> Node 版本要求 **≥ 22.13**（推荐 24 LTS）。用的是 Node 内置 `node:sqlite`，低版本会直接启动失败并给出提示。

### 2. 开发模式（改代码即时生效）

```bash
npm run dev
```

- 前端 http://localhost:5173 （Vite HMR）
- 后端 http://localhost:3001 （`node --watch` 自动重启）
- 前端通过 Vite 代理把 `/api` 转发到 3001，跨域已处理

也可分开启动：`npm run dev:server` / `npm run dev:client`。

### 3. 生产模式（单端口，推荐日常使用）

```bash
npm run build       # 构建前端到 client/dist
npm start           # 启动服务，默认 3001
```

打开 http://localhost:3001 即可。此时后端自动托管 `client/dist`，
未匹配的路径回落到 `index.html`（SPA 路由），`/api` 之外的 404 统一返回 JSON。

启动后终端会打印三个地址：

```
  PathView server 已启动
  本机    http://localhost:3001
  局域网  http://192.168.x.x:3001     ← 同事在同一个网段可直接访问
  前端静态资源  已托管 (client/dist)
```

### 4. 常用变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `3001` | 监听端口 |
| `PV_DATA_DIR` | `server/data` | SQLite 库与上传暂存目录 |

PowerShell：

```powershell
$env:PORT=8080; $env:PV_DATA_DIR="D:\pathview-data"; npm start
```

bash（macOS / Linux / Git Bash）：

```bash
PORT=8080 PV_DATA_DIR=/data/pathview npm start
```

服务监听 `0.0.0.0`，所以局域网内其他机器可直接访问；想只绑本机就改 `server/index.js` 里的 `app.listen`。

### 5. 数据在哪

```
server/data/
  paths.db          SQLite 主库
  paths.db-wal      WAL 预写日志（运行中必然存在，别单独删）
  paths.db-shm      共享内存索引
  uploads/          上传的 CSV 暂存（超过 24 小时自动清理）
```

**备份要连 `-wal` 一起**，或按[第六节](#六数据备份迁移与恢复)用 `.backup` / `VACUUM INTO` 导出。

---

## 二、部署前必读

| 项 | 要求 / 注意事项 |
|----|----------------|
| **Node 版本** | **≥ 22.13 / 23.4 / 24+**。低于 22.13 需要 `NODE_OPTIONS=--experimental-sqlite`。推荐 Node 24 LTS（24.15+ 该模块已升为 Release Candidate） |
| **服务器配置** | 运行 1 核 1G 足够；**远程构建建议 2 核 2G 以上**，Vite 构建峰值占用约 600MB 内存。内存不足时先加 swap，或改成本地构建后只上传 `client/dist` |
| **磁盘** | 代码 + 依赖约 300MB；数据按 CSV 规模增长，通常很小 |
| **端口** | 应用只需一个端口（默认 3001）。**安全组只放行 80/443，3001 不要对公网开放** |
| **鉴权** | ⚠️ 应用**没有登录功能**，任何人拿到地址都能看/改/删数据。公网部署务必用 Basic Auth（见 [第八节](#八安全加固清单)）或只在内网使用 |
| **上传限制** | 单个 CSV ≤ 32MB（multer `fileSize`）；JSON 请求体 ≤ 64MB；Nginx 侧 `client_max_body_size` 建议 128m |
| **并发** | SQLite 是单写者模型，同步驱动。适合小团队内部工具（几人到几十人），不适合高并发公网服务 |
| **DNS** | 没有域名也可用「公网 IP + 非标准端口」访问，但无法签 HTTPS 证书 |

### 服务器初始化（Ubuntu / Debian 通用）

```bash
# 1. 装 Node 24（国内服务器若慢，见下方镜像方案）
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v        # 应 ≥ v24

# 2. 换 npm 镜像加速（国内服务器强烈建议）
npm config set registry https://registry.npmmirror.com

# 3. 常用工具
sudo apt-get install -y nginx git curl
```

> 国内服务器访问 nodesource 慢的话，用 nvm + 淘宝镜像：
> ```bash
> export NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
> source ~/.bashrc && nvm install 24 && nvm alias default 24
> ```

### 上传代码的三种方式

```bash
# 方式 1：本仓库的部署脚本（本地一条命令搞定，见第七节）
./deploy/deploy.sh root@你的服务器IP

# 方式 2：git（需先 git init + push 到自己的仓库）
git clone <你的仓库地址> /opt/pathview

# 方式 3：rsync（本地目录直传，排除生成物）
rsync -avz --delete \
  --exclude node_modules --exclude client/dist \
  --exclude server/data --exclude .tmp --exclude .git \
  ./ root@服务器IP:/opt/pathview/
```

---

## 三、方案 A：宝塔面板（图形化，最省事）

适合不想碰命令行的情况。

1. **安装宝塔**（以 Ubuntu 为例，官网有对应命令）：

   ```bash
   wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh
   ```

2. **装 Node**：软件商店 → 搜索「Node.js 版本管理器」→ 安装 → 选择 **24.x**。

3. **上传代码**：文件 → 进入 `/www/wwwroot/` → 新建目录 `pathview` → 上传代码压缩包并解压。
   （在本地先把 `node_modules`、`client/dist`、`server/data`、`.tmp` 排除后打包，包会小很多。）

4. **构建**：宝塔「终端」里执行

   ```bash
   cd /www/wwwroot/pathview
   npm --prefix server ci --omit=dev
   npm --prefix client ci
   npm --prefix client run build
   ```

5. **添加 Node 项目**：网站 → Node 项目 → 添加
   - 项目目录：`/www/wwwroot/pathview`
   - 启动文件：`server/index.js`
   - 项目端口：`3001`
   - 运行方式：`npm start` 或直接 `node server/index.js`
   - 环境变量：`PV_DATA_DIR=/www/wwwroot/pathview-data`（数据放代码目录外，备份更省心）
   - 勾选「开机自启」

6. **反向代理 + 域名**：网站 → 添加站点 `pathview.你的域名` → 设置 → 反向代理
   - 代理名称：`pathview`
   - 目标 URL：`http://127.0.0.1:3001`
   - 发送域名：`$host`
   - 开启「缓存」**关闭**（接口数据别缓存）

7. **SSL**：站点设置 → SSL → Let's Encrypt → 申请 → 开启「强制 HTTPS」。

8. **放行端口**：宝塔「安全」+ 云厂商安全组，只放行 `80`、`443`（`3001` 不要放行）。

---

## 四、方案 B：裸机 systemd + Nginx（推荐）

最稳、资源占用最低、排错最直观。下面命令按顺序执行即可。

### 1. 建运行用户与数据目录

```bash
# 专用系统用户，不能登录
sudo useradd -r -s /usr/sbin/nologin pathview

# 代码目录 + 数据目录（数据独立于代码，升级不碰库）
sudo mkdir -p /opt/pathview /var/lib/pathview
sudo chown -R pathview:pathview /var/lib/pathview
```

### 2. 放代码并构建

```bash
cd /opt/pathview          # 用上面任一方式把代码放进来
node -v                   # 确认 ≥ 22.13

npm --prefix server ci --omit=dev
npm --prefix client ci
npm --prefix client run build

ls client/dist/index.html # 必须存在，否则第 5 步会白屏
```

> 内存 ≤ 1G 的机器若构建被 OOM 杀掉，先加 swap：
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

### 3. 先前台试跑一次

```bash
PV_DATA_DIR=/var/lib/pathview PORT=3001 NODE_ENV=production node server/index.js
```

另开一个终端验证，然后 `Ctrl+C` 停掉交给 systemd：

```bash
curl -s http://127.0.0.1:3001/api/health
# {"ok":true,"service":"pathview-server","time":"..."}
```

> 首次启动会创建 `/var/lib/pathview/paths.db`。若报权限错误，回到第 1 步确认 `chown`。

### 4. 安装 systemd 服务

仓库已备好单元文件 `deploy/pathview.service`：

```bash
sudo cp /opt/pathview/deploy/pathview.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pathview

# 查看状态与日志
sudo systemctl status pathview
sudo journalctl -u pathview -f
```

服务已配置：开机自启、崩溃 3 秒后自动重启、文件系统只读（仅 `/var/lib/pathview` 可写）。

**若要改端口或数据目录**，编辑 `/etc/systemd/system/pathview.service` 里的
`Environment=PORT=...` / `PV_DATA_DIR=...`，然后 `sudo systemctl daemon-reload && sudo systemctl restart pathview`。

### 5. 配置 Nginx 反向代理

```bash
sudo cp /opt/pathview/deploy/nginx.conf /etc/nginx/conf.d/pathview.conf
sudo nano /etc/nginx/conf.d/pathview.conf      # 把 server_name 改成你的域名或公网 IP

sudo nginx -t                                   # 语法检查，必须 OK
sudo systemctl reload nginx
```

此时访问 `http://你的域名` 就应该能看到界面。

### 6. 配置 HTTPS（有域名才需要）

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pathview.你的域名
```

certbot 会自动改好 Nginx 配置并加上 80→443 跳转，证书 90 天自动续期
（可 `sudo certbot renew --dry-run` 验证）。

### 7. 防火墙

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp        # 别把自己关在门外
sudo ufw enable
# 云厂商控制台的安全组同步放行 80/443
```

**不要去放行 3001**。Nginx 通过 `127.0.0.1:3001` 访问后端，外部无法直连。

### 8. 验收

```bash
curl -s http://127.0.0.1:3001/api/health          # 后端活着
curl -sI http://你的域名 | head -3                # 经过 Nginx 也通
curl -s http://你的域名/api/paths | head -c 200   # 接口可用
```

浏览器打开页面 → 导入一个 CSV → F12 看 Network 无红色报错 → 完成。

---

## 五、方案 C：Docker Compose（最干净）

不想在宿主机装 Node、也不想污染系统环境时选它。镜像内已含 Node 24 与全部依赖。

### 1. 装 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
docker compose version     # 确认 compose v2 可用
```

> 国内服务器拉基础镜像慢的话，配置镜像加速器后重启 Docker：
> ```bash
> sudo mkdir -p /etc/docker
> sudo tee /etc/docker/daemon.json <<'EOF'
> { "registry-mirrors": ["https://docker.m.daocloud.io", "https://dockerproxy.com"] }
> EOF
> sudo systemctl restart docker
> ```

### 2. 放代码并构建启动

```bash
cd /opt/pathview     # 代码目录（只需源码，node_modules 之类不必上传）
sudo docker compose -f deploy/docker-compose.yml up -d --build
```

### 3. 验证

```bash
sudo docker compose -f deploy/docker-compose.yml ps
# STATUS 应为 Up (healthy)

curl -s http://127.0.0.1:3001/api/health
sudo docker compose -f deploy/docker-compose.yml logs -f --tail=50
```

### 4. 接 Nginx

`docker-compose.yml` 里端口绑定是 `127.0.0.1:3001:3001`，只对本机暴露，
所以宿主 Nginx 直接复用方案 B 的配置文件即可（`deploy/nginx.conf`），然后同样跑第 5~7 步。

### 5. 常用维护命令

```bash
# 更新代码后重新发布（会自动重建镜像，数据卷不受影响）
git pull && sudo docker compose -f deploy/docker-compose.yml up -d --build

# 进容器排查
sudo docker exec -it pathview sh

# 停掉但保留数据
sudo docker compose -f deploy/docker-compose.yml down

# 连数据一起清掉（危险，删前先备份）
sudo docker compose -f deploy/docker-compose.yml down -v
```

数据存在命名卷 `pathview-data`，重建容器不会丢。查看卷位置：

```bash
sudo docker volume inspect pathview-data --format '{{ .Mountpoint }}'
```

---

## 六、数据备份、迁移与恢复

### 备份

SQLite 开了 WAL，**运行中直接 `cp paths.db` 会丢最近未 checkpoint 的事务**。用下面任一方式：

```bash
# 方式 1（推荐）：SQLite 在线备份，不停服务
sudo apt-get install -y sqlite3
sqlite3 /var/lib/pathview/paths.db ".backup '/backup/paths-$(date +%F).db'"

# 方式 2：不装 sqlite3，用 Node 直接导出（注意目标文件必须不存在）
sudo /usr/bin/node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/var/lib/pathview/paths.db');
  db.exec(\"VACUUM INTO '/backup/paths-export.db'\");
  db.close();
"

# 方式 3：停服务后整体打包（最简单，会短暂停机）
sudo systemctl stop pathview
sudo tar -czf /backup/pathview-data-$(date +%F).tgz -C /var/lib pathview
sudo systemctl start pathview
```

> Docker 部署把 `/var/lib/pathview/paths.db` 换成卷内路径，例如
> `/var/lib/docker/volumes/pathview-data/_data/paths.db`，或用
> `sudo docker exec pathview node -e "..."` 在容器内执行方式 2。

### 定时备份（每天 3:00，保留 30 天）

```bash
sudo crontab -e
```

```cron
0 3 * * * mkdir -p /backup && sqlite3 /var/lib/pathview/paths.db ".backup '/backup/paths-$(date +\%F).db'" && find /backup -name 'paths-*.db' -mtime +30 -delete
```

### 整机迁移（换服务器）

1. 新机按方案 B 第 1~4 步装好代码与服务，**先停服务**
2. 把整个数据目录带过去：

   ```bash
   # 旧机
   sudo systemctl stop pathview
   sudo tar -czf - -C /var/lib pathview | ssh 新机IP 'sudo tar -xzf - -C /var/lib'
   sudo systemctl start pathview
   # 新机
   sudo chown -R pathview:pathview /var/lib/pathview
   sudo systemctl start pathview
   ```

3. 因为数据在代码目录外，只需改 Nginx 的 `server_name` 与 DNS 解析即可

### 恢复

```bash
sudo systemctl stop pathview
sudo cp /backup/paths-2026-10-11.db /var/lib/pathview/paths.db
# WAL 残留必须清掉，否则会与新库不一致
sudo rm -f /var/lib/pathview/paths.db-wal /var/lib/pathview/paths.db-shm
sudo chown pathview:pathview /var/lib/pathview/paths.db
sudo systemctl start pathview
```

---

## 七、日常更新发布

### 一键脚本（推荐）

仓库自带 `deploy/deploy.sh`：本地类型检查 → 打包 → 上传 → 远程装依赖构建 → 重启 → 健康检查。

```bash
# 目标机需先按方案 B 配好 systemd，或装好 pm2
./deploy/deploy.sh root@1.2.3.4
./deploy/deploy.sh ubuntu@10.0.0.5 /srv/pathview 8080   # 自定义目录与端口
```

首次使用记得加执行权限：`chmod +x deploy/deploy.sh`。

### 手动发布

```bash
# 服务器上
cd /opt/pathview
git pull                                     # 或重新上传代码
npm --prefix server ci --omit=dev
npm --prefix client ci
npm --prefix client run build
sudo systemctl restart pathview
curl -s http://127.0.0.1:3001/api/health
```

Docker 则 `sudo docker compose -f deploy/docker-compose.yml up -d --build`。

### 回滚

代码目录用 git 的就 `git checkout <上一个版本> && npm run build && sudo systemctl restart pathview`；
数据回滚参考上一节的「恢复」。**代码与数据分开，是这套部署最核心的一点。**

---

## 八、安全加固清单

按重要性排序，前两条务必做：

- [ ] **加访问控制**。应用无登录功能，公网裸奔等于把数据公开。Nginx Basic Auth 最快：

  ```bash
  sudo apt-get install -y apache2-utils
  sudo htpasswd -c /etc/nginx/.htpasswd 你的用户名    # 会提示输入密码
  ```

  然后取消 `deploy/nginx.conf` 里 `auth_basic` 两行的注释，`sudo nginx -t && sudo systemctl reload nginx`。
  更正式的做法是把服务放到内网 / VPN / 跳板机之后。

- [ ] **只用 HTTPS**。certbot 签完证书后禁用明文访问，避免 CSV 内容与令牌被中间人抓取。

- [ ] **关掉不必要的端口**。安全组只留 22 / 80 / 443；3001 只监听 `127.0.0.1`（compose 已如此，systemd 方案靠 Nginx 反代隔离，建议再用 ufw 明确拒绝 3001）。

- [ ] **限制 CORS**。现在 `server/index.js` 是 `app.use(cors())`，等于允许任意站点跨域调 API。
  若前端与 API 同域（本文所有方案都是同域），可以整行删掉；若需保留，改成白名单：

  ```js
  app.use(cors({ origin: ['https://pathview.你的域名'] }));
  ```

- [ ] **上传体积与类型**。已有 32MB 单文件上限和 20 万行解析上限；如需更严可下调 `server/routes/paths.js` 里的 `limits.fileSize`。

- [ ] **定期升级系统与 Node**：`sudo apt update && sudo apt upgrade -y`；Node 跟随 24 LTS 小版本更新。

- [ ] **定期备份并演练恢复**（第六节），只备份不演练等于没有备份。

---

## 九、排错速查

| 现象 | 原因与处理 |
|------|-----------|
| 启动报 `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` 或本项目的中文版本提示 | Node 版本过低。升到 22.13+ / 23.4+ / 24+；临时可用 `NODE_OPTIONS=--experimental-sqlite` 启动 |
| 页面白屏、`/` 返回 404 或 JSON | `client/dist/index.html` 不存在 → 在服务器执行 `npm --prefix client run build` |
| Nginx 报 `502 Bad Gateway` | 后端没起来。`sudo systemctl status pathview` / `journalctl -u pathview -n 50`；确认端口与 `proxy_pass` 一致（`ss -lntp \| grep 3001`） |
| 上传 CSV 报 413 | Nginx `client_max_body_size` 太小，改成 `128m` 后 reload；注意单文件硬上限是 32MB |
| 页面能开但接口 404，且返回 HTML | API 路径没走对代理。确认 Nginx 有 `/api/` 的 location，且没被前面更宽泛的规则截走 |
| 数据「凭空消失」 | 多数是 `PV_DATA_DIR` 变了（systemd / pm2 / docker 里配的不一致）。统一成一个路径，旧库仍在原目录，拷过去即可 |
| 构建时被 Killed / OOM | 机器内存不足，加 swap（方案 B 第 2 步）或改成本地构建后上传 `client/dist` |
| 端口被占用 `EADDRINUSE` | `sudo ss -lntp \| grep 3001` 找到进程，换端口或停掉它 |
| 改了 `pathview.service` 不生效 | 忘记 `sudo systemctl daemon-reload` |
| 三维画面卡顿 | 点数很多时正常。调低点尺寸、关掉「全部姿态轴」与参考网格；`Ctrl+框选` 隐藏远处点 |
| 导出 CSV 打不开 / 乱码 | 导出已带 UTF-8 BOM，Excel 直接双击即可；WPS 若仍乱码，用「数据→从文本导入」选 UTF-8 |
| 忘记 Basic Auth 密码 | `sudo htpasswd /etc/nginx/.htpasswd 用户名`（不带 `-c`，不会清空已有用户）重设 |

### 快速自检命令

```bash
node -v                                                   # ≥ 22.13
curl -s http://127.0.0.1:3001/api/health                  # 后端
sudo systemctl status pathview --no-pager                 # 进程
sudo journalctl -u pathview -n 50 --no-pager              # 日志
sudo nginx -t                                             # Nginx 语法
ls -l /opt/pathview/client/dist/index.html                # 前端产物
ls -l /var/lib/pathview/                                  # 数据目录
```

---

## 附：三种方案怎么选

| | 宝塔 | systemd + Nginx | Docker Compose |
|---|---|---|---|
| 上手难度 | 最低（图形化） | 中（复制粘贴命令） | 低（命令少） |
| 资源占用 | 面板本身占 100MB+ | 最低 | 多约 50MB |
| 可控性/可迁移 | 一般 | 最好 | 最好 |
| 需要装 Node | 面板装 | 手动装 | 不用（镜像内置） |
| 适合 | 快速上线、不熟命令行的运维 | 长期稳定运行、生产环境 | 多环境一致、想隔离依赖 |

**建议**：个人/小团队长期用选 **方案 B**；想省事、机器上本来就有宝塔选 **A**；服务器上跑了很多别的东西、怕依赖冲突选 **C**。
