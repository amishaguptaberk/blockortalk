import { build } from 'esbuild';
import { expect,test } from 'vitest';
test('Play browser surfaces contain no server scripts, corpus, credentials or score adapters',async()=>{
 const bundle=await build({entryPoints:['app/play/PlayCatalog.tsx','app/play/[id]/CallScreen.tsx'],bundle:true,external:['react','react/*'],outdir:'out',platform:'browser',format:'esm',write:false,metafile:true,logLevel:'silent'});
 const js=bundle.outputFiles.map(file=>file.text).join('');
 for(const forbidden of ['ask_line','next_step','versions','NVIDIA_API_KEY','DATABASE_URL','Please read me your fictional Practice protection code'])expect(js).not.toContain(forbidden);
 expect(Object.keys(bundle.metafile!.inputs).filter(path=>/lib\/season\/.*(server|corpus|read-model)/.test(path))).toEqual([]);
});
