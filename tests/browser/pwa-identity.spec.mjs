import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('Life Manager has a separate install identity from the original time-budget app on the same host',async({page})=>{
  const manifest=await readFile(new URL('../../manifest.webmanifest',import.meta.url),'utf8');
  const original={...JSON.parse(manifest),id:'./',name:'주간 시간 예산',short_name:'시간 예산'};
  for(const app of ['weekly-time-budget','life_manager']){
    await page.route(`**/${app}/`,route=>route.fulfill({contentType:'text/html',body:`<!doctype html><title>Install identity</title><link rel="manifest" href="./manifest.webmanifest">`}));
    await page.route(`**/${app}/manifest.webmanifest`,route=>route.fulfill({contentType:'application/manifest+json',body:app==='life_manager'?manifest:JSON.stringify(original)}));
    await page.route(`**/${app}/icons/*.png`,async route=>{
      const name=new URL(route.request().url()).pathname.split('/').at(-1);
      await route.fulfill({contentType:'image/png',body:await readFile(new URL(`../../icons/${name}`,import.meta.url))});
    });
  }
  const cdp=await page.context().newCDPSession(page);
  await page.goto('/weekly-time-budget/');
  const oldApp=await cdp.send('Page.getAppManifest');
  await page.goto('/life_manager/');
  const newApp=await cdp.send('Page.getAppManifest');
  expect(newApp.errors).toEqual([]);
  expect(newApp.manifest.id).not.toBe(oldApp.manifest.id);
  expect(new URL(newApp.manifest.id).pathname).toBe('/life_manager/');
  expect(new URL(newApp.manifest.startUrl).pathname).toBe('/life_manager/');
  expect(new URL(newApp.manifest.scope).pathname).toBe('/life_manager/');
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
});
