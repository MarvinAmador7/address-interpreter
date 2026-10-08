import { readFile, writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openWorkspace,DEFAULT_REVIEW } from './review-workspace.mjs';
import { hash } from './labeling-contract.mjs';
import { artifactHash,evaluateBenchmark,EVALUATOR_HASH,OUTPUT_CONTRACT,NORMALIZATION,METRICS } from './benchmark-contract.mjs';

export async function scoreReviewedWorkspace({directory=DEFAULT_REVIEW,module='dist/index.js',spellingAlternatives=false}={}) {
  const workspace=await openWorkspace(directory,{readOnly:true});
  try{
    const review=workspace.exportReview();
    if(!review.annotations.some(a=>a.review.status==='human-reviewed-provisional'))throw new Error('No finalized human reviews yet. Finish a calibration case in the review interface first.');
    const library=await import(pathToFileURL(resolve(module)));
    const annotations=review.annotations.map(({review,...a})=>a);
    const definition={corpusHash:review.manifest.corpusHash,policyHash:review.manifest.policyHash,
      sampleHash:artifactHash(review.sample),annotationHash:artifactHash(annotations),guideHash:review.manifest.guideHash,
      split:'development',annotationStatus:'provisional',outputContract:OUTPUT_CONTRACT,normalization:NORMALIZATION,metrics:METRICS,evaluatorHash:EVALUATOR_HASH,
      parserOptions:{spellingAlternatives},population:'Targeted human calibration subset of the 200-case Luna development pilot; not a population accuracy estimate.'};
    const result=evaluateBenchmark({definition,sample:review.sample,annotations,interpret:library.interpretAddress,parserHash:hash(await readFile(module))});
    return {...result,reviewJournalHead:review.journalHead,reviewer:review.reviewer,finalizedReviews:review.annotations.filter(a=>a.review.status==='human-reviewed-provisional').length};
  }finally{await workspace.close();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),option=(n,f)=>args.includes(n)?args[args.indexOf(n)+1]:f;
  const directory=option('--workspace',DEFAULT_REVIEW);
  const result=await scoreReviewedWorkspace({directory,module:option('--module','dist/index.js'),spellingAlternatives:args.includes('--with-spelling')});
  const file=join(resolve(directory),`evaluation-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  await writeFile(file,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({file,finalizedReviews:result.finalizedReviews,evidenceStatus:result.evidenceStatus,releaseEligible:false,summary:result.summary},null,2));
}
