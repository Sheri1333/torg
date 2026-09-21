/**
 * Оценка сделки по арестантскому лоту на понижении.
 *
 * Старт на ETP — оценка СИ, не цена Kolesa. На понижении лоты из выборки
 * Астана+Павлодар (23 авто, выписки 2026) уходили в медиане за ~70% старта,
 * рабочая зона перекупа 52–64%, пол часто около 50%.
 *
 * Взнос 5% входит в цену покупки, не плюсом. Выгода считается от осторожной
 * перепродажи 90% оценки минус покупка минус ремонт/логистика/учёт.
 */
export const DEAL_ASSUMPTIONS = {
  depositPct: 0.05,
  floorPct: 0.5,
  typicalBuyPct: 0.58,
  medianBuyPct: 0.7,
  skipAbovePct: 0.75,
  resalePct: 0.9,
  evacSameCity: 40_000,
  evacIntercity: 90_000,
  registration: 45_000,
  repairPct: 0.06,
  repairMin: 250_000,
  repairMax: 900_000,
} as const;

export type DealVerdict = "look" | "thin" | "skip";

export type DealEstimate = {
  start: number;
  buyTypical: number;
  buyFloor: number;
  buyMedian: number;
  buyUsed: number;
  buyIsActual: boolean;
  deposit: number;
  remainderTypical: number;
  repair: number;
  evac: number;
  registration: number;
  extraCosts: number;
  resale: number;
  profitTypical: number;
  profitFloor: number;
  verdict: DealVerdict;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isPavlodar(region?: string): boolean {
  return /павлодар/i.test(region ?? "");
}

export function estimateDeal(options: {
  start?: number | null;
  actualBuy?: number | null;
  region?: string;
}): DealEstimate | null {
  const start = options.start;
  if (start == null || !Number.isFinite(start) || start <= 0) return null;

  const buyTypical = Math.round(start * DEAL_ASSUMPTIONS.typicalBuyPct);
  const buyFloor = Math.round(start * DEAL_ASSUMPTIONS.floorPct);
  const buyMedian = Math.round(start * DEAL_ASSUMPTIONS.medianBuyPct);
  const actual = options.actualBuy;
  const buyIsActual = actual != null && Number.isFinite(actual) && actual > 0;
  const buyUsed = buyIsActual ? Math.round(actual) : buyTypical;

  const deposit = Math.round(start * DEAL_ASSUMPTIONS.depositPct);
  const remainderTypical = Math.max(0, buyUsed - deposit);
  const repair = Math.round(
    clamp(start * DEAL_ASSUMPTIONS.repairPct, DEAL_ASSUMPTIONS.repairMin, DEAL_ASSUMPTIONS.repairMax),
  );
  const evac = isPavlodar(options.region) ? DEAL_ASSUMPTIONS.evacIntercity : DEAL_ASSUMPTIONS.evacSameCity;
  const registration = DEAL_ASSUMPTIONS.registration;
  const extraCosts = repair + evac + registration;
  const resale = Math.round(start * DEAL_ASSUMPTIONS.resalePct);
  const profitTypical = resale - buyUsed - extraCosts;
  const profitFloor = resale - buyFloor - extraCosts;

  let verdict: DealVerdict = "look";
  if (profitTypical < 0) verdict = "skip";
  else if (profitTypical < 800_000 || buyUsed / start >= DEAL_ASSUMPTIONS.skipAbovePct) verdict = "thin";

  return {
    start,
    buyTypical,
    buyFloor,
    buyMedian,
    buyUsed,
    buyIsActual,
    deposit,
    remainderTypical,
    repair,
    evac,
    registration,
    extraCosts,
    resale,
    profitTypical,
    profitFloor,
    verdict,
  };
}

export function verdictLabel(verdict: DealVerdict): string {
  if (verdict === "look") return "можно смотреть";
  if (verdict === "thin") return "тонко";
  return "скорее минус";
}
