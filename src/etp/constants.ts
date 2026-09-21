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

/** Города для /search. /searchdone — все регионы, без этого фильтра. */
export const SEARCH_CITIES = {
  astana: { ids: ["100806670"], label: "г. Астана", button: "Астана" },
  pavlodar: { ids: ["100806587"], label: "Павлодарская область", button: "Павлодар" },
  both: {
    ids: ["100806670", "100806587"],
    label: "г. Астана и Павлодарская область",
    button: "Оба города",
  },
} as const;

export type SearchCityKey = keyof typeof SEARCH_CITIES;

export function isSearchCityKey(value: string): value is SearchCityKey {
  return value === "astana" || value === "pavlodar" || value === "both";
}

export const ACTIVE_SEARCH_REGIONS = SEARCH_CITIES.both;

/** Классификатор «легковые автомобили» на ETP.Adilet — сужает полный текст. */
export const PASSENGER_CARS_CLASSIFIER_ID = "100806523";
