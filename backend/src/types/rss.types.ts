export interface RssItem {
  link?: string[];
  title?: string[];
  description?: string[];
  pubDate?: string[];
  [key: string]: unknown;
}

export interface ParsedRssItem {
  id: string;
  title: string;
  price: string;
  priceValue?: number;
  pricePerM2?: number;
  district?: string;
  rooms?: number;
  area?: number;
  floor?: string;
  category: string;
  link: string;
  pubDate: Date;
}

export interface RssResult {
  rss?: {
    channel?: Array<{
      item?: RssItem[];
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
