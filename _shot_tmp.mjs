import { chromium } from 'playwright';

const outDir = process.argv[2];

const browser = await chromium.launch();

async function shoot(viewport, filename, isMobile) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2000);

  // Click the "Faturamento" nav item
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, a, div, span'));
    const target = els.find((el) => el.textContent?.trim() === 'Faturamento' && el.offsetParent !== null);
    if (target) {
      target.click();
      return true;
    }
    return false;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${filename}`, fullPage: false });
  console.log(filename, 'clicked:', clicked);
  await context.close();
}

await shoot({ width: 1440, height: 900 }, 'desktop.png', false);
await shoot({ width: 390, height: 844 }, 'mobile.png', true);

await browser.close();
