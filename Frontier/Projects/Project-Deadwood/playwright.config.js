import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:90000,workers:1,
  use:{baseURL:'http://127.0.0.1:5173',viewport:{width:960,height:640},
    launchOptions:{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
      args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-zygote']}},
  webServer:{command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:true}
});
