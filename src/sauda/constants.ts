import type { SearchCityKey } from "../etp/constants.js";

export const SAUDA = {
  name: "Sauda",
  url: "https://sauda.e-qazyna.kz",
  listUrl: "https://sauda.e-qazyna.kz/ru/list?searchStatus=ApplicationsAccept",
  operator: "e-Qazyna",
  purpose: "Электронные торги государственного и иного имущества",
} as const;

/** Live downward auctions (from 17.01.2021). GET filter works; region GET does not. */
export const SAUDA_DOWN_TYPE = "Auction_PriceDown17012021";

const ASTANA = /г\.?\s*астан|нур-?султан/i;
const PAVLODAR = /павлодар|экибастуз/i;

export function saudaLotInCity(hay: string, cityKey: SearchCityKey): boolean {
  if (cityKey === "astana") return ASTANA.test(hay);
  if (cityKey === "pavlodar") return PAVLODAR.test(hay);
  return ASTANA.test(hay) || PAVLODAR.test(hay);
}
