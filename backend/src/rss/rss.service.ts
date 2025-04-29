import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Parser } from 'xml2js';
import { RSS_FEED_URL } from '../config/rss.config';
import { PrismaService } from '../config/prisma.service';
import { ParsedRssItem, RssItem, RssResult } from '../types/rss.types';
import { FailedListingService } from '../config/failed-listing.service';

@Injectable()
export class RssService {
  private readonly logger = new Logger(RssService.name);
  private readonly RSS_BASE_URL =
    'https://www.ss.lv/lv/real-estate/flats/riga/';

  public readonly AVAILABLE_DISTRICTS = [
    { value: 'all', label: 'Visi' },
    { value: 'centre', label: 'Centrs' },
    { value: 'agenskalns', label: 'Āgenskalns' },
    { value: 'aplokciems', label: 'Aplokciems' },
    { value: 'bergi', label: 'Berģi' },
    { value: 'bierini', label: 'Bieriņi' },
    { value: 'bolderaya', label: 'Bolderāja' },
    { value: 'breksi', label: 'Brekši' },
    { value: 'bukulti', label: 'Bukulti' },
    { value: 'chiekurkalns', label: 'Čiekurkalns' },
    { value: 'darzciems', label: 'Dārzciems' },
    { value: 'darzini', label: 'Dārziņi' },
    { value: 'daugavgriva', label: 'Daugavgrīva' },
    { value: 'dreilini', label: 'Dreiliņi' },
    { value: 'dzeguzhkalns', label: 'Dzegužkalns (Dzirciems)' },
    { value: 'grizinkalns', label: 'Grīziņkalns' },
    { value: 'ilguciems', label: 'Iļģuciems' },
    { value: 'imanta', label: 'Imanta' },
    { value: 'janjavarti', label: 'Jāņavārti' },
    { value: 'jaunciems', label: 'Jaunciems' },
    { value: 'jaunmilgravis', label: 'Jaunmīlgrāvis' },
    { value: 'yugla', label: 'Jugla' },
    { value: 'katlakalns', label: 'Katlakalns' },
    { value: 'kengarags', label: 'Ķengarags' },
    { value: 'kipsala', label: 'Ķīpsala' },
    { value: 'kleisti', label: 'Kleisti' },
    { value: 'kliversala', label: 'Klīversala' },
    { value: 'krasta-st-area', label: 'Krasta r-ns' },
    { value: 'kundzinsala', label: 'Kundziņsala' },
    { value: 'maskavas-priekshpilseta', label: 'Latgales priekšpilsēta' },
    { value: 'lucavsala', label: 'Lucavsala' },
    { value: 'mangali', label: 'Mangaļi' },
    { value: 'mangalsala', label: 'Mangaļsala' },
    { value: 'mezhapark', label: 'Mežaparks' },
    { value: 'mezhciems', label: 'Mežciems' },
    { value: 'plyavnieki', label: 'Pļavnieki' },
    { value: 'purvciems', label: 'Purvciems' },
    { value: 'rumbula', label: 'Rumbula' },
    { value: 'shampeteris-pleskodale', label: 'Šampēteris-Pleskodāle' },
    { value: 'sarkandaugava', label: 'Sarkandaugava' },
    { value: 'shkirotava', label: 'Šķirotava' },
    { value: 'teika', label: 'Teika' },
    { value: 'tornjakalns', label: 'Torņakalns' },
    { value: 'trisciems', label: 'Trīsciems' },
    { value: 'vecaki', label: 'Vecāķi' },
    { value: 'vecdaugava', label: 'Vecdaugava' },
    { value: 'vecmilgravis', label: 'Vecmīlgrāvis' },
    { value: 'vecriga', label: 'Vecrīga' },
    { value: 'voleri', label: 'Voleri' },
    { value: 'zakusala', label: 'Zaķusala' },
    { value: 'zasulauks', label: 'Zasulauks' },
    { value: 'ziepniekkalns', label: 'Ziepniekkalns' },
    { value: 'zolitude', label: 'Zolitūde' },
    { value: 'vef', label: 'VEF' },
    { value: 'other', label: 'Cits' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly failedListingService: FailedListingService,
  ) {}

  /**
   * Fetch RSS items from the default feed URL
   */
  async fetchRssItems(): Promise<RssItem[]> {
    return this.fetchRssFeed(RSS_FEED_URL);
  }

  /**
   * Fetch RSS items for a specific district
   * @param district - District value (e.g., 'centre', 'agenskalns')
   * @param priceMin - Minimum price filter (optional)
   * @param priceMax - Maximum price filter (optional)
   * @param roomsMin - Minimum rooms filter (optional)
   * @param roomsMax - Maximum rooms filter (optional)
   */
  async fetchRssItemsByDistrict(
    district: string,
    priceMin?: number,
    priceMax?: number,
    roomsMin?: number,
    roomsMax?: number,
  ): Promise<RssItem[]> {
    let url = `${this.RSS_BASE_URL}${district}/rss/`;

    const params = new URLSearchParams();
    if (priceMin) params.append('topt[8][min]', priceMin.toString());
    if (priceMax) params.append('topt[8][max]', priceMax.toString());
    if (roomsMin) params.append('topt[1][min]', roomsMin.toString());
    if (roomsMax) params.append('topt[1][max]', roomsMax.toString());

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    return this.fetchRssFeed(url);
  }

  /**
   * Fetch RSS feed from the specified URL
   * @param url - The RSS feed URL
   */
  private async fetchRssFeed(url: string): Promise<RssItem[]> {
    try {
      this.logger.log(`Fetching RSS feed from: ${url}`);
      const response = await axios.get<string>(url, {
        timeout: 10000,
      });
      const data = response.data;

      try {
        const parser = new Parser({ mergeAttrs: true });
        const parsedResult = (await parser.parseStringPromise(
          data,
        )) as RssResult;

        if (!parsedResult?.rss?.channel?.[0]?.item) {
          this.logger.error('Invalid RSS feed structure');
          return [];
        }

        const items = parsedResult.rss.channel[0].item || [];
        return items;
      } catch (parseError: unknown) {
        const errorMessage =
          parseError instanceof Error ? parseError.message : String(parseError);
        this.logger.error(`Failed to parse RSS feed data: ${errorMessage}`);
        return [];
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch RSS feed: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Parse a single RSS item to extract needed fields:
   * - listing ID (from link)
   * - title
   * - price (€)
   * - price per m²
   * - rooms
   * - area (m²)
   * - floor
   * - district (Pagasts)
   * - pubDate
   * - listing link
   */
  parseRssItem(item: RssItem): ParsedRssItem {
    try {
      const linkArray = item.link || [''];
      const link = linkArray[0] || '';

      const idMatch = link.match(/\/(\w+)\.html$/);
      const id = idMatch ? idMatch[1] : link;

      const titleArray = item.title || [''];
      const title = titleArray[0] || '';

      const descriptionArray = item.description || [''];
      const description = descriptionArray[0] || '';

      const pubDateArray = item.pubDate || [''];
      const pubDateStr = pubDateArray[0] || '';
      const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

      let priceValue: number | undefined;
      let pricePerM2: number | undefined;
      let rooms: number | undefined;
      let area: number | undefined;
      let floor: string | undefined;
      let district: string | undefined;
      let price: string | undefined;

      const actualPriceRegex = /Cena:\s*<b>([^<]+)<\/b>/;
      const actualPriceMatch = description.match(actualPriceRegex);
      if (actualPriceMatch && actualPriceMatch[1]) {
        price = actualPriceMatch[1].trim();

        const numericPriceMatch = price.match(/(\d[\d\s,]*)/);
        if (numericPriceMatch && numericPriceMatch[1]) {
          const rawPrice = numericPriceMatch[1].replace(/[\s,]+/g, '');
          priceValue = parseInt(rawPrice, 10);
        }
      }

      const pricePerM2Regex = /:\s*<b>([^<]+)<\/b>/;
      const pricePerM2Match = description.match(pricePerM2Regex);
      if (pricePerM2Match && pricePerM2Match[1]) {
        const rawPricePerM2 = pricePerM2Match[1].replace(/[\s,€]+/g, '');
        pricePerM2 = parseFloat(rawPricePerM2);
      }

      const districtRegex = /Pagasts:\s*<b>([^<]+)<\/b>/;
      const districtMatch = description.match(districtRegex);
      if (districtMatch && districtMatch[1]) {
        district = districtMatch[1].trim();

        const newlineIndex = district.indexOf('\n');
        if (newlineIndex > -1) {
          district = district.substring(0, newlineIndex).trim();
        }
      }

      const roomsRegex = /Ist\.:\s*<b>([^<]+)<\/b>/;
      const roomsMatch = description.match(roomsRegex);
      if (roomsMatch && roomsMatch[1]) {
        const roomsValue = roomsMatch[1].trim();
        if (roomsValue !== 'Citi') {
          rooms = parseFloat(roomsValue);
        }
      }

      const areaRegex = /m2:\s*<b>([^<]+)<\/b>/;
      const areaMatch = description.match(areaRegex);
      if (areaMatch && areaMatch[1]) {
        area = parseFloat(areaMatch[1].trim());
      }

      const floorRegex = /Stāvs:\s*<b>([^<]+)<\/b>/;
      const floorMatch = description.match(floorRegex);
      if (floorMatch && floorMatch[1]) {
        floor = floorMatch[1].trim();
      }

      return {
        id,
        title,
        price: price || '',
        priceValue,
        pricePerM2,
        district,
        rooms,
        area,
        floor,
        category: 'flats',
        link,
        pubDate,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error parsing RSS item: ${errorMessage}`);

      this.failedListingService
        .logFailedListing({
          link: item.link?.[0] || 'unknown',
          title: item.title?.[0] || 'unknown',
          error: `RSS parsing error: ${errorMessage}`,
          rawData: JSON.stringify(item),
          failureType: 'PARSING_ERROR',
        })
        .catch((err) => {
          this.logger.error(
            `Failed to log parsing error: ${err instanceof Error ? err.message : String(err)}`,
          );
        });

      return {
        id: `error-${Date.now()}`,
        title: item.title?.[0] || 'Parsing Error',
        price: '',
        link: item.link?.[0] || '',
        category: 'flats',
        pubDate: new Date(),
      };
    }
  }

  /**
   * Store a parsed listing in the database
   */
  async storeListings(items: RssItem[]): Promise<number> {
    let storedCount = 0;

    for (const item of items) {
      const parsed = this.parseRssItem(item);

      if (parsed.id.startsWith('error-')) {
        continue;
      }

      try {
        await this.prisma.listing.upsert({
          where: { id: parsed.id },
          create: {
            id: parsed.id,
            title: parsed.title,
            price: parsed.price,
            priceValue: parsed.priceValue,
            pricePerM2: parsed.pricePerM2,
            district: parsed.district,
            rooms: parsed.rooms,
            area: parsed.area,
            floor: parsed.floor,
            category: parsed.category,
            link: parsed.link,
            pubDate: parsed.pubDate,
          },
          update: {},
        });
        storedCount++;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to store listing ${parsed.id}: ${errorMessage}`,
        );

        this.failedListingService
          .logFailedListing({
            listingId: parsed.id,
            title: parsed.title,
            link: parsed.link,
            error: `Database storage error: ${errorMessage}`,
            failureType: 'INVALID_DATA',
            additionalInfo: { parsed },
          })
          .catch((err) => {
            this.logger.error(
              `Failed to log database error: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }
    }

    return storedCount;
  }
}
