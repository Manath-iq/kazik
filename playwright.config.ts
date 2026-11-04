import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',workers:1,timeout:90000,
 use:{baseURL:'http://127.0.0.1:5174',viewport:{width:375,height:812},isMobile:true,hasTouch:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'npm run dev',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI,timeout:60000},
});
