import type { TradeStatusCode } from "./constants.js";

export interface TradeListLot {
  id: number;
  number: string;
  title: string;
  initialContractPrice?: number;
  goodsDescription?: string;
  methodAucDown?: boolean;
}

export interface TradeListItem {
  id: number;
  title: string;
  registeredNumber: string;
  viewLocation: string;
  processStatus: {
    name: TradeStatusCode | string;
    title: string;
  };
  owner?: { inn?: string; title?: string };
  region?: string;
  procurementMethodTitle?: string;
  procurementClassifiers?: Array<{ id: number; title: string }>;
  initialContractPrice?: number;
  assuranceAmount?: number;
  assurancePercents?: number;
  bidSubmissionEndDate?: number;
  tradeStartDate?: number;
  timeToFinish?: string;
  lots: TradeListLot[];
  currencyCode?: string;
  images?: Array<{ name: string; href: string; thumbnail?: string; type?: string }>;
}

export interface TradeListResponse {
  items: TradeListItem[];
  skipped: number;
  limit: number;
  total: number;
}

export interface TradeDetailLot {
  ref: string;
  status?: { name: string; title: string };
  number?: string;
  title?: string;
  goodsDescription?: string;
  location?: string;
  initialPrice?: number;
  assurancePercent?: number;
  assuranceAmount?: number;
  marketPrice?: number;
  tradeStepPercent?: number;
  photos: Array<{ name: string; href: string; type?: string }>;
}

export interface TradeDetail {
  id: number;
  title: string;
  status?: string;
  organizer?: string;
  phone?: string;
  address?: string;
  courtOfficerName?: string;
  courtOfficerOrg?: string;
  procurementMethod?: string;
  bidAssuranceTerms?: string;
  lots: TradeDetailLot[];
  attachments: Array<{ name: string; href: string; size?: number }>;
  bidSubmissionEndDate?: number;
  tradeStartDate?: number;
  url: string;
}

export interface DownloadedFile {
  buffer: Buffer;
  name: string;
  contentType: string;
}

export interface ProtocolResult {
  salePrice?: number;
  startPrice?: number;
  winner?: string;
  soldAt?: string;
  note?: string;
  file: DownloadedFile;
}
