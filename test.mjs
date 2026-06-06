
import {RAW_RECORDS,PLAN_LIBRARY} from './js/data.js';
import {parseRawRecords,normalizeRecords,buildPlanContext} from './js/training.js';
const rec = normalizeRecords(parseRawRecords(RAW_RECORDS));
console.log('records', rec.length, rec[0]?.date, rec.at(-1)?.date);
const ctx=buildPlanContext(rec,PLAN_LIBRARY);
console.log(ctx.type, ctx.label, ctx.exercises.length, ctx.exercises[0]);
