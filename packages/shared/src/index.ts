import { z } from 'zod';
import type { RouletteChoice } from './casino-contracts';
export * from './support';
export * from './currency';
export * from './live-casino';
export * from './casino-contracts';

export const BALANCE = {
  hp: 100, speed: 155, damage: 12, fireDelay: 850, range: 230,
  waveSeconds: 30, maxEnemies: 72, checkpointSeconds: 10,
  maxRunSeconds: 3600, gangCost: 1000, gangSize: 20,
} as const;
export const ENEMIES = [
  { name: 'Гопник', hp: 25, speed: 48, damage: 10, xp: 1, money: 7 },
  { name: 'Бегун', hp: 16, speed: 92, damage: 7, xp: 1, money: 9 },
  { name: 'Качок', hp: 80, speed: 34, damage: 20, xp: 3, money: 22 },
  { name: 'Авторитет', hp: 480, speed: 45, damage: 28, xp: 15, money: 125 },
] as const;
export const UPGRADES = [
  { id: 'damage', name: 'Калибр', text: '+20% урона', max: 8 },
  { id: 'fire', name: 'Скорострел', text: 'Атака быстрее на 12%', max: 7 },
  { id: 'armor', name: 'Броня', text: '−8% входящего урона', max: 6 },
  { id: 'health', name: 'Выносливость', text: '+25 максимального HP', max: 6 },
  { id: 'speed', name: 'Кроссовки', text: '+8% скорости', max: 5 },
  { id: 'crit', name: 'Крит', text: '+5% шанса двойного урона', max: 6 },
  { id: 'double', name: 'Двойной выстрел', text: '+1 снаряд', max: 2 },
  { id: 'magnet', name: 'Магнит', text: '+25 к радиусу подбора', max: 5 },
  { id: 'ricochet', name: 'Рикошет', text: '+15% шанса отскока', max: 4 },
  { id: 'heal', name: 'Аптечка', text: 'Восстановить 30 HP', max: 9999 },
] as const;
export type UpgradeId = typeof UPGRADES[number]['id'];
export const JOBS = [
  { id: 'courier', name: 'Курьер', seconds: 600, reward: 120 },
  { id: 'guard', name: 'Охранник', seconds: 1800, reward: 420 },
  { id: 'taxi', name: 'Таксист', seconds: 3600, reward: 950 },
] as const;
export const CATALOG = [
  { id: 'kiosk', name: 'Ларёк', category: 'business', price: 3000, hourly: 100 },
  { id: 'wash', name: 'Автомойка', category: 'business', price: 12000, hourly: 350 },
  { id: 'bar', name: 'Бар', category: 'business', price: 35000, hourly: 1100 },
  { id: 'sedan', name: 'Старый седан', category: 'car', price: 7000, hourly: 0 },
  { id: 'coupe', name: 'Купе', category: 'car', price: 30000, hourly: 0 },
  { id: 'sport', name: 'Спорткар', category: 'car', price: 90000, hourly: 0 },
  { id: 'room', name: 'Комната', category: 'home', price: 5000, hourly: 0 },
  { id: 'flat', name: 'Квартира', category: 'home', price: 25000, hourly: 0 },
  { id: 'penthouse', name: 'Пентхаус', category: 'home', price: 150000, hourly: 0 },
] as const;
export const progressSchema = z.object({
  seq: z.number().int().min(1).max(10000), seconds: z.number().int().min(0).max(BALANCE.maxRunSeconds),
  kills: z.number().int().min(0).max(30000), money: z.number().int().min(0).max(200000),
  level: z.number().int().min(1).max(200), distance: z.number().nonnegative().max(1000000),
});
export type RunProgress = z.infer<typeof progressSchema>;
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export function rouletteColor(n: number) { return n === 0 ? 'zero' : RED.has(n) ? 'red' : 'black'; }
export function roulettePayout(n: number, choice: RouletteChoice, stake: number) {
  return typeof choice === 'number' ? (choice === n ? stake * 36 : 0)
    : choice === rouletteColor(n) ? stake * (choice === 'zero' ? 36 : 2) : 0;
}
export function handValue(cards: number[]) {
  let aces = 0;
  let value = cards.reduce((sum, card) => { const rank = card % 13; if (rank === 0) aces++; return sum + (rank === 0 ? 11 : Math.min(rank + 1, 10)); }, 0);
  while (value > 21 && aces-- > 0) value -= 10;
  return value;
}
export const CRASH = { growth: 0.1, max: 100, edge: 0.03 } as const;
export function crashMultiplier(elapsedMs: number) { return Math.min(CRASH.max, Math.exp(Math.max(0, elapsedMs) / 1000 * CRASH.growth)); }
export function crashPoint(u: number) { return Math.max(1, Math.min(CRASH.max, Math.floor((1 - CRASH.edge) / (1 - u) * 100) / 100)); }
export function seasonStart(now: number) {
  const d = new Date(now); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.getTime();
}
export function businessIncome(hourly: number, elapsed: number) { return Math.floor(hourly * Math.max(0, Math.min(elapsed, 6 * 3600000)) / 3600000); }
export function xpNeeded(level: number) { return 6 + (level - 1) * 3; }
export function spawnDelay(wave: number) { return Math.max(260, 2000 / (1 + (wave - 1) * 0.35)); }
export function maxSpawned(seconds: number) {
  let n = 0;
  for (let w = 1, left = seconds; left > 0; w++, left -= 30) n += Math.ceil(Math.min(30, left) * 1000 / spawnDelay(w)) + (w % 5 === 0 ? 1 : 0);
  return n;
}
// A sanity bound, not a payout rate. Accepted collected loot is credited in full, without a $/second haircut.
export function runLootLimit(seconds:number,kills:number){return kills*25+Math.floor((seconds/BALANCE.waveSeconds+1)/5)*150;}
export type RunTicket = { id: string; seed: number; startedAt: number };
export type RunResult = { id: string; wave: number; duration_seconds: number; kills: number; earned: number; verification_state: string; gang_xp: number; is_new_record?: number };
export type GangMember = { user_id: string; display_name: string; role: string; best_wave: number };
export type Gang = { id: string; name: string; tag: string; owner_id: string; lifetime_xp: number; season_score: number; members: GangMember[]; recent: RunResult[] };
export type Owned = { item_id: string; last_claim_at: number; purchased_at: number };
export type Job = { id: string; job_type: string; ends_at: number; claimed_at: number | null };
export type Profile = {
  id: string; display_name: string; username: string; avatar_url: string | null; balance: number;
  best_wave: number; best_duration: number; total_runs: number; total_kills: number; season_wave: number;
  gang: Gang | null; owned: Owned[]; job: Job | null; serverNow: number;
};
export type CasinoRound = {
  id: string; game_type: 'roulette' | 'crash' | 'blackjack'; stake: number; status: string;
  payout: number; started_at: number; serverNow: number; version: number; number?: number; choice?: RouletteChoice;
  multiplier?: number; crash_point?: number; player?: number[]; dealer?: number[]; result?: string;
};
export type Rank = { id: string; name: string; score: number; duration?: number };
export type LedgerEntry = { id: string; delta: number; reason: string; created_at: number };
