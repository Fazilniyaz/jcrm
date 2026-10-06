/*
 * PM2 process definitions for the single-instance deployment.
 *
 *   jadvix-api  Express, on 127.0.0.1:4000
 *   jadvix-app  Next.js,  on 127.0.0.1:3000
 *
 * Both bind to LOOPBACK, not 0.0.0.0. Nginx is the only thing that should be
 * reachable from outside, and binding the upstreams to the public interface
 * would let anyone hit :3000 and :4000 directly — straight past the proxy, its
 * body-size limit and its rate limiting. The security group should close those
 * ports too; this is the second lock.
 *
 * Usage, from the directory holding this file:
 *   pm2 start ecosystem.config.js
 *   pm2 save          <- writes the process list PM2 will resurrect on boot
 *   pm2 logs jadvix-api
 */

const API_DIR = "/home/ubuntu/jcrmbe";
const APP_DIR = "/home/ubuntu/jcrm";

module.exports = {
  apps: [
    {
      name: "jadvix-api",
      cwd: API_DIR,
      script: "dist/index.js",
      /*
       * One process, deliberately.
       *
       * `cluster` with several instances would multiply the Prisma connection
       * pool against Atlas by the instance count, and the rate limiter's
       * in-process counters would be divided among them. Neither is worth it
       * on a single small box — scale the instance up before scaling this out,
       * and move the limiter to Redis first if you do.
       */
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      // The API loads its own .env through dotenv; this is only the floor.
      max_memory_restart: "400M",
      // A process that dies instantly and endlessly is a config error, not a
      // blip. Stop restarting it so the logs show the cause rather than ten
      // thousand copies of it.
      min_uptime: "10s",
      max_restarts: 10,
      time: true,
    },
    {
      name: "jadvix-app",
      cwd: APP_DIR,
      /*
       * `npm start` is `next start`, which serves the .next build.
       *
       * Not the standalone server: next.config.ts emits .next/standalone for
       * the Docker image, and running it needs .next/static and public/ copied
       * in beside it by hand. `next start` needs no such step and is the
       * documented Node.js deployment path.
       */
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: "3000", HOSTNAME: "127.0.0.1" },
      max_memory_restart: "600M",
      min_uptime: "10s",
      max_restarts: 10,
      time: true,
    },
  ],
};
