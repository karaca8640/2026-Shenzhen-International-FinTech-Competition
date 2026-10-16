const fs = require('node:fs');
const path = require('node:path');
const frontend = fs.existsSync(path.resolve(__dirname, '../frontend/package.json')) ? path.resolve(__dirname, '../frontend') : path.resolve(__dirname, '../Customer-Support-Agent/frontend');
const esbuild = require(path.join(frontend, 'node_modules/esbuild'));
const output = process.env.REFUNDPATH_HTML_OUTPUT ? path.resolve(process.env.REFUNDPATH_HTML_OUTPUT) : fs.existsSync(path.resolve(__dirname, '../frontend/package.json')) ? path.resolve(__dirname, 'dist/RefundPath-arayuzler.html') : path.resolve(__dirname, '../../outputs/RefundPath-arayuzler.html');

(async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'main.tsx')], bundle: true, write: false,
    platform: 'browser', format: 'iife', target: 'es2020', jsx: 'automatic',
    nodePaths: [path.join(frontend, 'node_modules')], minify: true,
    define: {'process.env.NODE_ENV': '"production"'}, legalComments: 'inline',
    plugins: [{name:'existing-components',setup(build){build.onResolve({filter:/^refundpath-original-ui$/},()=>({path:path.join(frontend,'src/components/ui/index.tsx')}));}}],
  });
  const dist = path.join(frontend, 'dist');
  const base = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const cssAsset = base.match(/href="(\/assets\/[^" ]+\.css)"/)[1];
  let css = fs.readFileSync(path.join(dist, cssAsset), 'utf8');
  css = css.replace(/url\((['"]?)([^)'" ]+)\1\)/g, (all, quote, url) => {
    if (url.startsWith('data:')) return all;
    const asset = path.join(dist, url.replace(/^\//, ''));
    if (!fs.existsSync(asset)) throw new Error(`Missing CSS asset: ${url}`);
    return `url(data:font/woff2;base64,${fs.readFileSync(asset).toString('base64')})`;
  });
  css += '\n' + fs.readFileSync(path.join(__dirname, 'extra.css'), 'utf8');
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const favicon = fs.readFileSync(path.join(frontend, 'public/favicon.svg')).toString('base64');
  const fontLicense = fs.readFileSync(path.join(frontend, 'node_modules/@fontsource-variable/geist/LICENSE'), 'utf8').replace(/--/g, '—');
  const html = `<!doctype html>
<!-- Embedded Geist fonts: ${fontLicense} -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>RefundPath · Offline interfaces</title><meta name="description" content="RefundPath interfaces in one offline HTML file. Synthetic workflow demonstration; no external submissions."><meta name="theme-color" content="#174e43">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${favicon}">
<style>${css}</style></head><body><div id="root"></div><noscript>Bu arayüzün çalışması için tarayıcınızda JavaScript açık olmalıdır. Sunucu veya internet bağlantısı gerekmez.</noscript><script>${js}</script></body></html>`;
  fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, html, 'utf8');
  await esbuild.build({entryPoints: [path.join(__dirname, 'offline-api.ts')], bundle: true, write: true,
    outfile: path.join(__dirname, 'offline-api-test.cjs'), platform: 'node', format: 'cjs', target: 'node20'});
  console.log(JSON.stringify({output, bytes: Buffer.byteLength(html), embeddedFonts: (css.match(/data:font\/woff2/g) || []).length}));
})().catch(e => {console.error(e); process.exitCode = 1;});
