// Only terms from the currently observed Codex source file, never global feed
// history, generic operation labels, sample vocabulary or other project files.
const keywords=new Set('const let var function return import from export default class interface type string number boolean void if else for while switch case break true false null undefined new async await public private package func error nil map struct range defer go make len int float64 bool json'.split(' '));
export function projectPackets(code){
  if(!code||!String(code.agentCode||'').startsWith('CDX')||!code.path||!Array.isArray(code.lines)||!code.lines.length)return [];
  const words=[],seen=new Set();
  const add=word=>{if(word.length<3||word.length>40||keywords.has(word)||seen.has(word))return;seen.add(word);words.push(word)};
  add(String(code.path).split(/[\\/]/).at(-1)||'');
  let block=false;
  for(const raw of code.lines){
    let line=String(raw);
    if(block){const end=line.indexOf('*/');if(end<0)continue;line=line.slice(end+2);block=false}
    const begin=line.indexOf('/*');if(begin>=0){const end=line.indexOf('*/',begin+2);if(end<0){block=true;line=line.slice(0,begin)}else line=line.slice(0,begin)+' '+line.slice(end+2)}
    line=line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,'').replace(/\/\/.*$/,'');
    for(const word of line.match(/[A-Za-z_$][A-Za-z0-9_$]{2,}|[\u3400-\u9fff]{2,8}/g)||[])add(word);
    if(words.length>=48)break;
  }
  return words.slice(0,48).map(text=>{let n=2166136261;for(const c of code.path+'|'+text)n=Math.imul(n^c.charCodeAt(0),16777619);return {n:n>>>0,verb:'EDIT',text}});
}
