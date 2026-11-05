import { it,expect } from 'vitest';
import { GAME_DOLLARS_PER_UNIT,toGameDollars,fromGameDollars,formatGameMoney,formatNumber,CATALOG,JOBS,ENEMIES,BALANCE,SUPPORT_AMOUNTS } from '@street/shared';
it('новый номинал ×1000 един для добычи, кошелька, зарплат, цен, дохода и ставок',()=>{
 expect(GAME_DOLLARS_PER_UNIT).toBe(1000);expect(toGameDollars(27000)).toBe(27000000);expect(fromGameDollars(1000000)).toBe(1000);
 expect(toGameDollars(ENEMIES[0].money)).toBe(7000);expect(toGameDollars(JOBS[0].reward)).toBe(120000);expect(toGameDollars(CATALOG[0].price)).toBe(3000000);expect(toGameDollars(CATALOG[0].hourly)).toBe(100000);expect(toGameDollars(BALANCE.gangCost)).toBe(1000000);
 expect(formatGameMoney(27000).replace(/\s/g,'')).toBe('27000000');expect(formatGameMoney(-7).replace(/\s/g,'')).toBe('-7000');
});
it('Stars и остальные числа не масштабируются, старые балансы не требуют перезаписи',()=>{
 expect(formatNumber(25)).toBe('25');expect(formatNumber(100)).toBe('100');expect(SUPPORT_AMOUNTS).toEqual([25,100,250]);expect(BALANCE.hp).toBe(100);expect(ENEMIES[0].xp).toBe(1);
 const old={balance:2871,ledger:[120,3000,-249]};expect(toGameDollars(old.balance)).toBe(old.ledger.reduce((s,n)=>s+toGameDollars(n),0));expect(old.balance).toBe(2871);
});
