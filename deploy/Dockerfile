# ---------- 构建阶段：装依赖 + 编译前端 ----------
FROM node:24-alpine AS build
WORKDIR /app

# 先只拷清单，利用 Docker 层缓存：源码改动不会触发重装依赖
COPY client/package.json client/package-lock.json ./client/
RUN npm --prefix client ci

COPY client ./client
RUN npm --prefix client run build


# ---------- 运行阶段：只带生产依赖 + 构建产物 ----------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    PV_DATA_DIR=/data

WORKDIR /app

# 后端生产依赖
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev && npm cache clean --force

# 后端源码 + 前端构建产物
COPY server ./server
COPY --from=build /app/client/dist ./client/dist

# 数据目录（SQLite 库 + 上传暂存）独立于代码，用卷挂载持久化
# 注意 chown：容器以 node 用户运行，目录必须归它所有，否则 SQLite 打不开库
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "server/index.js"]
