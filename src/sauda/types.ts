export type SaudaLot = {
  id: string;
  number: string;
  title: string;
  auctionType: string;
  region: string;
  start: number | null;
  auctionAt: string;
  url: string;
  isDown: boolean;
};

export type SaudaListPage = {
  lots: SaudaLot[];
  total: number;
  page: number;
};
