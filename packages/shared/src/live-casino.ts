import { z } from 'zod';
import { rouletteSchema } from './casino-contracts';

export const LIVE_CASINO={bettingMs:10000,rouletteMs:5000,resultMs:4000,maxStake:1000,minStake:10,maxConnections:250} as const;
export const liveGameSchema=z.enum(['roulette','crash']);
export type LiveGame=z.infer<typeof liveGameSchema>;
export const liveBetSchema=rouletteSchema.omit({choice:true}).extend({roundId:z.uuid(),choice:rouletteSchema.shape.choice.optional()});
export type LiveBetInput=z.infer<typeof liveBetSchema>;
export type LiveRound={
 id:string;game:LiveGame;sequence:number;phase:'betting'|'playing'|'result';
 bettingEndsAt:number;startedAt:number;phaseEndsAt:number|null;number?:number;crashPoint?:number;
};
export type LiveBet={id:string;round_id:string;game:LiveGame;stake:number;choice:string|null;status:'accepted'|'cashed_out'|'won'|'lost';payout:number;cashout_multiplier:number|null;result:string|null;placed_at:number};
export type LiveResult={id:string;game:LiveGame;number?:number;crashPoint?:number};
export type LiveSnapshot={round:LiveRound;serverNow:number;bet:LiveBet|null;previousBet:LiveBet|null;balance:number;recent:LiveResult[]};
export type LiveEvent={type:'round';round:LiveRound;serverNow:number;recent:LiveResult[]};
