import { defineConfig } from '@playwright/test'
export default defineConfig({
 testDir:'./tests/isolated',timeout:30000,workers:1,
 use:{baseURL:'http://127.0.0.1:4173',headless:true,serviceWorkers:'block',
  launchOptions:process.env.NORTHBORN_CHROME?{executablePath:process.env.NORTHBORN_CHROME}:{},
  screenshot:'only-on-failure'},
 webServer:{command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --configLoader native',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
 reporter:'list'
})
