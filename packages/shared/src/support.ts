import { z } from 'zod';

export const SUPPORT_AMOUNTS = [25, 100, 250] as const;
export const SUPPORT_TERMS_VERSION = '2026-11-05.1';
export const SUPPORT_TERMS = [
  'Это добровольная разовая поддержка разработки STREET LEGENDS, не подписка и не благотворительный сбор.',
  'Оплата настоящими Telegram Stars. Списывается только выбранная сумма после подтверждения в Telegram.',
  'Поддержка не даёт игровых долларов, имущества, усилений, дохода, XP, рейтинга или других наград. Вся игра доступна без доната.',
  'Нет обмена Stars на игровые деньги, ставок за Stars, вывода, переводов между игроками или обещаний будущих призов и функций.',
  'Полный возврат Stars можно запросить в истории поддержки или у владельца. Обработка зависит от доступности Telegram; до подтверждения сервера возврат не считается завершённым.',
  'По вопросам оплаты и возврата обращайся к владельцу по ссылке ниже или через /paysupport в боте. Поддержка Telegram не решает споры по этим платежам.',
] as const;
export const supportInvoiceSchema = z.object({
  key: z.uuid(), stars: z.number().int().refine(value=>SUPPORT_AMOUNTS.some(amount=>amount===value)),
  termsAccepted: z.literal(true), termsVersion: z.literal(SUPPORT_TERMS_VERSION),
}).strict();

export type SupportPayment = {
  chargeId: string; stars: number; currency: string;
  status: 'paid' | 'review' | 'refund_pending' | 'refunded';
  receivedAt: number; refundedAt: number | null;
};
export type SupportOrder = {
  id: string; stars: number; invoiceUrl: string | null; expiresAt: number;
  status: 'awaiting_payment' | 'processing' | 'paid' | 'refunded' | 'expired';
};
export type SupportInfo = {
  enabled: boolean; amounts: readonly number[]; termsVersion: string; terms: readonly string[];
  supportUrl: string | null; history: SupportPayment[]; pendingOrder: SupportOrder | null;
};
