import { z } from 'zod';
export const stakeSchema=z.number().int().min(10).max(1000).refine(n=>n%2===0,'Ставка должна быть чётной');
export const betSchema=z.object({key:z.uuid(),stake:stakeSchema});
export const rouletteSchema=betSchema.extend({choice:z.union([z.enum(['red','black','zero']),z.number().int().min(0).max(36)])});
export type RouletteChoice=z.infer<typeof rouletteSchema>['choice'];
