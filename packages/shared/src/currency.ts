// New denomination: one persisted economy unit is now 1,000 displayed game dollars.
// Keeping integer accounting units preserves balances, append-only ledger and in-flight rounds exactly.
// This multiplier is NEVER used for Telegram Stars, XP, HP, timers, waves or multipliers.
export const GAME_DOLLARS_PER_UNIT=1000;
export const toGameDollars=(units:number)=>units*GAME_DOLLARS_PER_UNIT;
export const fromGameDollars=(dollars:number)=>dollars/GAME_DOLLARS_PER_UNIT;
const formatter=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
export const formatNumber=(value:number)=>formatter.format(value);
export const formatGameMoney=(units:number)=>formatNumber(toGameDollars(units));
