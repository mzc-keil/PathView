// PM2 进程配置：pm2 start deploy/ecosystem.config.cjs
//
// 与 systemd 二选一即可。PM2 的好处是日志轮转、`pm2 monit` 现成；
// systemd 的好处是不用额外装东西。本文件也可被 deploy.sh 直接调用。

module.exports = {
  apps: [
    {
      name: 'pathview',
      script: 'server/index.js',
      cwd: __dirname + '/..',

      // node:sqlite 是同步单文件库，多实例会互相抢写锁 —— 必须单实例 fork
      instances: 1,
      exec_mode: 'fork',

      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // 生产环境请改成 /var/lib/pathview 之类代码目录之外的路径
        PV_DATA_DIR: process.env.PV_DATA_DIR || '/var/lib/pathview',
        TZ: 'Asia/Shanghai',
      },

      out_file: '/var/log/pathview/out.log',
      error_file: '/var/log/pathview/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
