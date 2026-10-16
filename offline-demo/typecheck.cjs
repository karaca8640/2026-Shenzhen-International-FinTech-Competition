const path=require('node:path'),fs=require('node:fs');
const frontend=fs.existsSync(path.resolve(__dirname,'../frontend/package.json'))?path.resolve(__dirname,'../frontend'):path.resolve(__dirname,'../Customer-Support-Agent/frontend');
const ts=require(path.join(frontend,'node_modules/typescript'));
const modules=path.join(frontend,'node_modules');
const options={strict:true,noEmit:true,skipLibCheck:true,resolveJsonModule:true,esModuleInterop:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,noUnusedLocals:true,noUnusedParameters:true,baseUrl:__dirname,typeRoots:[path.join(modules,'@types')],paths:{
  'react':[path.join(modules,'@types/react')],'react/*':[path.join(modules,'@types/react/*')],
  'react-dom/*':[path.join(modules,'@types/react-dom/*')],
  'refundpath-original-ui':[path.join(frontend,'src/components/ui/index.tsx')], '*':[path.join(modules,'*')],
}};
const program=ts.createProgram([path.join(__dirname,'main.tsx'),path.join(__dirname,'offline-api.ts')],options);
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>__dirname,getNewLine:()=> '\n'}));process.exitCode=1;}
else console.log('PASS: strict TypeScript across the standalone UI, planner, tools and local API.');
