import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'content-validation-'));
const readable=path.join(temp,'app.js');
fs.copyFileSync(path.join(root,'app.js'),readable);
execFileSync('patch',['--silent',readable,path.join(root,'tools/integrated-dex-source.patch')]);
const source=fs.readFileSync(readable,'utf8');
fs.rmSync(temp,{recursive:true,force:true});
const part=source.slice(source.indexOf('  function letterImageSource('),source.indexOf('  const pad',source.indexOf('  function letterImageSource(')));
const context={URL};vm.createContext(context);vm.runInContext(part,context);
test('letter preview accepts raster data images and does not accept remote or other formats',()=>{
 for(const type of ['png','jpeg','webp','gif'])assert.equal(context.letterImageSource('data:image/'+type+';base64,AAAA'),'data:image/'+type+';base64,AAAA');
 for(const value of ['',null,23,'https://example.org/letter.png','data:text/plain;base64,AAAA','data:image/svg+xml;base64,AAAA','data:image/png;base64,not base64','data:image/png;base64,'+'A'.repeat(700000)])assert.equal(context.letterImageSource(value),'');
});
test('saved links are absolute http or https without embedded credentials or control characters',()=>{
 assert.equal(context.savedLinkSource('https://example.org/a?q=family'),'https://example.org/a?q=family');
 assert.equal(context.savedLinkSource('http://example.org/'),'http://example.org/');
 for(const value of ['',null,'about:blank','file:///tmp/letter','/relative','https://name:password@example.org/','https://example.org/\n'])assert.equal(context.savedLinkSource(value),'');
});
