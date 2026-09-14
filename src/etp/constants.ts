/** Краткая справка по площадке — только ETP.Adilet на первом этапе. */
export const ETP_ADILET = {
  name: "ETP.Adilet",
  url: "https://etp.adilet.gov.kz",
  tradesUrl: "https://etp.adilet.gov.kz/trades",
  operator: "РПЧСИ РК (Республиканская палата частных судебных исполнителей)",
  purpose: "Электронные аукционы по реализации арестованного имущества должников",
  guaranteeTypical: "обычно 5% от стартовой цены лота",
  commission: "комиссии площадки нет, только гарантийный взнос",
  needs: "ЭЦП + ИИН/БИН, регистрация бесплатна",
} as const;

export const TRADE_STATUSES = {
  BID_SUBMISSION: "Приём заявок",
  CONSIDERATION: "Допуск на торги",
  ACTIVE: "На торгах",
  AFTER_TRADE: "Подведение итогов",
  COMPLETED: "Состоявшиеся торги",
  NOT_COMPLETED: "Несостоявшиеся торги",
  CANCELED: "Отмененные торги",
} as const;

export type TradeStatusCode = keyof typeof TRADE_STATUSES;
