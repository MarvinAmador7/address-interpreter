import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateBatch} from './labeling-pilot.mjs';

/** Validate chosen token labels before reserving the immutable output file. */
export async function writeLabelBatch(inputFile,annotations){
  const input=resolve(inputFile);
  if(!input.split(/[\\/]/).includes('.local') || !input.endsWith('.input.jsonl'))
    throw new Error('Expected a private batch input file');
  const records=(await readFile(input,'utf8')).split('\n').filter(x=>x.trim()).map(JSON.parse);
  const validation=validateBatch(records,annotations);
  if(!validation.valid)throw new Error(JSON.stringify(validation.errors));
  const output=input.slice(0,-'.input.jsonl'.length)+'.labels.jsonl';
  await writeFile(output,annotations.map(row=>JSON.stringify(row)).join('\n')+'\n',{flag:'wx',mode:0o600});
  return {output,count:annotations.length,valid:true};
}
